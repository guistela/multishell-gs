// Os subagentes além do agent.spawn: o que eles leem e escrevem pelo Bash
// acende a árvore, e os agentes de um workflow ganham o nome que o script lhes
// deu, a fase, o pedido e a resposta, lidos dos arquivos da execução.
import { expect, test } from 'claude-code/testing'

import { grafoDosAgentes } from '../hooks/graficos'
import type { NoDoGrafo } from '../hooks/graficos'
import { INICIO, SESSAO, doAgente, entrada, fimDoTurno, ligar, painel, subagente } from './motor'
import { noDesenho } from './achados'
import type { Achados } from './achados'

const MOD = 'csr-lens'
const PAINEL = { plugin: MOD, component: 'Pane', requestId: MOD } as const

const mostra = async (ui: Achados, texto: string | RegExp) => {
  expect(await noDesenho(ui, texto), `falta no desenho: ${String(texto)}`).toBe(true)
}

test('árvore: o que um subagente lê e escreve pelo Bash acende o arquivo', async ($, on) => {
  const motor = ligar(on)
  motor.responder = () => ({ result: { stdout: '', stderr: '', interrupted: false }, text: 'ok' })
  await $.session.start(INICIO)
  const explore = await $.agent.spawn(subagente('t1', 'Explore', 'ler a doc'))
  await $.tool.call(
    doAgente({ tool: 'Bash', command: "cd docs && cat guia.md | head -20 && sed -i 's/a/b/' ../src/frete.ts" }, explore.agentId),
  )

  const ui = await $.ui.mount({ ...PAINEL, surface: 'terminal', props: painel('dock', 100) })
  await ui.press({ key: 'aba-5' })
  await mostra(ui, /^guia\.md$/)
  await mostra(ui, /^frete\.ts$/)
  await ui.unmount()
})

test('workflow: o agente ganha o rótulo, a fase, o pedido e a resposta do journal', async ($, on) => {
  const motor = ligar(on)
  motor.sessao.env.HOME = '/casa'
  const sessao = `/casa/.claude/projects/-proj/${SESSAO}`
  const execucao = `${sessao}/subagents/workflows/wf_1`
  motor.listas['/casa/.claude/projects/-proj'] = [entrada(SESSAO, 'dir')]
  motor.listas[`${sessao}/subagents/workflows`] = [entrada('wf_1', 'dir')]
  motor.arquivos[`${execucao}/journal.jsonl`] = [
    { type: 'launched' },
    { type: 'started', key: 'k1', agentId: 'a1', label: 'pesquisa:site', phase: 'Pesquisa' },
    { type: 'started', key: 'k2', agentId: 'a2', label: 'pesquisa:cli', phase: 'Pesquisa' },
    { type: 'result', key: 'k1', agentId: 'a1', result: { resumo: 'Achei três fontes oficiais.' } },
  ]
    .map(linha => JSON.stringify(linha))
    .join('\n')
  motor.arquivos[`${execucao}/agent-a1.meta.json`] = JSON.stringify({ model: 'sonnet' })
  motor.arquivos[`${execucao}/agent-a1.jsonl`] = JSON.stringify({
    type: 'user',
    message: {
      role: 'user',
      content: '[Workflow harness — computed task] Moldura. The computed task text follows:\n  Pesquise o site oficial.\n  Cite as fontes.',
    },
  })
  motor.semTranscricao = ['a1', 'a2']
  // A ferramenta Workflow devolve o nome, o id da execução e a pasta dela.
  motor.responder = e =>
    e.tool === 'Workflow'
      ? { result: { status: 'async_launched', runId: 'wf_1', workflowName: 'pesquisa-de-plugins', transcriptDir: execucao }, text: 'ok' }
      : { result: { type: 'text' }, text: 'ok' }
  await $.session.start(INICIO)
  await $.tool.call({ tool: 'Workflow', script: "export const meta = { name: 'pesquisa-de-plugins' }" } as never)

  // O agente aparece pela primeira chamada de ferramenta (sem agent.spawn).
  await $.tool.call(doAgente({ tool: 'Read', file_path: '/proj/README.md' }, 'a1'))
  await $.turn.complete(fimDoTurno('w1', '', 9000, 'a1'))
  await motor.relogio.advance(3000)

  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop', props: painel('dock', 100) })

  // O painel abre na Visão geral: estes testes são da aba Agentes.

  if ((await ui.find({ key: 'aba-1' })) !== undefined) {

    await ui.press({ key: 'aba-1' })

  }
  // O workflow num cartão, agrupado por fase como no painel de tarefas do
  // Claude Code: o nome que o script deu a cada agente, e o outro agente (que
  // ainda não chamou nada) já na lista, rodando.
  const rotuloDe = async (id: string) => (await ui.find({ key: `ver-workflow-agente-${id}` }))?.props.label
  expect(await rotuloDe('a1')).toBe('pesquisa:site')
  expect(await rotuloDe('a2')).toBe('pesquisa:cli')
  await mostra(ui, /^Workflow pesquisa-de-plugins$/)
  await mostra(ui, /^Pesquisa$/)
  await mostra(ui, /^ {2}1\/2 {2}$/)
  await mostra(ui, /^ ● 1 rodando $/)
  // No grafo, a fase é um nó entre a conversa principal e os agentes dela.
  expect((await ui.findAll({ type: 'Svg' })).some(svg => String(svg.props.alt).includes('Pesquisa'))).toBe(true)

  // A execução é cancelada: o arquivo dela aparece, com o nome do workflow,
  // e quem não terminou fecha com falha no fim do turno da conversa principal.
  motor.arquivos[`${sessao}/workflows/wf_1.json`] = JSON.stringify({
    workflowName: 'pesquisa-de-plugins',
    status: 'killed',
    workflowProgress: [
      { type: 'workflow_agent', agentId: 'a1', state: 'done', durationMs: 9000 },
      { type: 'workflow_agent', agentId: 'a2', state: 'running', promptPreview: 'Pesquise o CLI.' },
    ],
  })
  await $.turn.complete(fimDoTurno('t1', 'Cancelei o workflow.', 20_000))
  await motor.relogio.advance(3000)
  await mostra(ui, /^ ✗ 1 falha $/)

  await ui.press({ key: 'ver-workflow-agente-a1' })
  // No Desktop, o cabeçalho é um painel desenhado: o nome, a fase e o modelo no alt.
  const cabecalho = String((await ui.findAll({ type: 'Svg' })).find(svg => String(svg.props.alt).includes(' · fase '))?.props.alt)
  expect(cabecalho).toContain('fase Pesquisa do workflow pesquisa-de-plugins')
  expect(cabecalho).toContain('Modelo Sonnet')
  expect(await ui.find({ type: 'Markdown', text: 'Pesquise o site oficial.\nCite as fontes.' })).toBeDefined()
  expect(
    await ui.find({ type: 'Markdown', text: /^Achei três fontes oficiais\.\n\n```json/ }),
    'a resposta é o resultado do journal',
  ).toBeDefined()
  await ui.unmount()
})

test('voltar refaz o caminho: turno → comando → turno → agente → turno', async ($, on) => {
  const motor = ligar(on)
  motor.responder = () => ({ result: { stdout: 'ok', stderr: '', interrupted: false }, text: 'ok' })
  await $.session.start(INICIO)
  await $.turn.start({ text: 'planeje', turnId: 't1' })
  const plan = await $.agent.spawn(subagente('p1', 'Plan', 'Planejar'))
  await $.tool.call(doAgente({ tool: 'Bash', command: 'npm test' }, plan.agentId))

  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop', props: painel('dock', 100) })
  await ui.press({ key: 'aba-4' })
  await ui.press({ key: 'ver-turno-1' })
  // Do turno, o comando do agente; o Voltar leva de volta ao turno.
  await mostra(ui, 'Comandos Bash')
  const botoes = await (ui as unknown as { findAll: (q: { type: string }) => Promise<{ key?: string }[]> }).findAll({ type: 'Button' })
  const comando = botoes.map(botao => String(botao.key)).find(chave => chave.startsWith('ver-comando-')) ?? ''
  await ui.press({ key: comando })
  await mostra(ui, 'Comando')
  await ui.press({ key: 'voltar' })
  expect((await ui.findAll({ type: 'Svg' })).some(svg => String(svg.props.alt).startsWith('Turno 1 · '))).toBe(true)
  // Do turno, o agente; do agente, o Voltar leva ao turno.
  await ui.press({ key: `ver-agente-${String(plan.agentId)}` })
  await mostra(ui, 'Últimas chamadas')
  await ui.press({ key: 'voltar' })
  expect((await ui.findAll({ type: 'Svg' })).some(svg => String(svg.props.alt).startsWith('Turno 1 · '))).toBe(true)
  await ui.unmount()
})

test('contexto: o total geral soma a conversa e os subagentes, em dólar e em reais', { options: { cotacaoDoDolar: 5 } }, async ($, on) => {
  const motor = ligar(on)
  await $.session.start(INICIO)
  const explore = await $.agent.spawn(subagente('t1', 'Explore', 'procurar'))
  // Uma resposta do modelo, depois da qual a sessão custa `usd`.
  const responder = async (usd: number, tamanho: number, agentId?: string) => {
    motor.uso = { startedAt: 0, context: { tokens: 50_000, window: 200_000, percent: 25 }, rateLimits: [], cost: { usd } }
    motor.passo = { input_tokens: tamanho, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'claude-opus-5-5' }
    const fluxo = $.turn.step({ turnId: 's1', index: 0, model: 'claude-opus-5-5', messageCount: 3, ...(agentId === undefined ? {} : { agentId }) })

    for (let pedaco = await fluxo.next(); pedaco.done !== true; pedaco = await fluxo.next()) {
      // lê até o fim
    }
  }
  await responder(1, 600_000)
  await responder(1.5, 300_000, explore.agentId)
  // Uma compactação não zera: a conversa segue somando.
  await $.session.measure({ ...motor.uso, changed: ['context'] })
  await responder(2, 100_000)
  await $.session.measure({ ...motor.uso, changed: ['cost'] })

  // Largo, no desktop: a grade num desenho.
  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop', props: painel('dock', 110) })
  await ui.press({ key: 'aba-3' })
  const grade = (await ui.findAll({ type: 'Svg' })).find(svg => String(svg.props.alt).startsWith('Total:'))
  expect(String(grade?.props.alt)).toBe(
    'Total: US$ 2,00, 1M tokens sem cache, 1M com cache; Conversa: US$ 1,50, 700k tokens sem cache, 700k com cache; Agentes: US$ 0,50, 300k tokens sem cache, 300k com cache',
  )
  expect(String(grade?.props.source)).toContain('R$ 10,00')
  expect(String(grade?.props.source)).toContain('R$ 7,50')
  expect(String(grade?.props.source)).toContain('R$ 2,50')
  await mostra(ui, /Em reais, a R\$ 5,00 por dólar\./)
  await ui.unmount()

  // No terminal, a mesma grade em texto.
  const terminal = await $.ui.mount({ ...PAINEL, surface: 'terminal', props: painel('dock', 110) })
  // O painel volta na aba em que estava.
  await mostra(terminal, /^US\$ 2,00 · R\$ 10,00 +$/)
  await mostra(terminal, /^US\$ 1,50 · R\$ 7,50 +$/)
  await mostra(terminal, /^US\$ 0,50 · R\$ 2,50 +$/)
  await terminal.unmount()
})

test('contexto: o que o último pedido somou, com e sem o cache relido, da conversa e dos agentes', async ($, on) => {
  const motor = ligar(on)
  await $.session.start(INICIO)
  const explore = await $.agent.spawn(subagente('t1', 'Explore', 'procurar'))
  const responder = async (usd: number, partes: { lido: number; gravado: number; novo: number; saida: number }, agentId?: string) => {
    motor.uso = { startedAt: 0, context: { tokens: 50_000, window: 200_000, percent: 25 }, rateLimits: [], cost: { usd } }
    motor.passo = {
      input_tokens: partes.novo,
      output_tokens: partes.saida,
      cache_read_input_tokens: partes.lido,
      cache_creation_input_tokens: partes.gravado,
      model: 'claude-opus-5-5',
    }
    const fluxo = $.turn.step({ turnId: 's1', index: 0, model: 'claude-opus-5-5', messageCount: 3, ...(agentId === undefined ? {} : { agentId }) })

    for (let pedaco = await fluxo.next(); pedaco.done !== true; pedaco = await fluxo.next()) {
      // lê até o fim
    }
  }

  await $.turn.start({ text: 'primeiro', turnId: 'a1' })
  await responder(1, { lido: 0, gravado: 100_000, novo: 0, saida: 1_000 })
  await $.turn.complete(fimDoTurno('a1', 'ok', 1000))
  await $.session.measure({ ...motor.uso, changed: ['cost'] })

  // O segundo pedido: a conversa relê o cache, e o agente começa gravando o dele.
  await $.turn.start({ text: 'segundo', turnId: 'a2' })
  await responder(1.5, { lido: 100_000, gravado: 0, novo: 4_000, saida: 1_000 })
  await responder(2, { lido: 0, gravado: 30_000, novo: 0, saida: 0 }, explore.agentId)
  await $.session.measure({ ...motor.uso, changed: ['cost'] })

  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop', props: painel('dock', 110) })
  await ui.press({ key: 'aba-3' })
  const fonte = String((await ui.findAll({ type: 'Svg' })).find(svg => String(svg.props.alt).startsWith('Total:'))?.props.source)
  expect(String((await ui.findAll({ type: 'Svg' })).find(svg => String(svg.props.alt).startsWith('Total:'))?.props.alt)).toBe(
    'Total: US$ 2,00 (▲ US$ 1,00), 136k tokens sem cache, 236k com cache; Conversa: US$ 1,50 (▲ US$ 0,50), 106k tokens sem cache, 206k com cache; Agentes: US$ 0,50 (▲ US$ 0,50), 30k tokens sem cache, 30k com cache',
  )
  // Sem cache, o segundo pedido somou 5k da conversa e 30k do agente; com o
  // cache relido, 105k da conversa.
  expect(fonte).toContain('>+35k</tspan>')
  expect(fonte).toContain('>+5k</tspan>')
  expect(fonte).toContain('▲ +105k')
  expect(fonte).toContain('75% do custo')
  await ui.unmount()
})

test('contexto: num turno longo, o círculo acompanha cada resposta, sem esperar o fim do turno', async ($, on) => {
  const motor = ligar(on)
  await $.session.start(INICIO)
  const responder = async (tokens: number, agentId?: string) => {
    motor.uso = { startedAt: 0, context: { tokens, window: 200_000, percent: Math.round((tokens / 200_000) * 100) }, rateLimits: [], cost: { usd: 1 } }
    motor.passo = { input_tokens: 1_000, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'claude-opus-5-5' }
    const fluxo = $.turn.step({ turnId: 's1', index: 0, model: 'claude-opus-5-5', messageCount: 3, ...(agentId === undefined ? {} : { agentId }) })

    for (let pedaco = await fluxo.next(); pedaco.done !== true; pedaco = await fluxo.next()) {
      // lê até o fim
    }
  }
  const circulo = async (ui: Awaited<ReturnType<typeof $.ui.mount>>) =>
    String((await ui.findAll({ type: 'Svg' })).find(svg => String(svg.props.alt).startsWith('Contexto '))?.props.alt)

  await $.turn.start({ text: 'faça muita coisa', turnId: 'a1' })
  await responder(50_000)
  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop', props: painel('dock', 110) })
  await ui.press({ key: 'aba-3' })
  expect(await circulo(ui)).toContain('25% usado')
  // O turno segue (sem session.measure, que só vem no fim): cada resposta da
  // conversa principal move o círculo; a de um subagente não.
  await responder(120_000)
  await motor.relogio.advance(3000)
  expect(await circulo(ui)).toContain('60% usado')
  const explore = await $.agent.spawn(subagente('t1', 'Explore', 'procurar'))
  motor.uso = { ...motor.uso, context: { tokens: 190_000, window: 200_000, percent: 95 } }
  await responder(190_000, explore.agentId)
  await motor.relogio.advance(3000)
  expect(await circulo(ui)).toContain('60% usado')
  await ui.unmount()
})

test('workflow: duas execuções do mesmo workflow ficam separadas; quem terminou sem ser visto entra', async ($, on) => {
  const motor = ligar(on)
  motor.sessao.env.HOME = '/casa'
  const sessao = `/casa/.claude/projects/-proj/${SESSAO}`
  motor.listas['/casa/.claude/projects/-proj'] = [entrada(SESSAO, 'dir')]
  motor.listas[`${sessao}/subagents/workflows`] = [entrada('wf_1', 'dir'), entrada('wf_2', 'dir')]
  const journal = (linhas: object[]) => linhas.map(linha => JSON.stringify(linha)).join('\n')
  // A primeira execução terminou com falha num agente; a segunda roda.
  motor.arquivos[`${sessao}/subagents/workflows/wf_1/journal.jsonl`] = journal([
    { type: 'started', key: 'k1', agentId: 'a1', label: 'verifica:docs', phase: 'Verificação' },
  ])
  motor.arquivos[`${sessao}/workflows/wf_1.json`] = JSON.stringify({
    workflowName: 'revisao',
    status: 'failed',
    workflowProgress: [{ type: 'workflow_agent', agentId: 'a1', state: 'failed', durationMs: 4000 }],
  })
  motor.arquivos[`${sessao}/subagents/workflows/wf_2/journal.jsonl`] = journal([
    { type: 'started', key: 'k2', agentId: 'b1', label: 'verifica:docs', phase: 'Verificação' },
    { type: 'started', key: 'k3', agentId: 'b2', label: 'verifica:codigo', phase: 'Verificação' },
    { type: 'result', key: 'k3', agentId: 'b2', result: 'Sem problemas.' },
  ])
  motor.semTranscricao = ['a1', 'b1', 'b2']
  motor.responder = e =>
    e.tool === 'Workflow'
      ? { result: { runId: 'wf_2', workflowName: 'revisao', transcriptDir: `${sessao}/subagents/workflows/wf_2` }, text: 'ok' }
      : { result: { type: 'text' }, text: 'ok' }
  await $.session.start(INICIO)
  await $.tool.call({ tool: 'Workflow', script: "export const meta = { name: 'revisao' }" } as never)
  await $.tool.call(doAgente({ tool: 'Read', file_path: '/proj/README.md' }, 'b1'))
  await motor.relogio.advance(3000)

  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop', props: painel('dock', 100) })

  // O painel abre na Visão geral: estes testes são da aba Agentes.

  if ((await ui.find({ key: 'aba-1' })) !== undefined) {

    await ui.press({ key: 'aba-1' })

  }
  // Dois cartões, um por execução, com o mesmo nome.
  const cartoes = JSON.stringify(await ui.drawn()).match(/"key":"workflow-wf_\d"/g) ?? []
  expect([...new Set(cartoes)]).toEqual(['"key":"workflow-wf_2"', '"key":"workflow-wf_1"'])
  // O agente que terminou sem nenhuma chamada vista (b2) entra, concluído;
  // o da execução que falhou (a1), com falha.
  expect((await ui.find({ key: 'ver-workflow-agente-b2' }))?.props.label).toBe('verifica:codigo')
  await mostra(ui, /^ ✗ 1 falha $/)
  // Com o filtro "Com falha", a fase da execução que falhou fica acesa.
  await ui.press({ key: 'grafo-filtro-falhou' })
  const grafo = String((await ui.findAll({ type: 'Svg' })).find(svg => String(svg.props.alt).startsWith('A conversa principal'))?.props.source ?? '')
  expect(grafo).toMatch(/<g class="no na\d+">(?:(?!<\/g>).)*?>Verificação</)
  await ui.unmount()
})

test('hand-back: o relatório da SubagentHandback é a resposta, também de quem roda em primeiro plano', async ($, on) => {
  const motor = ligar(on)
  motor.responder = () => ({ result: { success: true }, text: 'Report delivered to your caller.' })
  await $.session.start(INICIO)
  await $.turn.start({ text: 'agentes aninhados', turnId: 't1' })
  const um = await $.agent.spawn(subagente('n1', 'general-purpose', 'Agente nível 1'))
  const dois = await $.agent.spawn({
    ...subagente('n2', 'general-purpose', 'Count backoffice ADR folders'),
    parentAgentId: um.agentId,
    background: false,
  })
  // O nível 2 entrega ao nível 1 e termina sem texto final.
  await $.tool.call(doAgente({ tool: 'SubagentHandback', message: 'NÍVEL 2: backoffice tem 1 ADR' }, dois.agentId))
  await $.turn.complete(fimDoTurno('d2', '', 400, dois.agentId))
  await $.tool.call(doAgente({ tool: 'SubagentHandback', message: 'NÍVEL 1: core-api tem 3 ADRs' }, um.agentId))
  await $.turn.complete(fimDoTurno('d1', '', 900, um.agentId))
  await $.turn.complete(fimDoTurno('t1', 'Agente lançado.', 1000))
  // O nível 1 roda em segundo plano: volta ao loop principal dentro da moldura.
  await $.turn.start({
    text: `<agent-message from="${String(um.agentId)}">[Subagent hand-back] Avisos do Claude Code. The report follows:\n  NÍVEL 1: core-api tem 3 ADRs</agent-message>`,
    turnId: 't2',
  })
  await $.turn.complete(fimDoTurno('t2', 'Pronto.', 500))

  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop', props: painel('dock', 100) })

  // O painel abre na Visão geral: estes testes são da aba Agentes.

  if ((await ui.find({ key: 'aba-1' })) !== undefined) {

    await ui.press({ key: 'aba-1' })

  }
  await ui.press({ key: `ver-agente-${String(dois.agentId)}` })
  expect(await ui.find({ type: 'Markdown', text: 'NÍVEL 2: backoffice tem 1 ADR' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Sem texto de resposta.' })).toBeUndefined()
  await ui.press({ key: 'voltar' })
  await ui.press({ key: `ver-agente-${String(um.agentId)}` })
  expect(await ui.find({ type: 'Markdown', text: 'NÍVEL 1: core-api tem 3 ADRs' })).toBeDefined()
  expect(await ui.find({ type: 'Markdown', text: /Subagent hand-back|report follows/ })).toBeUndefined()
  await ui.unmount()
})

test('grafo: com um agente criando outro, a árvore cresce para os dois lados do cérebro', async () => {
  const no = (id: string, rotulo: string, pai = 'principal'): NoDoGrafo => ({
    id,
    pai,
    rotulo,
    tipo: 'general-purpose',
    estado: 'ok',
    escopo: 'embutido',
    titulo: rotulo,
    dica: '',
  })
  const nos = [
    no('n1', 'Agente nível 1 (demo aninhado)'),
    no('n2', 'Count backoffice ADR folders', 'n1'),
    no('p1', 'Pergunta simples 1'),
    no('p2', 'Pergunta simples 2'),
    no('p3', 'Pergunta simples 3'),
    no('p4', 'Pergunta simples 4'),
  ]
  const principal = { isTrabalhando: false, dica: '' }

  // Painel largo (a 150%): as primeiras à direita, o resto à esquerda, o neto
  // mais para fora do lado do pai, e os nomes inteiros.
  const largo = grafoDosAgentes(nos, [], principal, 1300, { escala: 1.5 })
  const lado = (id: string) => largo.pontos.find(ponto => ponto.id === id)
  expect(['n1', 'n2', 'p1', 'p2'].map(id => lado(id)?.isDireita)).toEqual([true, true, true, true])
  expect(['p3', 'p4'].map(id => lado(id)?.isDireita)).toEqual([false, false])
  expect(lado('n2')?.x ?? 0).toBeGreaterThan(lado('n1')?.x ?? 0)
  expect(lado('n1')?.cabe ?? 0).toBeGreaterThanOrEqual([...'Agente nível 1 (demo aninhado)'].length)
  expect(lado('n2')?.cabe ?? 0).toBeGreaterThanOrEqual([...'Count backoffice ADR folders'].length)

  // Painel estreito: sem lugar para os dois lados, a árvore fica à direita.
  const estreito = grafoDosAgentes(nos, [], principal, 700, { escala: 1 })
  expect(estreito.pontos.every(ponto => ponto.isDireita)).toBe(true)
})

test('seções que dobram: o ▾ ao lado do título fecha a seção, o ▸ abre, e ela fica como foi deixada', async ($, on) => {
  const motor = ligar(on)
  motor.responder = () => ({ result: { stdout: 'ok', stderr: '', interrupted: false }, text: 'ok' })
  await $.session.start(INICIO)
  const plan = await $.agent.spawn(subagente('p1', 'Plan', 'Planejar'))
  await $.tool.call(doAgente({ tool: 'Bash', command: 'npm test' }, plan.agentId))

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PAINEL, surface, props: painel('dock', 100) })
    // O painel abre na Visão geral: estes testes são da aba Agentes.
    if ((await ui.find({ key: 'aba-1' })) !== undefined) {
      await ui.press({ key: 'aba-1' })
    }
    await ui.press({ key: `ver-agente-${String(plan.agentId)}` })
    // No terminal, o ▾ é o botão; no app, a barra do título inteira, com a seta dentro.
    const seta = async () =>
      surface === 'terminal'
        ? (await ui.find({ key: 'dobra-agente:chamadas' }))?.props.label
        : String((await ui.findAll({ type: 'Svg' })).find(svg => String(svg.props.alt).includes('Últimas chamadas'))?.props.alt).slice(0, 1)
    expect(await seta()).toBe('▾')
    // A chamada é um botão (abre a entrada e a saída dela).
    const chamada = async () => (await ui.findAll({ type: 'Button' })).find(botao => botao.props.label === 'Bash npm test')
    expect(await chamada()).toBeDefined()
    await ui.press({ key: 'dobra-agente:chamadas' })
    expect(await seta()).toBe('▸')
    expect(await chamada()).toBeUndefined()
    // As outras seções seguem abertas.
    await mostra(ui, 'Pedido que o agente recebeu')
    await ui.press({ key: 'dobra-agente:chamadas' })
    expect(await chamada()).toBeDefined()
    await ui.press({ key: 'voltar' })
    await ui.unmount()
  }
})

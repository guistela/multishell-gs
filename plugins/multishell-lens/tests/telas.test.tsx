// O que mudou no desenho das abas: as falhas no detalhe do turno, o diff que
// quebra as linhas longas e a linha do tempo que acende o nó no grafo.

import { expect, test } from 'claude-code/testing'

import { desenharDiff } from '../hooks/diff-svg'
import { diaEHora } from '../hooks/formato'
import { cabecalhoDoItem } from '../hooks/graficos'
import { INICIO, doAgente, entrada, fimDoTurno, ligar, painel, subagente } from './motor'
import { noDesenho } from './achados'

const PAINEL = { plugin: 'csr-lens', component: 'Pane', requestId: 'csr-lens' } as const

test('turno com falha: o detalhe diz qual chamada falhou, de quem e por quê', async ($, on) => {
  const motor = ligar(on)
  motor.responder = e =>
    e.tool === 'Write'
      ? { isError: true, text: 'Permissão negada: o modo automático não avaliou a escrita', result: {} }
      : { result: { tool: e.tool }, text: 'ok' }
  await $.session.start(INICIO)
  await $.turn.start({ text: 'escreva o arquivo', turnId: 't1' })
  await $.tool.call({ tool: 'Read', file_path: '/proj/a.ts' })
  await $.tool.call({ tool: 'Write', file_path: '/proj/b.ts', content: 'x' })
  await $.turn.complete(fimDoTurno('t1', 'não consegui escrever', 1000))

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PAINEL, surface, props: painel('dock', 100) })
    await ui.press({ key: 'aba-4' })
    await ui.press({ key: 'ver-turno-1' })
    expect(await noDesenho(ui, 'Falhas')).toBe(true)
    expect(await noDesenho(ui, /^Write$/)).toBe(true)
    expect(await noDesenho(ui, /Permissão negada: o modo automático não avaliou a escrita/)).toBe(true)
    await ui.press({ key: 'voltar' })
    await ui.press({ key: 'aba-1' })
    await ui.unmount()
  }
})

test('diff: a linha mais longa que o desenho quebra, com ↪ na continuação, e nada some', () => {
  const longa = `const texto = '${'a'.repeat(300)}'`
  const desenho = desenharDiff(`@@ -1,1 +1,1 @@\n-const texto = ''\n+${longa}`, 600)
  // 600 px dão umas 70 letras: a linha de 317 vira 5 fileiras.
  expect(desenho.source.match(/>↪</g)?.length).toBe(4)
  expect(desenho.source).not.toContain('… mais')
  expect(desenho.height).toBeGreaterThan(5 * 18)
})

test('linha do tempo: o nome e o nó do agente no grafo acendem juntos; o nome cortado tem dica', async ($, on) => {
  ligar(on)
  await $.session.start(INICIO)
  const longo = 'Mapear o fluxo inteiro do carrinho, do pedido até o pagamento e a nota fiscal'
  const agente = await $.agent.spawn(subagente('t1', 'Explore', longo))
  await $.agent.spawn(subagente('t2', 'Plan', 'Planejar'))
  await $.tool.call(doAgente({ tool: 'Read', file_path: '/proj/a.ts' }, agente.agentId))

  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop', props: painel('dock', 100) })

  // O painel abre na Visão geral: estes testes são da aba Agentes.

  if ((await ui.find({ key: 'aba-1' })) !== undefined) {

    await ui.press({ key: 'aba-1' })

  }
  const desenho = JSON.stringify(await ui.drawn())
  const escopo = `"scope":"ag-${String(agente.agentId)}"`
  // A linha da linha do tempo, o nó do grafo e o anel em volta dele: o mesmo grupo.
  expect(desenho.split(escopo).length - 1).toBeGreaterThanOrEqual(3)
  // O nome não cabe na coluna: a dica com o nome inteiro, aberta pelo mouse.
  expect(await noDesenho(ui, longo)).toBe(true)
  await ui.unmount()
})

test('linha do tempo: o dia e a hora em que a sessão começou, no fuso do computador', () => {
  expect(diaEHora(new Date(2026, 9, 5, 20, 30).getTime())).toBe('05/10 às 20:30')
  expect(diaEHora(new Date(2026, 0, 9, 7, 5).getTime())).toBe('09/01 às 07:05')
})

test('linha do tempo: a conversa principal no alto, com quando ela pensou', async ($, on) => {
  const motor = ligar(on)
  await $.session.start(INICIO)
  await $.turn.start({ text: 'investigue o carrinho', turnId: 't1' })
  await motor.relogio.advance(2000)
  await $.agent.spawn(subagente('a1', 'Explore', 'Mapear o carrinho'))
  await motor.relogio.advance(5000)
  await $.turn.complete(fimDoTurno('t1', 'pronto', 7000))

  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop', props: painel('dock', 100) })

  // O painel abre na Visão geral: estes testes são da aba Agentes.

  if ((await ui.find({ key: 'aba-1' })) !== undefined) {

    await ui.press({ key: 'aba-1' })

  }
  expect(await noDesenho(ui, '✦ Principal')).toBe(true)
  const barras = (await ui.findAll({ type: 'Svg' })).map(svg => String(svg.props.alt))
  expect(barras.some(alt => alt.startsWith('Principal: pensou'))).toBe(true)
  // Ao lado do título, só quando a sessão começou.
  expect(await noDesenho(ui, /sessão iniciada em \d\d\/\d\d às \d\d:\d\d/)).toBe(true)
  await ui.unmount()
})

test('visão geral: abre primeiro; cada indicador leva à aba dele; o turno e a edição abrem o detalhe', async ($, on) => {
  const motor = ligar(on)
  await $.session.start(INICIO)
  await $.turn.start({ text: 'ajuste o frete', turnId: 't1' })
  const explore = await $.agent.spawn(subagente('a1', 'Explore', 'Mapear o carrinho'))
  await $.tool.call(doAgente({ tool: 'Read', file_path: '/proj/src/a.ts' }, explore.agentId))
  await $.tool.call({ tool: 'Write', file_path: '/proj/src/frete.ts', content: 'export const frete = 1\n' })
  await motor.relogio.advance(3000)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PAINEL, surface, props: painel('dock', 110) })
    // Abre na Visão geral, com os indicadores, o agora, o último turno e as edições.
    expect(await noDesenho(ui, ' ◉ Visão geral ')).toBe(true)
    if (surface === 'desktop') {
      const indicadores = String((await ui.findAll({ type: 'Svg' })).find(svg => String(svg.props.alt).startsWith('Indicadores'))?.props.alt)
      expect(indicadores).toContain('Agentes 1 rodando')
      expect(indicadores).toContain('Turnos 1')
    }
    expect(await noDesenho(ui, /pensando há/)).toBe(true)
    expect((await ui.find({ key: `visao-agente-${String(explore.agentId)}` }))?.props.label).toBe('Mapear o carrinho (Explore)')
    expect((await ui.find({ key: 'visao-arquivo-/proj/src/frete.ts' }))?.props.label).toBe('src/frete.ts')
    // No último turno, entre a pergunta e a resposta, os agentes que ele chamou,
    // cada um numa linha que abre o detalhe.
    expect(await noDesenho(ui, 'Agentes que ele chamou · 1')).toBe(true)
    expect(await ui.find({ key: `curta-abrir-${String(explore.agentId)}` })).toBeDefined()

    // O indicador de agentes leva à aba Agentes.
    await ui.press({ key: 'visao-Agentes' })
    expect(await noDesenho(ui, ' ◈ Agentes ')).toBe(true)
    await ui.press({ key: 'aba-0' })
    // O último turno abre o detalhe dele, e o Voltar traz de volta.
    await ui.press({ key: 'visao-abrir-turno' })
    expect(await ui.find({ key: 'voltar' })).toBeDefined()
    await ui.press({ key: 'voltar' })
    // O ▸ diff abre o diff da edição ali mesmo; de novo, fecha.
    await ui.press({ key: 'visao-diff-/proj/src/frete.ts' })
    if (surface === 'desktop') {
      expect((await ui.findAll({ type: 'Svg' })).some(svg => String(svg.props.alt).startsWith('Diff:'))).toBe(true)
    } else {
      expect(await ui.find({ type: 'Code' })).toBeDefined()
    }
    await ui.press({ key: 'visao-diff-/proj/src/frete.ts' })
    // O nome leva ao Diffs, já no arquivo.
    await ui.press({ key: 'visao-arquivo-/proj/src/frete.ts' })
    expect(await noDesenho(ui, ' ◧ Diffs ')).toBe(true)
    expect(await ui.find({ key: 'arquivo-/proj/src/frete.ts' })).toBeDefined()
    await ui.press({ key: 'aba-0' })
    await ui.unmount()
  }
})

test('agentes disponíveis: os instalados aparecem desde o começo, na cor da origem; o chamado acende', async ($, on) => {
  const motor = ligar(on)
  motor.sessao.env.HOME = '/casa'
  motor.listas['/casa/.claude/agents'] = [entrada('revisor.md', 'file')]
  motor.arquivos['/casa/.claude/agents/revisor.md'] = '---\nname: revisor\ndescription: Revisa o código.\n---\nRevise.'
  motor.listas['/proj/.claude/agents'] = [entrada('critico.md', 'file')]
  motor.arquivos['/proj/.claude/agents/critico.md'] = '---\nname: critico\ndescription: Segunda opinião.\n---\nCritique.'
  await $.session.start(INICIO)
  // O inventário espera a sessão terminar de carregar.
  await motor.relogio.advance(3500)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PAINEL, surface, props: painel('dock', 110) })
    // Antes de qualquer chamada: os dois, apagados, "ainda não chamado".
    expect(await noDesenho(ui, 'Agentes disponíveis')).toBe(true)
    expect(await noDesenho(ui, /revisor.*global.*ainda não chamado/)).toBe(true)
    expect(await noDesenho(ui, /critico.*projeto.*ainda não chamado/)).toBe(true)
    await ui.unmount()
  }

  // O global é chamado: ele acende, com quantas vezes; o do projeto segue apagado.
  const revisor = await $.agent.spawn(subagente('t1', 'revisor', 'Revisar o plano'))
  await motor.relogio.advance(3000)
  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop', props: painel('dock', 110) })
  expect(await noDesenho(ui, /revisor · global · rodando agora · 1 vez/)).toBe(true)
  expect(await noDesenho(ui, /critico · projeto · ainda não chamado/)).toBe(true)
  // Um clique no cartão abre a execução dele.
  await ui.press({ key: 'disponivel-revisor' })
  expect(await ui.find({ key: 'voltar' })).toBeDefined()
  await ui.press({ key: 'voltar' })
  // Na aba Agentes, o cartão dele leva a pílula da origem.
  await ui.press({ key: 'aba-1' })
  expect(await noDesenho(ui, /^ global $/)).toBe(true)
  expect(String((await ui.findAll({ type: 'Svg' })).find(svg => String(svg.props.alt).startsWith('A conversa principal'))?.props.source)).toContain('borda-global')
  expect(revisor.agentId).toBeDefined()
  await ui.unmount()

  // O do projeto nasce com um fornecedor que não é o motor (como no app): a
  // origem vem do inventário, e o cartão diz "projeto", não "plugin".
  await $.agent.spawn({
    ...subagente('t2', 'critico', 'Criticar o plano'),
    provider: { plugin: 'projectSettings', tier: 'user' } as unknown as ReturnType<typeof subagente>['provider'],
  })
  await motor.relogio.advance(3000)
  const agentes = await $.ui.mount({ ...PAINEL, surface: 'desktop', props: painel('dock', 110) })
  if ((await agentes.find({ key: 'aba-1' })) !== undefined) {
    await agentes.press({ key: 'aba-1' })
  }
  const pilulas = (await agentes.findAll({ type: 'Svg' })).map(svg => String(svg.props.alt))
  expect(pilulas.some(alt => alt.startsWith('projeto · '))).toBe(true)
  expect(pilulas.some(alt => alt.startsWith('plugin · '))).toBe(false)
  await agentes.unmount()
})


test('inventário: um marketplace grande no "Para instalar" abre com 30 itens, e o "Mostrar mais" soma outros 30', async ($, on) => {
  const motor = ligar(on)
  motor.sessao.env.HOME = '/casa'
  motor.arquivos['/casa/.claude/plugins/known_marketplaces.json'] = JSON.stringify({ grande: { installLocation: '/mk/g' } })
  motor.arquivos['/mk/g/.claude-plugin/marketplace.json'] = JSON.stringify({
    plugins: Array.from({ length: 208 }, (_, i) => ({ name: `plugin-${String(i).padStart(3, '0')}`, description: `Plugin ${i}`, category: 'skill' })),
  })
  await $.session.start(INICIO)
  await motor.relogio.advance(3500)
  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop', props: painel('dock', 110) })
  await ui.press({ key: 'aba-6' })
  await ui.press({ key: 'inv-disponivel' })
  const quantos = async () => (await ui.findAll({ type: 'Text', text: /^plugin-\d{3}$/ })).length
  expect(await quantos()).toBe(30)
  expect(await noDesenho(ui, /^30 de \d+ · o filtro procura em todos$/)).toBe(true)
  await ui.press({ key: 'inventario-mais' })
  expect(await quantos()).toBe(60)
  // Outra seção, e a volta: de novo os primeiros 30.
  await ui.press({ key: 'inv-plugin' })
  await ui.press({ key: 'inv-disponivel' })
  expect(await quantos()).toBe(30)
  await ui.unmount()
})

test('recados: o turno mostra só os agentes chamados nele; o detalhe do agente mostra os recados dele', async ($, on) => {
  const motor = ligar(on)
  await $.session.start(INICIO)
  // Turno 1: o coordenador nasce e cria o agente de Kyoto.
  await $.turn.start({ text: 'consulte as temperaturas', turnId: 't1' })
  const coordenador = await $.agent.spawn(subagente('c1', 'general-purpose', 'Coordenar as temperaturas'))
  const kyoto = await $.agent.spawn({ ...subagente('k1', 'general-purpose', 'Temperatura de Kyoto'), parentAgentId: coordenador.agentId })
  await $.turn.complete(fimDoTurno('t1', 'feito', 1000))
  await motor.relogio.advance(5000)
  // Turno 2: um agente novo pede a previsão ao coordenador, que repassa ao de Kyoto.
  await $.turn.start({ text: 'peça a previsão de Kyoto', turnId: 't2' })
  const pedir = await $.agent.spawn(subagente('p1', 'general-purpose', 'Pedir previsão de Kyoto'))
  const recado = (de: string | undefined, para: string | undefined, text: string) =>
    $.session.send({ to: String(para), text, origin: { kind: 'model' }, ...(de === undefined ? {} : { agentId: de }) })
  await recado(pedir.agentId, coordenador.agentId, 'qual a previsão de Kyoto?')
  await recado(coordenador.agentId, kyoto.agentId, 'consulte a previsão')
  await recado(kyoto.agentId, coordenador.agentId, 'sol, 21 °C')
  await recado(coordenador.agentId, pedir.agentId, 'sol, 21 °C')
  await $.turn.complete(fimDoTurno('t2', 'pronto', 1000))
  await motor.relogio.advance(3000)

  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop', props: painel('dock', 110) })
  // Na Visão geral, o último turno: só o que ele chamou (os dois de antes, que
  // só trocaram recados neste turno, ficam no turno 1).
  expect(await noDesenho(ui, 'Agentes que ele chamou · 1')).toBe(true)
  expect(await noDesenho(ui, /Por recado/)).toBe(false)
  expect(await ui.find({ key: `curta-abrir-${String(kyoto.agentId)}` })).toBeUndefined()
  // No detalhe do agente: os recados dele e, no grafo, com quem ele conversou.
  await ui.press({ key: `curta-abrir-${String(pedir.agentId)}` })
  expect(await noDesenho(ui, /Com quem ele conversou/)).toBe(true)
  // A pergunta e a resposta entre os dois: uma curva só, com seta nas duas pontas.
  const grafo = String((await ui.findAll({ type: 'Svg' })).find(svg => String(svg.props.source).includes('alvo-recado'))?.props.source)
  expect(grafo.match(/class="alvo-recado/g)?.length).toBe(1)
  expect(grafo).toContain('marker-start="url(#seta)"')
  expect(grafo).toContain('✉ 2')
  // Quem não se liga direto a ele fica fraco; ele, quem o criou e com quem
  // conversou, não. Aqui todos se ligam a ele (o Principal o criou).
  expect(grafo).not.toMatch(/class="no na\d+ apagado/)
  expect(await noDesenho(ui, /Recados/)).toBe(true)
  expect(await noDesenho(ui, /→ para/)).toBe(true)
  expect(await noDesenho(ui, '"qual a previsão de Kyoto?"')).toBe(true)
  expect(await noDesenho(ui, /← de/)).toBe(true)
  await ui.press({ key: 'voltar' })
  // O de Kyoto foi criado pelo coordenador e só falou com ele: a conversa
  // principal, que só liga a árvore, fica fraca.
  await ui.press({ key: 'aba-1' })
  await ui.press({ key: `ver-agente-${String(kyoto.agentId)}` })
  const deKyoto = String((await ui.findAll({ type: 'Svg' })).find(svg => String(svg.props.source).includes('alvo-recado'))?.props.source)
  expect(deKyoto).toMatch(/<g class="no na\d+ apagado">/)
  await ui.press({ key: 'voltar' })
  // No detalhe do turno 2, também só o que ele chamou.
  await ui.press({ key: 'aba-4' })
  await ui.press({ key: 'ver-turno-2' })
  expect(await noDesenho(ui, /Subagentes · 1/)).toBe(true)
  expect(await noDesenho(ui, /por recado/)).toBe(false)
  await ui.unmount()
})

test('cores: a aba, o hover dela e o caminho têm a mesma cor, o hex do tom', async ($, on) => {
  ligar(on)
  await $.session.start(INICIO)
  await $.turn.start({ text: 'conte', turnId: 't1' })
  const contador = await $.agent.spawn(subagente('c1', 'Explore', 'Contar seções do README'))
  await $.turn.complete(fimDoTurno('t1', 'feito', 1000))

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PAINEL, surface, props: painel('dock', 110) })
    // Na Visão geral, as abas fechadas acendem na cor delas (a Visão geral
    // em azul-celeste, Agentes em ciano), e não na laranja do tema.
    const hoverDaAba = async (aba: number) =>
      new RegExp(`"key":"aba-${aba}"[^}]*\\},"press":\\{[^}]*\\},"hover":\\{"color":"(#[0-9a-f]{6})","bold":true\\}`).exec(JSON.stringify(await ui.drawn()))?.[1]
    // (O painel volta onde ficou: na segunda superfície, já na aba Agentes.)
    if ((await ui.find({ key: 'aba-1' })) !== undefined) {
      await ui.press({ key: 'aba-1' })
    }
    expect(await hoverDaAba(0)).toBe('#0d80bf')
    expect(await hoverDaAba(4)).toBe('#a371f7')
    await ui.press({ key: 'aba-0' })
    expect(await hoverDaAba(1)).toBe('#39c5cf')
    // O caminho: o item atual na cor da aba (ciano na aba Agentes).
    await ui.press({ key: 'aba-1' })
    await ui.press({ key: `ver-agente-${String(contador.agentId)}` })
    const desenho = JSON.stringify(await ui.drawn())
    expect(desenho).toContain('{"type":"Text","props":{"bold":true,"color":"#39c5cf"},"children":["Contar seções do README"]}')
    expect(desenho).not.toContain('"color":"planMode"')
    expect(desenho).not.toContain('"color":"claude"')
    await ui.press({ key: 'caminho-aba' })
    await ui.unmount()
  }
})

test('cabeçalho em painel: o selo do estado fica depois do fim do nome, sem cobri-lo', () => {
  const item = { titulo: 'Contar seções do README', estado: { texto: '✓ concluído', cor: 'verde' as const }, ladrilhos: [] }
  const largo = cabecalhoDoItem(item, 760)
  const selo = /<rect class="c-verde" x="([\d.]+)"/.exec(largo.source)
  // Com lugar, o nome inteiro e o selo depois dele (23 px em negrito: uns 13 px por letra).
  expect(largo.source).toContain('>Contar seções do README<')
  expect(Number(selo?.[1])).toBeGreaterThanOrEqual('Contar seções do README'.length * 13)
  // Sem lugar, o nome é cortado antes de o selo entrar em cima dele.
  const estreito = cabecalhoDoItem(item, 320)
  const cortado = /font-size="23" font-weight="700">([^<]+)</.exec(estreito.source)?.[1] ?? ''
  const seloEstreito = Number(/<rect class="c-verde" x="([\d.]+)"/.exec(estreito.source)?.[1])
  expect(cortado.endsWith('…')).toBe(true)
  expect(seloEstreito).toBeGreaterThanOrEqual([...cortado].length * 13)
})

test('navegação: um turno aberto da Visão geral tem o caminho "Visão geral › Turno N", com o Voltar na mesma linha', async ($, on) => {
  ligar(on)
  await $.session.start(INICIO)
  await $.turn.start({ text: 'ajuste o frete', turnId: 't1' })
  await $.turn.complete(fimDoTurno('t1', 'feito', 1000))

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PAINEL, surface, props: painel('dock', 110) })
    expect(await ui.find({ key: 'voltar' })).toBeUndefined()
    await ui.press({ key: 'visao-abrir-turno' })
    // O Voltar e o caminho, na mesma caixa, logo abaixo das abas.
    const desenho = JSON.stringify(await ui.drawn())
    expect(desenho).toMatch(/"key":"caminho"[^]*"key":"voltar"[^]*"key":"caminho-aba","label":"◉ Visão geral"[^]*"key":"caminho-atual"[^]*"children":\["Turno 1"\]/)
    expect((await ui.find({ key: 'voltar' }))?.props.hotkey).toBe('v')
    await ui.press({ key: 'voltar' })
    expect(await ui.find({ key: 'voltar' })).toBeUndefined()
    expect(JSON.stringify(await ui.drawn())).toContain('"children":["◉ Visão geral"]')
    await ui.unmount()
  }
})

test('visão geral sem agentes: o cérebro pensando aparece, e o tempo dele anda com o relógio', async ($, on) => {
  const motor = ligar(on)
  await $.session.start(INICIO)
  await $.turn.start({ text: 'escreva um post', turnId: 't1' })
  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop', props: painel('dock', 110) })
  expect(await noDesenho(ui, /Quem chamou quem/), 'passo 1').toBe(true)
  const cerebro = (await ui.findAll({ type: 'Svg' })).find(svg => String(svg.props.source).includes('pensando…'))
  expect(cerebro, 'passo 2').toBeDefined()
  expect(await noDesenho(ui, /pensando há 0s/), 'passo 3').toBe(true)
  await motor.relogio.advance(5000)
  // O painel redesenha no máximo a cada 2,5 s (para não perder cliques).
  expect(await noDesenho(ui, /pensando há [1-9]s/), 'passo 4').toBe(true)
  await $.turn.complete(fimDoTurno('t1', 'feito', 5000))
  await motor.relogio.advance(3000)
  expect(await noDesenho(ui, /Quem chamou quem/), 'passo 5').toBe(false)
  await ui.unmount()
})

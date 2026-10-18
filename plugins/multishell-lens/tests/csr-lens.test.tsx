import type { SessionUsage, ToolCallResult } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import {
  AGORA,
  COMANDO,
  comRepositorio,
  entrada,
  INICIO,
  SUPERFICIES,
  doAgente,
  faixa,
  fimDoTurno,
  ligar,
  painel,
  subagente,
} from './motor'
import { noDesenho } from './achados'

const MOD = 'csr-lens'
// As cores de texto do mod são o hex dos tons (hooks/cores.ts), os mesmos
// dos selos e das barras: azul roda, verde deu certo, vermelho falhou, âmbar
// foi alterado ou está no meio da escala; ciano é a aba Agentes e o
// azul-celeste, a marca e a Visão geral.
const AZUL = '#58a6ff'
const VERDE = '#3fb950'
const VERMELHO = '#f85149'
const AMBAR = '#d29922'
const CIANO = '#39c5cf'
const LARANJA = '#f0883e'
const PAINEL = { plugin: MOD, component: 'Pane', requestId: MOD } as const

type Achados = {
  find: (query: { type?: string; key?: string; text?: string | RegExp }) => Promise<
    { text: string; props: Record<string, unknown> } | undefined
  >
  findAll: (query: { type?: string; key?: string; text?: string | RegExp }) => Promise<
    { text: string; props: Record<string, unknown> }[]
  >
}

// O desenho mostra um texto (em qualquer Text, por inclusão ou padrão, ou no
// alt de um desenho: no app, os selos e os títulos são pílulas e barras).
const mostra = async (ui: Achados, texto: string | RegExp) => {
  expect(await noDesenho(ui, texto), `falta no desenho: ${String(texto)}`).toBe(true)
}

// Os números em etiquetas: cada um num selo próprio (" texto ").
const mostraEtiquetas = async (ui: Achados, textos: readonly string[]) => {
  for (const texto of textos) {
    await mostra(ui, ` ${texto} `)
  }
}

const naoMostra = async (ui: Achados, texto: string | RegExp) => {
  expect(await noDesenho(ui, texto), `sobra no desenho: ${String(texto)}`).toBe(false)
}

// A cor do Text que mostra exatamente esse trecho (a marca, a aba ativa).
const corDe = async (ui: Achados, texto: string | RegExp) =>
  (await ui.find({ type: 'Text', text: texto }))?.props.color

const uso = (tokens: number, percent: number, usd: number): SessionUsage => ({
  startedAt: AGORA,
  context: { tokens, window: 200_000, percent },
  rateLimits: [],
  cost: { usd },
})

const FAIXA = { plugin: MOD, component: 'AbovePrompt' } as const

// Os selos da linha de resumo, cada um como "rótulo valor (somado)", sem a
// barrinha do contexto, separados por " | ". Undefined: nenhum selo.
const resumoDe = async (ui: Achados & { findAll: (q: { type?: string; text?: RegExp }) => Promise<{ text: string; props: Record<string, unknown> }[]> }) => {
  const selos = await ui.findAll({ type: 'Text', text: /^ (contexto|tokens|custo|limite|agentes)  / })
  const textos = selos.map(selo => selo.text.replaceAll('━', '').replace(/\s+/g, ' ').trim())

  return textos.length === 0 ? undefined : textos.join(' | ')
}

// O fundo do valor de um selo (o Text em negrito logo depois do rótulo).
// O fundo de um selo: no terminal, o do texto; no app, o da pílula desenhada.
const fundoDoSelo = async (ui: Achados, texto: string): Promise<unknown> => {
  const comoTexto = await ui.find({ type: 'Text', text: new RegExp(`^ ${texto.replace(/[$()+.|]/g, '\\$&')} $`) })

  if (comoTexto !== undefined) {
    return comoTexto.props.backgroundColor
  }

  const pilula = (await ui.findAll({ type: 'Svg' })).find(svg => svg.props.alt === texto)

  return /<rect[^>]* fill="(#[0-9a-f]+)"/.exec(String(pilula?.props.source ?? ''))?.[1]
}

// Um desenho pelo começo do alt (no app, os títulos e selos também são desenhos).
const desenho = async (ui: Achados, comeco: string) =>
  (await ui.findAll({ type: 'Svg' })).find(svg => String(svg.props.alt).startsWith(comeco))

const fundoDe = async (ui: Achados, valor: string) =>
  (await ui.find({ type: 'Text', text: new RegExp(`^ ${valor.replace(/[$()+.]/g, '\\$&')}$`) }))?.props
    .backgroundColor

test('linha de resumo no terminal: selos coloridos acima do prompt, cada parte com o seu nome', async ($, on) => {
  const motor = ligar(on)
  motor.uso = uso(134_400, 67, 1.84)
  await $.session.start(INICIO)
  const larga = { ...faixa(), bodyColumns: 160 }

  {
    const ui = await $.ui.mount({ ...FAIXA, surface: 'terminal', props: larga })
    const marca = await ui.find({ type: 'Text', text: /^ ✦ CSR Lens $/ })
    expect(marca?.props.backgroundColor).toBe('#0d80bf')
    expect(marca?.props.bold).toBe(true)
    // Os tokens vão no mesmo selo do percentual.
    expect(await resumoDe(ui)).toBe('contexto 67% 134,4k | custo US$ 1,84')
    // O rótulo num cinza escuro; o valor do contexto em âmbar (entre 50% e 80%).
    expect((await ui.find({ type: 'Text', text: /^ contexto $/ }))?.props.backgroundColor).toBe('#30363d')
    expect(await fundoDe(ui, '67%')).toBe('#d29922')
    expect(await fundoDe(ui, '134,4k')).toBe('#d29922')
    expect(await fundoDe(ui, 'US\$ 1,84')).toBe('#39c5cf')
    // A barrinha: 67% de 8 células, 5 cheias e 3 apagadas.
    await mostra(ui, /^ ━━━━━$/)
    expect((await ui.find({ type: 'Text', text: /^━━━$/ }))?.props.dimColor).toBe(true)
    await ui.unmount()
  }

  const ui = await $.ui.mount({ ...FAIXA, surface: 'terminal', props: larga })
  const explore = await $.agent.spawn(subagente('t1', 'Explore', 'procurar hooks'))
  await $.agent.spawn(subagente('t2', 'Plan', 'planejar'))
  expect(await resumoDe(ui)).toBe(
    'contexto 67% 134,4k | custo US$ 1,84 | agentes 2 rodando',
  )
  // Com agentes rodando, o selo deles acende em ciano.
  expect(await fundoDe(ui, '2 rodando')).toBe('#39c5cf')

  await $.turn.complete(fimDoTurno('s1', 'Pronto.', 4000, explore.agentId))
  expect(await resumoDe(ui)).toBe(
    'contexto 67% 134,4k | custo US$ 1,84 | agentes 1 rodando · 1 concluído',
  )

  await $.session.measure({
    context: { tokens: 152_600, window: 200_000, percent: 76 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 38 },
      { kind: 'seven_day', percentUsed: 60 },
    ],
    cost: { usd: 2.05 },
    changed: ['context', 'cost', 'rateLimits'],
  })
  expect(await resumoDe(ui)).toBe(
    'contexto 76% 152,6k | custo US$ 2,05 | limite 5h 38% · 7d 60% | agentes 1 rodando · 1 concluído',
  )
  expect(await fundoDe(ui, '5h 38% · 7d 60%')).toBe('#a371f7')

  // Com um turno em curso: entre parênteses, o que ele somou até agora.
  motor.uso = uso(152_600, 76, 2.05)
  await $.turn.start({ text: 'mais um pedido', turnId: 't1' })
  expect(await resumoDe(ui)).toMatch(/^contexto 76% 152,6k \| custo US\$ 2,05 \| /)
  motor.uso = uso(170_800, 85, 2.26)
  await $.session.measure({ ...motor.uso, changed: ['context', 'cost'] })
  expect(await resumoDe(ui)).toMatch(
    /^contexto 85% 170,8k \(\+18,2k\) \| custo US\$ 2,26 \(\+0,21\) \| /,
  )
  // Acima de 80%, o contexto fica vermelho.
  expect(await fundoDe(ui, '85%')).toBe('#f85149')
  await ui.unmount()

  // Sem largura para tudo numa linha: a marca encurta e, depois, os rótulos saem.
  const media = await $.ui.mount({ ...FAIXA, surface: 'terminal', props: { ...faixa(), bodyColumns: 113 } })
  expect(await media.find({ type: 'Text', text: /^ ✦ CSR $/ })).toBeDefined()
  expect(await media.find({ type: 'Text', text: /^ custo $/ })).toBeDefined()
  await media.unmount()
  const estreita = await $.ui.mount({ ...FAIXA, surface: 'terminal', props: { ...faixa(), bodyColumns: 80 } })
  expect(await estreita.find({ type: 'Text', text: /^ ✦ CSR $/ })).toBeDefined()
  expect(await estreita.find({ type: 'Text', text: /^ custo $/ })).toBeUndefined()
  await mostra(estreita, /^ US\$ 2,26$/)
  await estreita.unmount()

  // A status line do Claude Code (a linha amarela) não é usada.
  expect(motor.visto.status).toEqual([])
})

// As ferramentas do turno em barras: no Desktop um gráfico (que o texto
// alternativo descreve), no terminal uma linha de blocos por ferramenta.
const mostraFerramentas = async (
  ui: Achados & { findAll: (query: { type: string }) => Promise<{ props: Record<string, unknown> }[]> },
  surface: string,
  itens: readonly (readonly [string, number])[],
) => {
  if (surface === 'desktop') {
    const alts = (await ui.findAll({ type: 'Svg' })).map(svg => String(svg.props.alt))
    expect(alts.some(alt => alt.endsWith(itens.map(([nome, vezes]) => `${nome} ${vezes}`).join(', ')))).toBe(true)

    return
  }

  for (const [nome, vezes] of itens) {
    await mostra(ui, new RegExp(`^${nome} +█+ ${vezes}$`))
  }
}

test('linha de resumo no Desktop: pílulas em SVG, o repositório e o contexto clicáveis', async ($, on) => {
  const motor = ligar(on)
  comRepositorio(motor)
  motor.compactaEm = 156_000
  motor.uso = {
    ...uso(134_400, 67, 1.84),
    rateLimits: [
      { kind: 'five_hour', percentUsed: 38, resetsAt: new Date(AGORA + 130 * 60_000).toISOString() },
      { kind: 'seven_day', percentUsed: 85 },
    ],
  }
  await $.session.start(INICIO)
  await $.agent.spawn(subagente('t1', 'Explore', 'procurar hooks'))
  // Uma resposta da conversa principal: o modelo, o esforço e o cache dela.
  motor.passo = {
    input_tokens: 1000,
    output_tokens: 500,
    cache_read_input_tokens: 18_000,
    cache_creation_input_tokens: 1000,
    model: 'claude-opus-5-5',
  }
  const fluxo = $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', effort: 'high', messageCount: 3 })
  for (let pedaco = await fluxo.next(); pedaco.done !== true; pedaco = await fluxo.next()) {
    // lê até o fim
  }
  await $.session.measure({ ...motor.uso, changed: ['context'] })

  // A linha de pílulas grava os números no máximo a cada 3 s.
  await motor.relogio.advance(3000)

  // Com a conversa principal trabalhando.
  const ui = await $.ui.mount({
    ...FAIXA,
    surface: 'desktop',
    props: { ...faixa(), bodyColumns: 220, isWorking: true },
  })
  // Um SVG só, interativo (o tema e a bolinha que pisca), sem dica nenhuma; o
  // texto alternativo diz o que cada pílula diz, na ordem: o que está vivo
  // primeiro, depois o repositório e as medidas.
  const svgs = await ui.findAll({ type: 'Svg' })
  expect(svgs).toHaveLength(1)
  expect(svgs[0]?.props.isInteractive).toBe(true)
  expect(String(svgs[0]?.props.alt).split('. ')).toEqual([
    'CSR Lens',
    'A conversa principal está trabalhando neste turno',
    '1 subagente rodando em paralelo',
    'Git: repositório proj · ramo main · 3 arquivos sem commit',
    'Contexto: 67% da janela · 134,4k de 200k tokens · compacta sozinho ao chegar a 78%',
    'Custo da sessão: US$ 1,84',
    'Limite de 5 h: 38% usado · renova em 2h10',
    'Limite de 7 dias: 85% usado',
    'Modelo da conversa principal: Opus 5.5 · esforço high',
    'Cache: 90% da entrada da última resposta veio do cache (18k de 20k tokens); quanto mais, mais barato o turno',
  ])
  expect(JSON.stringify(await ui.drawn())).not.toContain('"hover"')
  // Só o repositório e o contexto são clicáveis: um botão invisível em cima de cada um.
  const botoes = (await ui.findAll({ type: 'Button' })).map(botao => String(botao.key))
  expect(botoes).toEqual(['abrir-git', 'abrir-contexto'])
  expect(String((await ui.find({ key: 'abrir-git' }))?.props.label)).toMatch(/^\u2007+$/)

  const fonte = svgs.map(svg => String(svg.props.source)).join('\n')
  // Sem barrinhas nas pílulas: só fundo, ícones, divisores e texto.
  expect(fonte).not.toMatch(/<rect [^>]*height="2" rx="1"/)
  // Pequenas e sem contorno: 20 px de altura, cantos de meia altura.
  expect(fonte.match(/<g class="m-\w+"><rect [^>]*height="20" rx="10"/g)?.length).toBe(10)
  expect(fonte).not.toContain('stroke-opacity="0.35"')
  expect(fonte).not.toContain('<title>')
  // Fonte monoespaçada pequena; negrito só nos percentuais, na marca e no aviso.
  expect(fonte).toContain('font-family="ui-monospace')
  expect(fonte).not.toMatch(/font-weight="600"[^>]*>(US\$|Opus|proj|main|1 em paralelo)/)
  // A marca na frente, cheia no azul do Grêmio, com o texto em branco.
  expect(fonte).toMatch(/<g class="m-gremio"><rect [^>]*style="fill:var\(--c\)"\/>/)
  expect(fonte).toContain('.m-gremio{--c:#0d80bf}')
  expect(fonte).toMatch(/style="fill:#ffffff"[^>]*>CSR<\/text>/)
  // A bolinha da conversa principal pisca.
  expect(fonte).toMatch(/<g class="m-marca">[^]*?<animate attributeName="opacity"/)
  // A 11 pontos da compactação (67% de 78%): o aviso aparece, com quanto falta.
  for (const texto of ['1 em paralelo', 'compacta em 78% · faltam 21,6k', 'Opus 5.5', 'high', 'proj', 'main', '3 alterados', 'cache', '90%', '2h10']) {
    expect(fonte, texto).toContain(`>${texto}</text>`)
  }
  // O contexto com o ícone de pizza, que se enche com o percentual.
  expect(fonte).toMatch(/<rect [^>]*\/><g transform[^>]*><circle [^>]*r="5.5" fill="none"[^>]*\/><path d="M[^"]* A5.5 5.5 0 1 1 /)
  // A cor de cada pílula: o contexto em âmbar, o limite acima de 80% em
  // vermelho, os agentes em azul (rodando), o git com alterações em âmbar.
  // A pílula de cada parte, na ordem do texto alternativo.
  const partes = String(svgs[0]?.props.alt).split('. ')
  const matizes = [...fonte.matchAll(/<g class="m-(\w+)">/g)].map(achado => achado[1])
  const matiz = (inicio: string) => matizes[partes.findIndex(parte => parte.startsWith(inicio))]
  expect(matiz('Contexto')).toBe('ambar')
  expect(matiz('Limite de 7 dias')).toBe('vermelho')
  expect(matiz('1 subagente')).toBe('azul')
  expect(matiz('Git')).toBe('ambar')
  // Claro no tema claro, escuro no escuro: o SVG declara os dois temas (sem
  // isso, o quadro do Desktop ganha fundo branco no app escuro) e cada matiz
  // tem um tom para cada um.
  expect(fonte).toContain('style="color-scheme:light dark"')
  expect(fonte).toContain(':root{color-scheme:light dark;background:transparent}')
  expect(fonte).toMatch(/\.m-ambar\{--c:#8f6b1c\}.*@media \(prefers-color-scheme: dark\)\{.*\.m-ambar\{--c:#d9b870\}/)
  expect(fonte).not.toMatch(/(fill|stroke)="#/)

  // O clique na pílula do contexto abre o painel na aba Contexto; o do git,
  // na Árvore (com o painel aberto, só troca a aba).
  await ui.press({ key: 'abrir-contexto' })
  const painelAberto = await $.ui.mount({ ...PAINEL, surface: 'desktop', props: painel('dock', 100) })
  await mostra(painelAberto, /◔ Contexto/)
  await ui.press({ key: 'abrir-git' })
  await mostra(painelAberto, /▤ Árvore/)
  await painelAberto.unmount()
  await ui.unmount()

  // Parada, e sem agente rodando: sem a bolinha e sem a pílula dos agentes.
  await $.turn.complete(fimDoTurno('s1', 'Pronto.', 4000, 'ag-t1'))
  const parada = await $.ui.mount({ ...FAIXA, surface: 'desktop', props: { ...faixa(), bodyColumns: 220 } })
  const quieta = String((await parada.find({ type: 'Svg' }))?.props.alt)
  expect(quieta).not.toContain('A conversa principal')
  expect(quieta).not.toContain('em paralelo')
  expect((await parada.find({ type: 'Svg' }))?.props.height).toBe(20)
  await parada.unmount()

  // A cor e o aviso pela distância até a compactação.
  const pilulaDoContexto = async () => {
    // As pílulas gravam os números no máximo a cada 3 s.
    await motor.relogio.advance(3000)
    const montada = await $.ui.mount({ ...FAIXA, surface: 'desktop', props: { ...faixa(), bodyColumns: 220 } })
    const svg = await montada.find({ type: 'Svg' })
    const fonteToda = String(svg?.props.source)
    const indice = String(svg?.props.alt).split('. ').findIndex(parte => parte.startsWith('Contexto'))
    await montada.unmount()

    return {
      cor: [...fonteToda.matchAll(/<g class="m-(\w+)">/g)].map(achado => achado[1])[indice],
      temAviso: fonteToda.includes('>compacta em'),
    }
  }
  // Longe (67% de 97%): verde, sem aviso.
  motor.compactaEm = 194_000
  await $.session.measure({ ...motor.uso, changed: ['context'] })
  expect(await pilulaDoContexto()).toEqual({ cor: 'verde', temAviso: false })
  // Quase lá (67% de 70%): vermelho, com o aviso.
  motor.compactaEm = 140_000
  await $.session.measure({ ...motor.uso, changed: ['context'] })
  expect(await pilulaDoContexto()).toEqual({ cor: 'vermelho', temAviso: true })

  // Estreito: as pílulas descem para outras fileiras.
  const estreita = await $.ui.mount({ ...FAIXA, surface: 'desktop', props: { ...faixa(), bodyColumns: 70 } })
  expect((await estreita.find({ type: 'Svg' }))?.props.height).toBeGreaterThan(20)
  await estreita.unmount()
})

test('relógio: o painel acompanha o tempo sozinho, sem redesenhar a cada segundo', async ($, on) => {
  const motor = ligar(on)
  await $.session.start(INICIO)
  await $.agent.spawn(subagente('t1', 'Explore', 'procurar hooks'))
  // Na aba Agentes pelo comando (um clique pausaria o relógio do painel).
  await $.command.run({ ...COMANDO, args: 'agentes' })
  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop', props: painel('dock', 100) })
  await mostra(ui, /^ ⏱ 0s $/)
  // Com um agente rodando há menos de um minuto, o tempo anda, mas o painel
  // é redesenhado no máximo a cada 2,5 s (cada desenho troca os botões no app):
  // aberto agora, ele só volta a desenhar passados 2,5 s.
  await motor.relogio.advance(1000)
  await mostra(ui, /^ ⏱ 0s $/)
  await motor.relogio.advance(2000)
  await mostra(ui, /^ ⏱ 3s $/)
  await motor.relogio.advance(1000)
  await mostra(ui, /^ ⏱ 3s $/)
  // Passado o primeiro minuto, o tempo aparece em minutos.
  await motor.relogio.advance(80_000)
  await mostra(ui, /^ ⏱ 1 min $/)
  await ui.unmount()
})

test('diagnóstico de cliques: /lens diagnostico registra cliques, foco e desenhos num arquivo', async ($, on) => {
  const motor = ligar(on)
  motor.sessao.env.HOME = '/casa'
  await $.session.start(INICIO)
  expect((await $.command.run({ ...COMANDO, args: 'diagnostico' })).text).toMatch(/Diagnóstico ligado/)
  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop', props: painel('dock', 100) })
  await ui.press({ key: 'aba-3' })
  const registro = motor.arquivos['/casa/.claude/csr-lens-diagnostico.log'] ?? ''
  expect(registro).toContain('diagnóstico ligado')
  expect(registro).toContain('clique Pane aba-3 (desktop)')
  expect(registro).toMatch(/desenho do painel \(foco: sim\)/)
  expect((await $.command.run({ ...COMANDO, args: 'diagnostico' })).text).toMatch(/Diagnóstico desligado/)
  // Desligado, não registra mais nada.
  const antes = motor.arquivos['/casa/.claude/csr-lens-diagnostico.log']
  await ui.press({ key: 'aba-1' })
  expect(motor.arquivos['/casa/.claude/csr-lens-diagnostico.log']).toBe(antes)
  await ui.unmount()
})

test('linha de resumo: sessão recém-aberta, sem leitura nenhuma, não mostra linha', async ($, on) => {
  const motor = ligar(on)
  motor.uso = { startedAt: AGORA, context: { window: 200_000 }, rateLimits: [] }
  await $.session.start(INICIO)
  const ui = await $.ui.mount({ ...FAIXA, surface: 'terminal', props: faixa() })
  expect(await ui.find({ type: 'Text', text: /CSR Lens/ })).toBeUndefined()
  expect(await resumoDe(ui)).toBeUndefined()
  await ui.unmount()
  expect(motor.visto.status).toEqual([])
})

test('aba 1, Agentes: rodando com atividade, concluídos com duração e resultado', async ($, on) => {
  const motor = ligar(on)
  await $.session.start(INICIO)
  const explore = await $.agent.spawn(subagente('t1', 'Explore', 'procurar hooks'))
  const plan = await $.agent.spawn(subagente('t2', 'Plan', 'planejar'))
  const revisor = await $.agent.spawn(subagente('t3', 'revisor-de-posts', 'revisar'))
  await $.tool.call(doAgente({ tool: 'Read', file_path: '/proj/src/a.ts' }, explore.agentId))
  await motor.relogio.advance(72_000)
  await $.turn.complete(fimDoTurno('s2', '\nPlano em 3 passos\ndetalhes', 95_000, plan.agentId))
  await $.turn.complete(fimDoTurno('s3', '', 12_000, revisor.agentId, 'error'))

  for (const surface of SUPERFICIES) {
    const ui = await $.ui.mount({ ...PAINEL, surface, props: painel() })
    // O painel abre na Visão geral: estes testes são da aba Agentes.
    if ((await ui.find({ key: 'aba-1' })) !== undefined) {
      await ui.press({ key: 'aba-1' })
    }
    await mostra(ui, 'Rodando · 1')
    // Os números no alto da aba, em selos.
    await mostra(ui, /^ ● 1 rodando $/)
    await mostra(ui, /^ ✓ 1 ok $/)
    await mostra(ui, /^ ✗ 1 falha $/)
    // O agente rodando ganha um cartão de moldura arredondada, neutra (o
    // estado vai no glifo do título).
    expect(JSON.stringify(await ui.drawn())).toMatch(/"borderStyle":"round","borderColor":"subtle"/)
    // Cada agente num cartão, no jeito do "Em execução" do Claude Code: a
    // tarefa no título, o tipo e o tempo numa linha cinza, os números com o
    // que roda agora, e o link que abre o detalhe.
    // No app, o título é um desenho (o nome maior que as pílulas); no
    // terminal, texto em negrito.
    if (surface === 'terminal') {
      await mostra(ui, /^procurar hooks$/)
      await mostra(ui, /^ \(Explore\)$/)
      expect(await corDe(ui, /^● $/)).toBe(AZUL)
    } else {
      expect(await desenho(ui, '● procurar hooks (Explore)')).toBeDefined()
    }
    await mostraEtiquetas(ui, ['Haiku 4.5', '⏱ 1 min', '1 chamada'])
    await mostra(ui, /^▸ Read src\/a\.ts$/)
    // Quando rodou: o começo e "agora".
    await mostra(ui, / → agora$/)
    const link = await ui.find({ key: `ver-agente-${String(explore.agentId)}` })

    // Num painel estreito do Desktop, o cartão inteiro abre o detalhe, sem o link.
    if (surface === 'terminal') {
      expect(link?.props.label).toBe('Ver detalhes')
    } else {
      expect(link).toBeUndefined()
      expect(await ui.find({ key: `linha-agente-${String(explore.agentId)}-abrir-0` })).toBeDefined()
    }
    expect(JSON.stringify(await ui.drawn())).toMatch(
      new RegExp(`"hover":\\{"underline":true,"color":"${CIANO}"\\}`),
    )

    // Os concluídos também em cartão, de moldura apagada, com o resultado.
    await mostra(ui, 'Concluídos · 2')
    expect(JSON.stringify(await ui.drawn())).toMatch(/"borderStyle":"round","borderColor":"subtle"/)
    await mostraEtiquetas(ui, ['⏱ 1m35s'])
    await mostra(ui, /^concluído$/)
    // Embaixo dos números, o começo do pedido e da resposta (o resto, no detalhe).
    await mostra(ui, 'Plano em 3 passos')
    await mostra(ui, /^Resposta {2}$/)
    await naoMostra(ui, /^Ver detalhes$/)
    if (surface === 'terminal') {
      expect(await corDe(ui, /^✓ $/)).toBe(VERDE)
    }
    await mostraEtiquetas(ui, ['⏱ 12s'])
    await mostra(ui, /^falhou$/)
    if (surface === 'terminal') {
      expect(await corDe(ui, /^✗ $/)).toBe(VERMELHO)
    }
    await ui.unmount()
  }
})

test('aba 2, Diffs: Edit e Write da conversa principal e dos subagentes, por turno, com diff real', async ($, on) => {
  const motor = ligar(on)
  motor.arquivos['/proj/b.ts'] = 'um\ndois\ntrês\n'
  motor.responder = (e): ToolCallResult => {
    if (e.tool === 'Edit') {
      const trecho = {
        oldStart: 10,
        oldLines: 3,
        newStart: 10,
        newLines: 4,
        lines: [' const a = 1', '-const b = 2', '+const b = 3', '+const c = 4', ' fim'],
      }

      return { result: { filePath: e.file_path, structuredPatch: [trecho] }, text: 'ok' }
    }

    // Como o motor quando não consegue montar o diff de um Write.
    return { result: { content: e.content, structuredPatch: [], originalFile: null }, text: 'ok' }
  }
  await $.session.start(INICIO)

  await $.turn.start({ text: 'primeiro', turnId: 't1' })
  await $.tool.call({ tool: 'Edit', file_path: '/proj/a.ts', old_string: 'x', new_string: 'y' })
  await $.tool.call({ tool: 'Write', file_path: '/proj/b.ts', content: 'um\n2\ntrês\nquatro\n' })
  // De um subagente: entra na aba, com o nome de quem editou.
  await $.tool.call(
    doAgente({ tool: 'Edit', file_path: '/proj/z.ts', old_string: 'x', new_string: 'y' }, 'ag-outro'),
  )
  await $.turn.complete(fimDoTurno('t1', 'feito', 1000))
  await $.turn.start({ text: 'segundo', turnId: 't2' })
  await $.tool.call({ tool: 'Write', file_path: '/proj/novo.ts', content: 'linha\n' })

  // O conteúdo antigo é lido antes de cada Write (de qualquer um).
  expect(motor.visto.ordem).toEqual([
    'tool.call Edit',
    'fs.read /proj/b.ts',
    'tool.call Write',
    'tool.call Edit',
    'fs.read /proj/novo.ts',
    'tool.call Write',
  ])

  // O Code de um arquivo: o diff que o painel manda desenhar no terminal.
  const codigos = async (ui: { findAll: (q: { type: string }) => Promise<{ props: Record<string, unknown> }[]> }) =>
    (await ui.findAll({ type: 'Code' })).map(codigo => ({
      path: codigo.props.path,
      format: codigo.props.format,
      source: codigo.props.source,
    }))
  // No Desktop, o diff é um SVG com cara de diff nativo.
  const svgs = async (ui: { findAll: (q: { type: string }) => Promise<{ props: Record<string, unknown> }[]> }) =>
    (await ui.findAll({ type: 'Svg' })).filter(svg => String(svg.props.alt).startsWith('Diff:')).map(svg => String(svg.props.source))

  for (const surface of SUPERFICIES) {
    // Largo: a lista à esquerda e o diff à direita, como no VS Code.
    const ui = await $.ui.mount({ ...PAINEL, surface, props: painel('dock', 110) })
    await ui.press({ key: 'aba-2' })
    // Fonte "Sessão": as edições do Claude nos turnos guardados.
    await mostra(ui, /^ Sessão $/)
    await mostra(ui, /^Diffs$/)
    await mostra(ui, '4 arquivos')
    await mostra(ui, 'Edições do Claude nos últimos 10 turnos.')
    // A edição do subagente entra, e o diff dela diz quem editou.
    expect((await ui.find({ key: 'ver-arquivo-/proj/z.ts' }))?.props.label).toBe('z.ts')
    // O primeiro arquivo já vem escolhido, na faixa da seleção.
    const escolhido = await ui.find({ key: 'arquivo-/proj/a.ts' })
    expect(escolhido?.props.backgroundColor).toBe('#264f78')
    // Os outros são botões que abrem o diff deles; a letra na cor do git.
    expect((await ui.find({ key: 'ver-arquivo-/proj/novo.ts' }))?.props.label).toBe('novo.ts')
    expect((await ui.findAll({ type: 'Text', text: /^A$/ })).map(letra => letra.props.color)).toContain(VERDE)
    if (surface === 'terminal') {
      expect(await codigos(ui)).toEqual([
        {
          path: '/proj/a.ts',
          format: 'diff',
          source: '@@ -10,3 +10,4 @@\n const a = 1\n-const b = 2\n+const b = 3\n+const c = 4\n fim',
        },
      ])
    } else {
      // Fundo por linha, números de linha antes e depois, a palavra que mudou
      // em destaque (o 2 que virou 3) e as cores de sintaxe.
      const [fonte] = await svgs(ui)
      expect(await codigos(ui)).toEqual([])
      expect(fonte).toContain('<rect class="br"')
      expect(fonte).toContain('<rect class="ba"')
      expect(fonte?.match(/<rect class="p[ar]"/g)?.length).toBe(2)
      expect(fonte).toContain('>  11</text>')
      expect(fonte).toContain('>  12</text>')
      expect(fonte).toContain('<tspan class="k">const</tspan>')
      expect(fonte).toContain('<tspan class="d">3</tspan>')
      // Os 9 primeiros números do arquivo não mudaram.
      expect(fonte).toContain('9 linhas sem mudança')
      expect(fonte).toContain('prefers-color-scheme: dark')
    }
    await mostra(ui, /^Edição 1$/)
    await mostra(ui, ' · Edit · turno 1')
    expect(JSON.stringify(await ui.drawn())).toMatch(/"width":37/)

    // O Write num arquivo que já existia: o diff contra o conteúdo lido antes.
    await ui.press({ key: 'proximo' })
    expect((await ui.find({ key: 'arquivo-/proj/b.ts' }))?.props.backgroundColor).toBe('#264f78')
    if (surface === 'terminal') {
      expect(String((await codigos(ui))[0]?.source)).toMatch(/^@@ -1,3 \+1,4 @@\n um\n-dois\n\+2\n três\n\+quatro$/)
    } else {
      expect((await svgs(ui))[0]).toContain('quatro')
    }

    // A edição do subagente: o diff dela, com o nome de quem editou.
    await ui.press({ key: 'ver-arquivo-/proj/z.ts' })
    await mostra(ui, ' · por agente ag-out')

    await ui.press({ key: 'ver-arquivo-/proj/novo.ts' })
    await mostra(ui, ' · Write, arquivo novo · turno 2')
    if (surface === 'terminal') {
      expect(String((await codigos(ui))[0]?.source)).toMatch(/\n\+linha$/)
    } else {
      expect((await svgs(ui))[0]).toContain('>linha</tspan>')
    }
    expect((await ui.find({ key: 'anterior' }))?.props.hotkey).toBe('p')
    expect((await ui.find({ key: 'proximo' }))?.props.hotkey).toBe('n')

    // Fonte "Turno": um turno de cada vez.
    await ui.press({ key: 'diff-turno' })
    await mostra(ui, /^ Turno 2 $/)
    expect(await ui.find({ key: 'ver-arquivo-/proj/a.ts' })).toBeUndefined()
    await ui.press({ key: 'turno-anterior' })
    await mostra(ui, /^ Turno 1 $/)
    expect(await ui.find({ key: 'ver-arquivo-/proj/b.ts' })).toBeDefined()
    expect(await ui.find({ key: 'arquivo-/proj/novo.ts' })).toBeUndefined()
    await ui.press({ key: 'turno-seguinte' })
    await mostra(ui, /^ Turno 2 $/)
    await ui.press({ key: 'diff-sessao' })
    // De volta ao primeiro arquivo, para a outra superfície começar igual.
    await ui.press({ key: 'ver-arquivo-/proj/a.ts' })
    await ui.press({ key: 'aba-1' })
    await ui.unmount()
  }

  // Estreito: a lista em cima e o diff embaixo.
  const estreito = await $.ui.mount({ ...PAINEL, surface: 'terminal', props: painel('dock', 60) })
  await estreito.press({ key: 'aba-2' })
  expect(JSON.stringify(await estreito.drawn())).not.toMatch(/"width":/)
  expect((await codigos(estreito)).length).toBe(1)
  await estreito.unmount()
})

test('aba 2, Diffs na fonte git: a árvore de trabalho contra o HEAD, arquivo a arquivo', async ($, on) => {
  const motor = ligar(on)
  comRepositorio(motor)
  motor.comandos['git diff HEAD --no-color --no-ext-diff -- src/a.ts'] =
    'diff --git a/src/a.ts b/src/a.ts\nindex 1..2 100644\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,2 +1,3 @@\n-x\n+y\n+w\n z\n'
  motor.comandos['git diff --no-color --no-ext-diff --no-index -- /dev/null notas.md'] =
    'diff --git a/notas.md b/notas.md\nnew file mode 100644\n--- /dev/null\n+++ b/notas.md\n@@ -0,0 +1 @@\n+oi\n\\ No newline at end of file\n'
  await $.session.start(INICIO)

  for (const surface of SUPERFICIES) {
    const ui = await $.ui.mount({ ...PAINEL, surface, props: painel('dock', 110) })
    await ui.press({ key: 'aba-2' })
    expect((await ui.find({ key: 'diff-git' }))?.props.hotkey).toBe('g')
    await ui.press({ key: 'diff-git' })
    await mostra(ui, /^ Git $/)
    await mostra(ui, 'Árvore de trabalho contra o HEAD.')
    // A pasta compacta vem antes dos arquivos soltos, e o primeiro arquivo dela já abre.
    await mostra(ui, /^src$/)
    expect((await ui.find({ key: 'arquivo-/proj/src/a.ts' }))?.props.backgroundColor).toBe('#264f78')
    // Sem o prelúdio do git: só os trechos.
    if (surface === 'terminal') {
      const codigo = await ui.find({ type: 'Code' })
      expect(codigo?.props.source).toBe('@@ -1,2 +1,3 @@\n-x\n+y\n+w\n z')
      expect(codigo?.props.path).toBe('/proj/src/a.ts')
    } else {
      const fonte = String((await desenho(ui, 'Diff:'))?.props.source)
      expect(fonte).not.toContain('diff --git')
      expect(fonte).toContain('>w</tspan>')
    }
    await mostra(ui, /^ alterado$/)

    // Um arquivo não rastreado: o diff contra /dev/null.
    await ui.press({ key: 'ver-arquivo-/proj/notas.md' })
    if (surface === 'terminal') {
      expect((await ui.find({ type: 'Code' }))?.props.source).toBe('@@ -0,0 +1,1 @@\n+oi')
    } else {
      expect(String((await desenho(ui, 'Diff:'))?.props.source)).toContain('>oi</tspan>')
    }
    await mostra(ui, /^ não rastreado$/)

    // O apagado não tem texto no motor de teste: o aviso no lugar.
    await ui.press({ key: 'proximo' })
    await mostra(ui, 'Sem diferença de texto contra o HEAD.')
    expect((await ui.find({ key: 'diff-atualizar' }))?.props.hotkey).toBe('u')
    await ui.press({ key: 'ver-arquivo-/proj/src/a.ts' })
    await ui.press({ key: 'diff-sessao' })
    await ui.press({ key: 'aba-1' })
    await ui.unmount()
  }
})

test('aba 3, Contexto: uso, gráfico, custo, limite, estimativa a cada turno e contagem exata só no clique', async ($, on) => {
  const motor = ligar(on)
  motor.uso = uso(80_000, 40, 1.2)
  await $.session.start(INICIO)

  await $.turn.start({ text: 'a', turnId: 't1' })
  motor.uso = uso(116_200, 58, 1.63)
  await $.session.measure({ ...motor.uso, changed: ['context', 'cost'] })

  await $.turn.start({ text: 'b', turnId: 't2' })
  motor.uso = {
    ...uso(134_400, 67, 1.84),
    rateLimits: [
      {
        kind: 'five_hour',
        percentUsed: 38,
        resetsAt: new Date(AGORA + 130 * 60_000).toISOString(),
      },
    ],
  }
  await $.session.measure({ ...motor.uso, changed: ['context', 'cost', 'rateLimits'] })

  for (const surface of SUPERFICIES) {
    const ui = await $.ui.mount({ ...PAINEL, surface, props: painel() })
    await ui.press({ key: 'aba-3' })
    // O percentual na cor do nível: âmbar entre 50% e 80% (no desktop, no desenho).
    if (surface === 'terminal') {
      expect(await corDe(ui, /^67%$/)).toBe(AMBAR)
      await mostra(ui, '134,4k / 200k')
    } else {
      const anel = (await ui.findAll({ type: 'Svg' })).find(svg => String(svg.props.alt).startsWith('Contexto'))
      expect(String(anel?.props.source)).toContain('style="fill:#d29922">67%</text>')
    }
    // O gráfico dos últimos turnos saiu da aba.
    await naoMostra(ui, 'Últimos 12 turnos')
    if (surface === 'terminal') {
      await mostra(ui, '▲ +18,2k no último turno')
    }

    if (surface === 'desktop') {
      // No desktop, o anel e os números grandes num desenho e a barra das
      // categorias, em tamanho fixo (sem isso, o Desktop os esticava à
      // largura do painel); num painel de 60 colunas, o desenho encolhe.
      // Os gráficos da aba (fora as barras dos títulos e as pílulas).
      const graficos = (await ui.findAll({ type: 'Svg' })).filter(svg =>
        ['Contexto ', 'Limites de uso', 'A janela de contexto'].some(comeco => String(svg.props.alt).startsWith(comeco)),
      )
      expect(graficos.map(grafico => String(grafico.props.alt))).toEqual([
        'Contexto 67% usado, 134,4k de 200k tokens; ▲ +18,2k no último turno',
        // Estreito, os limites de uso num painel próprio (largo, ao lado do anel).
        'Limites de uso: 5 h 38%',
        'A janela de contexto repartida pelas categorias',
      ])
      expect(String(graficos[0]?.props.source)).toMatch(/>67%<\/text>/)
      expect(String(graficos[0]?.props.source)).toMatch(/>134,4k<\/tspan>/)
      expect(graficos.map(grafico => [grafico.props.width, grafico.props.height])).toEqual([
        [421, 102],
        [406, 76],
        [437, 14],
      ])
    } else {
      // No terminal, o uso numa barra que passa de verde a âmbar.
      expect(await ui.find({ type: 'Svg' })).toBeUndefined()
      expect(await corDe(ui, /^█{26}$/)).toBe(VERDE)
      expect(await corDe(ui, /^█{10}$/)).toBe(AMBAR)
    }

    // Estreito, a grade de custo e tokens vai em texto, com o ▲ embaixo.
    await mostra(ui, /^US\$ 1,84 · R\$ 9,60 +$/)
    await mostra(ui, /^ +▲ US\$ 0,21 /)
    await mostra(ui, 'Limite de uso')
    if (surface === 'terminal') {
      await mostra(ui, /^5 h /)
      await mostra(ui, /^38%$/)
      await mostra(ui, 'renova em 2h10')
    } else {
      // No Desktop, num painel desenhado: o nome, o percentual e quando renova.
      const limites = String((await ui.findAll({ type: 'Svg' })).find(svg => String(svg.props.alt).startsWith('Limites de uso'))?.props.source)
      expect(limites).toContain('>38%</tspan>')
      expect(limites).toContain('>renova em 2h10</text>')
    }
    // O detalhamento estimado acompanha os turnos, sem ninguém clicar.
    await mostra(ui, /estimativa do turno 2/)
    await mostra(ui, /Mensagens/)
    expect((await ui.find({ key: 'detalhar' }))?.props.label).toBe('Contagem exata')
    await ui.press({ key: 'aba-1' })
    await ui.unmount()
  }

  // Até aqui só a estimativa local foi pedida: nenhuma contagem de tokens extra.
  const exatas = () => motor.visto.usos.filter(pedido => pedido === 'full')
  expect(motor.visto.usos).toContain('summary')
  expect(exatas()).toEqual([])

  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop', props: painel() })
  await ui.press({ key: 'aba-3' })
  await ui.press({ key: 'detalhar' })
  expect(exatas()).toEqual(['full'])
  await mostra(ui, /contagem exata do turno 2$/)
  await mostra(ui, /Mensagens/)
  // No app, o número numa coluna própria e o nome em português ao lado.
  await mostra(ui, '4,2k')
  await mostra(ui, / Prompt de sistema/)
  await mostra(ui, / Espaço livre/)
  await mostra(ui, 'Ocupando a janela')
  await mostra(ui, 'Reserva e espaço livre')

  // Outra medição no mesmo turno não troca a contagem exata pela estimativa.
  await $.session.measure({ ...motor.uso, changed: ['cost'] })
  await motor.relogio.advance(3000)
  await mostra(ui, /Mensagens/)

  // No turno seguinte, a estimativa volta a acompanhar.
  await $.turn.start({ text: 'c', turnId: 't3' })
  await $.session.measure({ ...motor.uso, changed: ['context'] })
  await motor.relogio.advance(3000)
  await mostra(ui, /estimativa do turno 3/)
  await mostra(ui, /Mensagens/)
  expect(exatas()).toEqual(['full'])
  await ui.unmount()
})

test('comandos Bash ficam no turno em que rodaram, com status, e abrem o detalhe', async ($, on) => {
  const motor = ligar(on)
  let soltar: (saida: ToolCallResult) => void = () => undefined
  const preso = new Promise<ToolCallResult>(resolve => {
    soltar = resolve
  })
  const ok: ToolCallResult = { result: { stdout: '', stderr: '', interrupted: false }, text: 'ok' }
  motor.responder = e => {
    if (e.command === 'npm test') {
      return { isError: true, result: 'Exit code 1\n2 falhas', text: 'Exit code 1\n2 falhas' }
    }

    return e.command === 'sleep 60' ? preso : ok
  }
  await $.session.start(INICIO)
  await $.turn.start({ text: 'roda os testes', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', command: 'npm run check' })
  await $.tool.call({ tool: 'Bash', command: 'ls -la /proj/src /proj' })
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  const pendente = $.tool.call({ tool: 'Bash', command: 'sleep 60' })
  await motor.relogio.advance(5000)

  for (const surface of SUPERFICIES) {
    const ui = await $.ui.mount({ ...PAINEL, surface, props: painel('dock', 100) })
    await ui.press({ key: 'aba-4' })
    await mostra(ui, /4 comandos Bash/)
    const comandos = async () =>
      (await ui.findAll({ type: 'Button' }))
        .filter(botao => String(botao.key).startsWith('ver-comando-'))
        .map(botao => botao.props.label)
    // O cartão do turno só conta os comandos; eles ficam no detalhe do turno.
    expect(await comandos()).toEqual([])

    // No detalhe do turno, todos, na ordem em que rodaram.
    await ui.press({ key: 'ver-turno-1' })
    await mostra(ui, 'Comandos Bash · 4')
    // A pasta do projeto some do comando mostrado: /proj/src vira src, /proj vira um ponto.
    expect(await comandos()).toEqual(['npm run check', 'ls -la src .', 'npm test', 'sleep 60'])
    await mostra(ui, /^ exit 1 · \d+,\ds$/)
    expect(await corDe(ui, /^✓$/)).toBe(VERDE)
    expect(await corDe(ui, /^✗$/)).toBe(VERMELHO)
    expect(await corDe(ui, /^●$/)).toBe(AZUL)

    // Aberto do turno, o comando volta para o turno.
    const botoes = (await ui.findAll({ type: 'Button' })).filter(botao =>
      String(botao.key).startsWith('ver-comando-'),
    )
    await ui.press({ key: String(botoes[2]?.key) })
    await mostra(ui, /exit 1/)
    await ui.press({ key: 'voltar' })
    await mostra(ui, 'Comandos Bash · 4')
    await ui.press({ key: 'voltar' })
    await ui.press({ key: 'aba-1' })
    await ui.unmount()
  }

  soltar(ok)
  await pendente
  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop', props: painel('dock', 100) })
  await ui.press({ key: 'aba-4' })
  // Solto o comando, ele termina: não há mais nenhum rodando no cartão.
  expect(await ui.find({ type: 'Text', text: /^●$/ })).toBeUndefined()
  await ui.unmount()
})

test('aba 4, Turnos: duração, contexto somado, custo, ferramentas e falhas de cada turno', async ($, on) => {
  const motor = ligar(on)
  motor.uso = uso(80_000, 40, 1.2)
  motor.responder = e =>
    e.command === 'npm test'
      ? { isError: true, result: 'Exit code 1', text: 'Exit code 1' }
      : { result: { structuredPatch: [] }, text: 'ok' }
  await $.session.start(INICIO)

  await $.turn.start({ text: 'ajusta o README\ne publica', turnId: 't1' })
  await $.tool.call({ tool: 'Read', file_path: '/proj/README.md' })
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  await $.tool.call({ tool: 'Edit', file_path: '/proj/README.md', old_string: 'a', new_string: 'b' })
  await $.turn.complete(fimDoTurno('t1', 'feito', 72_000))
  motor.uso = uso(85_500, 43, 1.4)
  await $.session.measure({ ...motor.uso, changed: ['context', 'cost'] })

  await $.turn.start({ text: 'segundo pedido', turnId: 't2' })
  await motor.relogio.advance(5000)

  for (const surface of SUPERFICIES) {
    const ui = await $.ui.mount({ ...PAINEL, surface, props: painel('dock', 100) })
    expect((await ui.find({ key: 'aba-4' }))?.props.hotkey).toBe('3')
    await ui.press({ key: 'aba-4' })
    await mostra(ui, 'Turnos · 2')

    // O turno em curso, em azul, com o tempo correndo.
    expect((await ui.find({ key: 'ver-turno-2' }))?.props.label).toBe('Turno 2')
    const emCurso = await ui.findAll({ type: 'Text', text: /^em andamento · 5s$/ })
    expect(emCurso.map(texto => texto.props.color)).toContain(AZUL)
    await mostra(ui, 'segundo pedido')

    // O turno fechado: duração, falhas em vermelho, o pedido e os números.
    expect((await ui.find({ key: 'ver-turno-1' }))?.props.label).toBe('Turno 1')
    await mostra(ui, /^1m12s$/)
    expect(await corDe(ui, /^ · 1 falha$/)).toBe(VERMELHO)
    await mostra(ui, 'ajusta o README e publica')
    await mostraEtiquetas(ui, ['+5,5k de contexto', 'US$ 0,20', '3 ferramentas', '1 edição'])

    // No Desktop, as barras das durações, com a dica de cada turno.
    const barras = await desenho(ui, 'A duração de cada turno')
    if (surface === 'desktop') {
      expect(barras?.props.alt).toBe('A duração de cada turno, do mais antigo ao mais recente')
      // A dica de cada barra abre na hora: o título e os detalhes do turno.
      expect(String(barras?.props.source)).toContain('<g class="alvo ta0"><rect class="barra falha"')
      expect(String(barras?.props.source)).toContain('.ta0:hover~.td0{opacity:1;transition-delay:0s}')
      expect(String(barras?.props.source)).toMatch(/<g class="dica td0">.*>Turno 1 · [^<]*<\/text>.*>1m12s · US\$ 0,20 · 3 ferramentas · 1 falha<\/text>/)
      expect(String(barras?.props.source)).toContain('>em andamento há 5s · 0 ferramentas</text>')
    } else {
      expect(barras).toBeUndefined()
    }
    await ui.press({ key: 'aba-1' })
    await ui.unmount()
  }
})

test('aba 5, Árvore: git do projeto, arquivos tocados e o que está sendo escrito agora', async ($, on) => {
  const motor = ligar(on)
  comRepositorio(motor)
  let soltar: (saida: ToolCallResult) => void = () => undefined
  const preso = new Promise<ToolCallResult>(resolve => {
    soltar = resolve
  })
  motor.responder = e =>
    e.tool === 'Write'
      ? preso
      : { result: { filePath: e.file_path, structuredPatch: [] }, text: 'ok' }
  await $.session.start(INICIO)
  // O git é lido ao abrir a sessão.
  expect(motor.rodados).toContain('git status --porcelain=v1 -b -z --untracked-files=all')

  await $.tool.call({ tool: 'Read', file_path: '/proj/docs/b.md' })
  // Uma escrita que ainda não terminou (esperando a permissão, por exemplo).
  const escrita = $.tool.call({ tool: 'Write', file_path: '/proj/src/c.ts', content: 'x\n' })
  await motor.relogio.advance(2000)

  for (const surface of SUPERFICIES) {
    const ui = await $.ui.mount({ ...PAINEL, surface, props: painel('dock', 100) })
    expect((await ui.find({ key: 'aba-5' }))?.props.hotkey).toBe('5')
    await ui.press({ key: 'aba-5' })
    await mostra(ui, 'proj')
    // No terminal, em texto; no app, a linha do ramo desenhada, em letra grande.
    if (surface === 'terminal') {
      await mostra(ui, /^main$/)
      await mostra(ui, /^ ↑1$/)
      await mostra(ui, 'origin/main')
    } else {
      expect((await ui.findAll({ type: 'Svg' })).some(svg => String(svg.props.alt).startsWith('Ramo main ↑1 origin/main'))).toBe(true)
    }

    // As pastas com algo dentro abrem sozinhas, com a soma do que há embaixo.
    expect((await ui.find({ key: 'pasta-/proj/src' }))?.props.label).toBe('▾')
    // O arquivo alterado: nome e letra em amarelo, e as linhas.
    expect(await corDe(ui, /^a\.ts$/)).toBe(AMBAR)
    expect((await ui.find({ type: 'Text', text: /^ M$/ }))?.props.color).toBe(AMBAR)
    await mostra(ui, /^ \+3$/)
    await mostra(ui, /^ −1$/)
    // O novo em verde, o apagado riscado.
    expect(await corDe(ui, /^notas\.md$/)).toBe(VERDE)
    expect((await ui.find({ type: 'Text', text: /^velho\.ts$/ }))?.props.strikethrough).toBe(true)
    // O que está sendo escrito agora: aceso em laranja, com o selo.
    expect(await fundoDoSelo(ui, 'editando…')).toBe('#f0883e')
    await mostra(ui, /^◉ editando $/)
    // O que só foi lido fica apagado, com quantas vezes.
    await mostra(ui, / lido 1×$/)
    await ui.press({ key: 'aba-1' })
    await ui.unmount()
  }

  // A escrita termina: o arquivo fica aceso como editado por uns segundos, e o
  // git é lido de novo logo depois.
  const lidos = motor.rodados.length
  soltar({ result: { type: 'create', structuredPatch: [] }, text: 'ok' })
  await escrita
  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop', props: painel('dock', 100) })
  await ui.press({ key: 'aba-5' })
  await naoMostra(ui, /^ editando… $/)
  await mostra(ui, /^ criado há /)
  await motor.relogio.advance(1500)
  expect(motor.rodados.length).toBeGreaterThan(lidos)
  await motor.relogio.advance(10_000)

  // Fechar uma pasta à mão vale sobre a abertura automática.
  await ui.press({ key: 'pasta-/proj/src' })
  expect((await ui.find({ key: 'pasta-/proj/src' }))?.props.label).toBe('▸')
  await naoMostra(ui, /^a\.ts$/)
  await ui.press({ key: 'pasta-/proj/src' })
  await mostra(ui, /^a\.ts$/)
  // Passados os segundos de destaque, o arquivo apaga (no redesenho seguinte).
  await naoMostra(ui, /^ criado há /)

  // O projeto inteiro: a pasta é listada, sem node_modules.
  motor.listas['/proj'] = [
    entrada('package.json', 'file'),
    entrada('node_modules', 'dir'),
    entrada('lib', 'dir'),
  ]
  motor.listas['/proj/lib'] = [entrada('util.ts', 'file')]
  await ui.press({ key: 'arvore-toda' })
  await mostra(ui, /^package\.json$/)
  await naoMostra(ui, /^node_modules$/)
  expect((await ui.find({ key: 'pasta-/proj/lib' }))?.props.label).toBe('▸')
  await ui.press({ key: 'pasta-/proj/lib' })
  await mostra(ui, /^util\.ts$/)
  expect(motor.visto.ordem).toContain('fs.list /proj/lib')

  // Recolher fecha tudo o que está aberto.
  await ui.press({ key: 'arvore-recolher' })
  await naoMostra(ui, /^util\.ts$/)
  await naoMostra(ui, /^a\.ts$/)
  await ui.unmount()
})

test('aba 5, Árvore: a escrita interrompida não fica acesa', async ($, on) => {
  const motor = ligar(on)
  motor.responder = e => {
    if (e.tool === 'Write') {
      throw new Error('interrompido')
    }

    return { result: {}, text: 'ok' }
  }
  await $.session.start(INICIO)
  await $.tool.call({ tool: 'Write', file_path: '/proj/a.ts', content: 'x' }).catch(() => undefined)
  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop', props: painel('dock', 100) })
  await ui.press({ key: 'aba-5' })
  await mostra(ui, /^a\.ts$/)
  await naoMostra(ui, /^ editando… $/)
  await naoMostra(ui, /^◉ editando $/)
  await ui.unmount()
})

test('aba 5, Árvore: sem git, só os arquivos tocados', async ($, on) => {
  const motor = ligar(on)
  motor.responder = () => ({ result: { structuredPatch: [] }, text: 'ok' })
  await $.session.start(INICIO)
  await $.tool.call({ tool: 'Edit', file_path: '/proj/src/a.ts', old_string: 'a', new_string: 'b' })
  // Um subagente também acende a árvore, e um arquivo fora do projeto vai à parte.
  await $.tool.call(doAgente({ tool: 'Read', file_path: '/tmp/fora.txt' }, 'ag-x'))

  const ui = await $.ui.mount({ ...PAINEL, surface: 'terminal', props: painel('dock', 100) })
  await ui.press({ key: 'aba-5' })
  await mostra(ui, 'sem repositório git')
  await mostra(ui, /^a\.ts$/)
  // A pasta é um botão: o nome dela abre e fecha.
  expect((await ui.findAll({ type: 'Button' })).some(botao => botao.props.label === '⟨fora do projeto⟩')).toBe(true)
  await mostra(ui, /^fora\.txt$/)
  await ui.unmount()
})

test('aba 6, Inventário: plugins, skills, comandos, hooks e MCP, e o que está ativo na sessão', async ($, on) => {
  const motor = ligar(on)
  motor.sessao.env.HOME = '/casa'
  motor.arquivos['/casa/.claude/plugins/installed_plugins.json'] = JSON.stringify({
    version: 2,
    plugins: {
      'csr-lens@cesarschutz': [{ scope: 'user', installPath: '/cache/csr', version: '1.0.0' }],
      'warp@claude-code-warp': [{ scope: 'user', installPath: '/cache/warp', version: '2.1.0' }],
    },
  })
  motor.arquivos['/cache/csr/.claude-plugin/plugin.json'] = JSON.stringify({
    name: 'csr-lens',
    version: '1.0.0',
    description: 'Painel ao lado da conversa',
  })
  motor.arquivos['/cache/csr/hooks/hooks.json'] = JSON.stringify({ modules: ['./register.tsx'] })
  motor.arquivos['/cache/warp/.claude-plugin/plugin.json'] = JSON.stringify({
    name: 'warp',
    description: 'Notificações do Warp',
  })
  motor.listas['/cache/warp/skills'] = [entrada('avisar', 'dir')]
  motor.arquivos['/cache/warp/skills/avisar/SKILL.md'] =
    '---\nname: avisar\ndescription: >\n  Manda um aviso\n  quando o turno acaba.\n---\n# Avisar\n'
  motor.arquivos['/casa/.claude/plugins/known_marketplaces.json'] = JSON.stringify({
    cesarschutz: { installLocation: '/mk/cs' },
  })
  motor.arquivos['/mk/cs/.claude-plugin/marketplace.json'] = JSON.stringify({
    plugins: [
      { name: 'csr-lens', description: 'já instalado' },
      { name: 'explicar-erro', description: 'Explica um erro em português', category: 'skill' },
    ],
  })
  motor.sessao.configuracoes[''] = {
    enabledPlugins: { 'csr-lens@cesarschutz': true, 'warp@claude-code-warp': false },
    outputStyle: 'Explicativo',
  }
  motor.sessao.configuracoes.user = {
    hooks: {
      PostToolUse: [{ matcher: 'Edit|Write', hooks: [{ type: 'command', command: 'npx prettier --write' }] }],
    },
  }
  motor.sessao.comandos = [
    { name: 'lens', description: 'Abre ou fecha o painel', source: 'plugin', plugin: 'csr-lens' },
    { name: 'compact', description: 'Compacta a conversa', source: 'builtin' },
    { name: 'mensagem-de-commit', description: 'Escreve a mensagem de commit', source: 'user' },
  ]
  motor.sessao.skills = [{ name: 'mensagem-de-commit', source: 'userSettings', tokens: 50 }]
  motor.sessao.ferramentas = [
    { name: 'Read', description: 'Lê um arquivo.\nDetalhes.', mcp: false },
    { name: 'mcp__github__create_issue', description: 'Abre uma issue', mcp: true },
  ]
  await $.session.start(INICIO)

  for (const surface of SUPERFICIES) {
    const ui = await $.ui.mount({ ...PAINEL, surface, props: painel('dock', 100) })
    expect((await ui.find({ key: 'aba-6' }))?.props.hotkey).toBe('7')
    await ui.press({ key: 'aba-6' })
    await mostra(ui, /sem gastar tokens/)

    // Plugins: um ativo e um desligado, com o que cada um traz.
    await mostra(ui, /^ Plugins 1\/2 $/)
    // O selo "ativo" (no app, uma pílula), na cor verde.
    expect(await fundoDoSelo(ui, 'ativo')).toBe('#3fb950')
    await mostra(ui, /^csr-lens$/)
    await mostra(ui, /^ {2}v1\.0\.0$/)
    await mostra(ui, 'Painel ao lado da conversa')
    await mostra(ui, 'mod (hooks de função)')
    expect(await noDesenho(ui, /^ ativo $/)).toBe(true)
    await mostra(ui, /^ inativo $/)
    await mostra(ui, '1 skill')

    // Skills: a do plugin desligado fica inativa; a da sessão, ativa.
    await ui.press({ key: 'inv-skill' })
    await mostra(ui, /^ Skills 1\/2 $/)
    await mostra(ui, /^avisar$/)
    await mostra(ui, 'Manda um aviso quando o turno acaba.')
    await mostra(ui, /^mensagem-de-commit$/)
    await mostra(ui, 'Escreve a mensagem de commit')

    // Comandos, com a descrição; a skill que também é comando não repete.
    await ui.press({ key: 'inv-comando' })
    await mostra(ui, /^\/compact$/)
    await mostra(ui, 'Compacta a conversa')
    await mostra(ui, /^\/lens$/)
    await naoMostra(ui, /^\/mensagem-de-commit$/)

    await ui.press({ key: 'inv-hook' })
    await mostra(ui, /^PostToolUse$/)
    await mostra(ui, /^ {2}Edit\|Write$/)
    await mostra(ui, 'npx prettier --write')
    // O grupo (a origem) é um botão que fecha e abre os itens dele.
    expect((await ui.find({ key: 'grupo-inv-suas configurações' }))?.props.label).toBe('▾ suas configurações')
    await ui.press({ key: 'grupo-inv-suas configurações' })
    expect((await ui.find({ key: 'grupo-inv-suas configurações' }))?.props.label).toBe('▸ suas configurações')
    await naoMostra(ui, 'npx prettier --write')
    await ui.press({ key: 'grupo-inv-suas configurações' })
    await mostra(ui, 'npx prettier --write')
    await mostra(ui, /^hooks de função$/)

    await ui.press({ key: 'inv-mcp' })
    await mostra(ui, /^github$/)
    await mostra(ui, '1 ferramenta')

    await ui.press({ key: 'inv-outros' })
    await mostra(ui, /^Explicativo$/)
    await mostra(ui, /^Read$/)
    await mostra(ui, 'Lê um arquivo.')

    // O que dá para instalar dos marketplaces conhecidos.
    await ui.press({ key: 'inv-disponivel' })
    await mostra(ui, /^explicar-erro$/)
    await naoMostra(ui, 'já instalado')

    // j e k andam pelas seções; o filtro vale dentro da seção.
    expect((await ui.find({ key: 'inventario-proxima' }))?.props.hotkey).toBe('k')
    await ui.press({ key: 'inventario-proxima' })
    await mostra(ui, /^ Plugins 1\/2 $/)
    await ui.input({ key: 'filtro-inventario', text: 'warp' })
    await mostra(ui, /^warp$/)
    await naoMostra(ui, /^csr-lens$/)
    await ui.input({ key: 'filtro-inventario', text: '' })
    await ui.press({ key: 'aba-1' })
    await ui.unmount()
  }

  // Depois de /plugin, o inventário é lido de novo sozinho.
  motor.sessao.configuracoes[''] = {
    enabledPlugins: { 'csr-lens@cesarschutz': true, 'warp@claude-code-warp': true },
  }
  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop', props: painel('dock', 100) })
  await ui.press({ key: 'aba-6' })
  await ui.press({ key: 'aba-1' })
  motor.sessao.configuracoes[''] = {
    enabledPlugins: { 'csr-lens@cesarschutz': true, 'warp@claude-code-warp': false },
  }
  await $.command.run({ ...COMANDO, command: 'plugin' })
  await motor.relogio.advance(1000)
  await ui.press({ key: 'aba-6' })
  await mostra(ui, /^ Plugins 1\/2 $/)
  await ui.unmount()
})

test('/lens com o nome de uma aba abre nela; /inventario abre no inventário', async ($, on) => {
  const motor = ligar(on)
  await $.session.start(INICIO)
  expect((await $.command.run({ ...COMANDO, args: 'arvore' })).text).toBeUndefined()
  const ui = await $.ui.mount({ ...PAINEL, surface: 'terminal', props: painel() })
  await mostra(ui, /^ ▤ Árvore $/)
  // Com o painel aberto, o nome de outra aba troca de aba e não fecha.
  await $.command.run({ ...COMANDO, args: 'Inventário' })
  await mostra(ui, /^ ▦ Inventário $/)
  expect(motor.visto.fechados).toEqual([])
  // O número é a posição na barra: a 4ª é Diffs, a 3ª é Turnos.
  await $.command.run({ ...COMANDO, args: '4' })
  await mostra(ui, /^ ◧ Diffs $/)
  await $.command.run({ ...COMANDO, args: '3' })
  await mostra(ui, /^ ◷ Turnos $/)
  await $.command.run({ ...COMANDO, command: 'inventario' })
  await mostra(ui, /^ ▦ Inventário $/)
  expect((await $.command.run({ ...COMANDO, args: 'xyz' })).text).toMatch(/não conheço a aba "xyz"/)
  await ui.unmount()
})

test('turnos agrupados: o retorno de um agente em segundo plano entra no turno do pedido', async ($, on) => {
  const motor = ligar(on)
  motor.uso = uso(80_000, 40, 1.2)
  motor.responder = () => ({ result: { structuredPatch: [] }, text: 'ok' })
  await $.session.start(INICIO)

  await $.turn.start({ text: 'rode 2 agentes', turnId: 't1' })
  const um = await $.agent.spawn(subagente('a1', 'Explore', 'previsão de Lisboa'))
  const dois = await $.agent.spawn(subagente('a2', 'Plan', 'previsão de Tóquio'))
  await $.tool.call({ tool: 'Read', file_path: '/proj/a.ts' })
  await $.turn.complete(fimDoTurno('t1', 'Agentes lançados.', 4000))
  const medir = async (tokens: number, usd: number) => {
    motor.uso = uso(tokens, 40, usd)
    await $.session.measure({ ...motor.uso, changed: ['context', 'cost'] })
  }
  await medir(82_000, 1.3)

  // O Claude Code abre um turno sozinho a cada agente que volta.
  await $.turn.start({
    text: `<task-notification>\n<task-id>${String(um.agentId)}</task-id>\n<result>Lisboa: sol</result>\n</task-notification>`,
    turnId: 't2',
  })
  await $.tool.call({ tool: 'Edit', file_path: '/proj/a.ts', old_string: 'a', new_string: 'b' })
  await $.turn.complete(fimDoTurno('t2', 'Lisboa pronta.', 3000))
  await medir(83_000, 1.45)
  await $.turn.start({
    text: `<agent-message from="${String(dois.agentId)}"> [Subagent hand-back] Tóquio: chuva</agent-message>`,
    turnId: 't3',
  })
  await $.turn.complete(fimDoTurno('t3', 'As duas previsões estão prontas.', 2000))
  await medir(84_000, 1.5)

  await $.turn.start({ text: 'obrigado', turnId: 't4' })
  await $.turn.complete(fimDoTurno('t4', 'De nada.', 1000))

  for (const surface of SUPERFICIES) {
    const ui = await $.ui.mount({ ...PAINEL, surface, props: painel('dock', 100) })
    await ui.press({ key: 'aba-4' })
    // Quatro turnos do motor, dois pedidos da pessoa.
    await mostra(ui, 'Turnos · 2')
    expect((await ui.find({ key: 'ver-turno-2' }))?.props.label).toBe('Turno 2')
    await mostra(ui, 'obrigado')
    await mostra(ui, 'rode 2 agentes')
    await mostra(ui, /^9,0s$/)
    // Contexto e custo contam do pedido até o último retorno, sem somar em dobro.
    await mostraEtiquetas(ui, ['+4k de contexto', 'US$ 0,30', '2 ferramentas', '1 edição', '2 retornos de agentes'])
    expect(await ui.find({ key: 'ver-turno-3' })).toBeUndefined()

    await ui.press({ key: 'ver-turno-1' })
    expect(await ui.find({ type: 'Markdown', text: 'rode 2 agentes' })).toBeDefined()
    expect(await ui.find({ type: 'Markdown', text: 'Agentes lançados.' })).toBeDefined()
    await mostra(ui, 'Depois do retorno do agente Explore')
    expect(await ui.find({ type: 'Markdown', text: 'Lisboa pronta.' })).toBeDefined()
    await mostra(ui, 'Depois do retorno do agente Plan')
    expect(await ui.find({ type: 'Markdown', text: 'As duas previsões estão prontas.' })).toBeDefined()
    await mostraFerramentas(ui, surface, [['Read', 1], ['Edit', 1]])
    await ui.press({ key: 'voltar' })

    // A edição feita no retorno do agente fica nos diffs do turno 1.
    await ui.press({ key: 'aba-2' })
    await ui.press({ key: 'diff-turno' })
    await mostra(ui, /^ Turno 1 $/)
    await mostra(ui, /^a\.ts$/)
    await ui.press({ key: 'diff-sessao' })

    // Sem resposta própria, o agente mostra o que devolveu ao loop principal.
    await ui.press({ key: 'aba-1' })
    await ui.press({ key: `ver-agente-${String(dois.agentId)}` })
    expect(await ui.find({ type: 'Markdown', text: 'Tóquio: chuva' })).toBeDefined()
    await ui.press({ key: 'voltar' })
    await ui.unmount()
  }
})

test('detalhe de um agente: pedido, chamadas, mensagens, tokens e resultado', async ($, on) => {
  const motor = ligar(on)
  motor.responder = e =>
    e.command === 'npm test'
      ? { isError: true, result: 'Exit code 1', text: 'Exit code 1' }
      : { result: {}, text: 'ok' }
  motor.mensagens = [
    { role: 'user', text: 'Tarefa de Explore', toolUses: [] },
    { role: 'assistant', text: 'Vou começar pelo **README**.', toolUses: [] },
    { role: 'assistant', text: '', toolUses: [] },
  ]
  await $.session.start(INICIO)
  const explore = await $.agent.spawn(subagente('t1', 'Explore', 'procurar hooks'))
  const id = String(explore.agentId)
  await $.tool.call(doAgente({ tool: 'Read', file_path: '/proj/README.md' }, id))
  await $.tool.call(doAgente({ tool: 'Bash', command: 'npm test' }, id))

  for (const surface of SUPERFICIES) {
    const ui = await $.ui.mount({ ...PAINEL, surface, props: painel('dock', 100) })
    // O painel abre na Visão geral: estes testes são da aba Agentes.
    if ((await ui.find({ key: 'aba-1' })) !== undefined) {
      await ui.press({ key: 'aba-1' })
    }
    await ui.press({ key: `ver-agente-${id}` })
    expect((await ui.find({ key: 'voltar' }))?.props.hotkey).toBe('v')
    // No terminal, o tipo numa linha só dele e os números em etiquetas; no
    // Desktop, um painel desenhado com o nome grande e os números em ladrilhos.
    if (surface === 'terminal') {
      await mostra(ui, /Explore/)
      await mostra(ui, /^ 2 chamadas $/)
    } else {
      const cabecalho = String((await ui.findAll({ type: 'Svg' })).find(svg => String(svg.props.alt).startsWith('procurar hooks'))?.props.alt)
      expect(cabecalho).toContain('Explore')
      expect(cabecalho).toContain('Chamadas 2')
    }
    expect((await ui.find({ type: 'Markdown', text: 'Tarefa de Explore' }))?.props.dimColor).toBe(true)
    // O gráfico das ferramentas e as chamadas, com o Bash entre elas (sem a
    // lista só do Bash, que repetia as mesmas linhas).
    await mostra(ui, 'Ferramentas')
    await naoMostra(ui, 'Comandos Bash')
    await mostra(ui, 'Últimas chamadas')
    // Cada chamada abre o que recebeu e o que devolveu.
    const leitura = (await ui.findAll({ type: 'Button' })).find(botao => botao.props.label === 'Read README.md')
    expect(leitura).toBeDefined()
    await ui.press({ key: String(leitura?.key) })
    await mostra(ui, /^Entrada$/)
    expect(await ui.find({ type: 'Code', text: /"file_path": "\/proj\/README\.md"/ })).toBeDefined()
    await ui.press({ key: String(leitura?.key) })
    await naoMostra(ui, /^Entrada$/)
    // As mensagens vêm da transcrição do agente, lida ao abrir.
    expect(await ui.find({ type: 'Markdown', text: 'Vou começar pelo **README**.' })).toBeDefined()
    await ui.press({ key: 'voltar' })
    await mostra(ui, 'Rodando · 1')
    await ui.unmount()
  }

  expect(motor.visto.ordem.filter(passo => passo === `session.messages ${id}`)).toHaveLength(2)

  await $.turn.complete({
    ...fimDoTurno('s1', '## Achado\nO hook fica em `src/a.ts`.', 9000, id),
    usage: {
      input_tokens: 1200,
      output_tokens: 800,
      cache_read_input_tokens: 40_000,
      cache_creation_input_tokens: 2000,
      model: 'claude-haiku-4-5-20251001',
    },
  })

  // O painel aberto acompanha em até 2,5 s.
  await motor.relogio.advance(3000)
  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop', props: painel('dock', 100) })
  // O painel abre na Visão geral: estes testes são da aba Agentes.
  if ((await ui.find({ key: 'aba-1' })) !== undefined) {
    await ui.press({ key: 'aba-1' })
  }
  await mostraEtiquetas(ui, ["44k tokens"])
  await ui.press({ key: `ver-agente-${id}` })
  const tokensDoAgente = String((await ui.findAll({ type: 'Svg' })).find(svg => String(svg.props.alt).includes('Entrada 43,2k'))?.props.alt)
  expect(tokensDoAgente).toContain('Cache lido 40k')
  expect(tokensDoAgente).toContain('Saída 800')
  expect(await ui.find({ type: 'Markdown', text: 'O hook fica em `src/a.ts`.' })).toBeDefined()
  await mostra(ui, 'Resposta')
  expect((await ui.find({ key: 'mensagens' }))?.props.hotkey).toBe('m')
  // Trocar de aba fecha o detalhe.
  await ui.press({ key: 'aba-2' })
  await ui.press({ key: 'aba-1' })
  await mostra(ui, 'Concluídos · 1')
  await ui.unmount()
})

test('custo e contexto por agente: o que o custo da sessão sobe a cada resposta vai para quem a fez', async ($, on) => {
  const motor = ligar(on)
  // Sessão retomada: o US$ 1,00 de antes não é de nenhum agente.
  motor.uso = uso(100_000, 50, 1)
  await $.session.start(INICIO)
  const explore = await $.agent.spawn(subagente('t1', 'Explore', 'procurar hooks'))
  const plan = await $.agent.spawn(subagente('t2', 'Plan', 'planejar'))
  const consumo = (lidos: number) => ({
    input_tokens: 1000,
    output_tokens: 500,
    cache_read_input_tokens: lidos,
    cache_creation_input_tokens: 1500,
    model: 'claude-haiku-4-5-20251001',
  })
  // Uma resposta do modelo, depois da qual a sessão custa `usd`.
  const responder = async (usd: number, lidos: number, agentId?: string) => {
    motor.uso = uso(100_000, 50, usd)
    motor.passo = consumo(lidos)
    const fluxo = $.turn.step({
      turnId: 's1',
      index: 0,
      model: 'claude-haiku-4-5-20251001',
      messageCount: 3,
      ...(agentId === undefined ? {} : { agentId }),
    })

    // Lê o fluxo até o fim: o que ele devolve é o resultado da resposta.
    let pedaco = await fluxo.next()

    while (pedaco.done !== true) {
      pedaco = await fluxo.next()
    }

    return pedaco.value
  }

  // O resultado de cada resposta passa intacto.
  expect((await responder(1.1, 30_000))?.usage).toEqual(consumo(30_000))
  await responder(1.12, 18_000, explore.agentId)
  await responder(1.17, 18_000, plan.agentId)
  await responder(1.18, 20_000, explore.agentId)
  await $.session.measure({ ...motor.uso, changed: ['cost'] })

  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop', props: painel('dock', 100) })

  // O painel abre na Visão geral: estes testes são da aba Agentes.

  if ((await ui.find({ key: 'aba-1' })) !== undefined) {

    await ui.press({ key: 'aba-1' })

  }
  await mostraEtiquetas(ui, ['Haiku 4.5', 'contexto 23k', 'US$ 0,03', 'contexto 21k', 'US$ 0,05'])
  await ui.press({ key: `ver-agente-${String(explore.agentId)}` })
  const cabecalho = String((await ui.findAll({ type: 'Svg' })).find(svg => String(svg.props.alt).includes('Contexto 23k'))?.props.alt)
  expect(cabecalho).toContain('Custo US$ 0,03')
  // O total em dinheiro, no alto da aba Turnos.
  await ui.press({ key: 'aba-4' })
  await mostra(ui, ' · US$ 1,18 na sessão')
  await ui.press({ key: 'aba-1' })
  await ui.unmount()
})

test('detalhe de um comando: comando inteiro e saída, sem caracteres de controle', async ($, on) => {
  const motor = ligar(on)
  motor.responder = e =>
    e.command === 'npm test'
      ? { isError: true, result: 'Exit code 1\n2 falhas', text: 'Exit code 1\n2 falhas' }
      : {
          result: { stdout: '\u001b[32mok\u001b[0m\r\nfim\n', stderr: 'aviso', interrupted: false },
          text: 'ok',
        }
  await $.session.start(INICIO)
  await $.turn.start({ text: 'confere', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  await $.tool.call({ tool: 'Bash', command: 'npm run check', description: 'Confere os tipos' })

  for (const surface of SUPERFICIES) {
    const ui = await $.ui.mount({ ...PAINEL, surface, props: painel('dock', 100) })
    await ui.press({ key: 'aba-4' })
    await ui.press({ key: 'ver-turno-1' })
    const botoes = (await ui.findAll({ type: 'Button' })).filter(botao =>
      String(botao.key).startsWith('ver-comando-'),
    )
    expect(botoes).toHaveLength(2)

    // Na ordem em que rodaram: primeiro o que falhou.
    await ui.press({ key: String(botoes[0]?.key) })
    await mostra(ui, /exit 1/)
    expect((await ui.find({ type: 'Code', text: 'npm test' }))?.props.language).toBe('bash')
    expect(await ui.find({ type: 'Code', text: 'Exit code 1\n2 falhas' })).toBeDefined()
    await ui.press({ key: 'voltar' })

    await ui.press({ key: String(botoes[1]?.key) })
    await mostra(ui, 'Confere os tipos')
    // As cores ANSI e o \r saem; sobra o texto.
    expect((await ui.find({ type: 'Code', text: 'ok\nfim' }))?.text).toBe('ok\nfim')
    await mostra(ui, 'Saída de erro')
    await ui.press({ key: 'voltar' })
    await mostra(ui, 'Comandos Bash · 2')
    await ui.press({ key: 'voltar' })
    await ui.press({ key: 'aba-1' })
    await ui.unmount()
  }
})

test('detalhe de um turno: pedido e resposta inteiros e ferramentas usadas', async ($, on) => {
  const motor = ligar(on)
  motor.uso = uso(80_000, 40, 1.2)
  const pedido = `ajusta o README\ne publica\n${'detalhe '.repeat(30)}`
  await $.session.start(INICIO)
  await $.turn.start({ text: pedido, turnId: 't1' })
  await $.tool.call({ tool: 'Read', file_path: '/proj/README.md' })
  await $.tool.call({ tool: 'Read', file_path: '/proj/a.ts' })
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await $.turn.complete(fimDoTurno('t1', '**Feito.** O README foi ajustado.', 72_000))
  motor.uso = uso(85_500, 43, 1.4)
  await $.session.measure({ ...motor.uso, changed: ['context', 'cost'] })

  for (const surface of SUPERFICIES) {
    const ui = await $.ui.mount({ ...PAINEL, surface, props: painel('dock', 100) })
    await ui.press({ key: 'aba-4' })
    await ui.press({ key: 'ver-turno-1' })
    // No terminal, o título e os números em etiquetas; no Desktop, um painel
    // desenhado com o número do turno grande e os números em ladrilhos.
    if (surface === 'terminal') {
      await mostra(ui, /^Turno 1$/)
      await mostraEtiquetas(ui, ['+5,5k de contexto', 'US$ 0,20'])
    } else {
      const cabecalho = String((await ui.findAll({ type: 'Svg' })).find(svg => String(svg.props.alt).startsWith('Turno 1 · '))?.props.alt)
      expect(cabecalho).toContain('Contexto +5,5k')
      expect(cabecalho).toContain('Custo US$ 0,20')
    }
    await mostra(ui, 'Ferramentas · 3')
    await mostraFerramentas(ui, surface, [['Read', 2], ['Bash', 1]])
    // O pedido inteiro, e não só a primeira linha da lista.
    expect((await ui.find({ type: 'Markdown', text: 'e publica' }))?.text).toBe(pedido)
    expect(await ui.find({ type: 'Markdown', text: '**Feito.** O README foi ajustado.' })).toBeDefined()
    await ui.press({ key: 'voltar' })
    await mostra(ui, 'Turnos · 1')
    await ui.press({ key: 'aba-1' })
    await ui.unmount()
  }
})

test('só observa: a entrada e o resultado de cada chamada passam intactos', async ($, on) => {
  const motor = ligar(on)
  const resposta: ToolCallResult = {
    result: { stdout: 'oi', stderr: '', interrupted: false },
    text: 'oi',
    ref: 7,
    isReadOnly: true,
  }
  motor.responder = e => (e.tool === 'Write' ? { deny: 'bloqueado por outra regra' } : resposta)
  await $.session.start(INICIO)

  const entrada = { tool: 'Bash', command: '  ls -la  ', description: 'lista' } as const
  expect(await $.tool.call(entrada)).toEqual(resposta)
  expect(motor.visto.chamadas.at(-1)).toMatchObject(entrada)

  const escrita = { tool: 'Write', file_path: '/proj/x.ts', content: 'y\n' } as const
  expect(await $.tool.call(escrita)).toEqual({ deny: 'bloqueado por outra regra' })
  expect(motor.visto.chamadas.at(-1)).toMatchObject(escrita)

  expect(await $.agent.spawn(subagente('t1', 'Explore', 'x'))).toEqual({
    model: 'claude-haiku-4-5-20251001',
    agentId: 'ag-t1',
  })
  expect(await $.turn.start({ text: 'oi', turnId: 't1' })).toEqual({ turnId: 't1' })
  expect(await $.turn.complete(fimDoTurno('t1', 'resposta', 10))).toMatchObject({ text: 'resposta' })
})

test('/lens abre na Visão geral, com foco e Esc fechando, e fecha na segunda vez; 1 a 7 trocam de aba', async ($, on) => {
  const motor = ligar(on)
  await $.session.start(INICIO)

  // Abrir e fechar não escrevem nada na conversa: o painel é a resposta.
  expect((await $.command.run(COMANDO)).text).toBeUndefined()
  expect(motor.visto.abertos).toEqual([{ id: MOD, focus: true, closeOnEscape: true }])

  for (const surface of SUPERFICIES) {
    const ui = await $.ui.mount({ ...PAINEL, surface, props: painel() })
    // A marca no topo: o selo laranja com o nome.
    expect(await fundoDoSelo(ui, '✦ CSR Lens')).toBe('#0d80bf')
    // O painel abre na Visão geral: a aba aberta é um selo na cor dela, com o
    // ícone; as fechadas, botões com a tecla.
    expect(await fundoDoSelo(ui, '◉ Visão geral')).toBe('#0d80bf')
    // Painel estreito (60 colunas): as abas fechadas mostram só o ícone.
    expect((await ui.find({ key: 'aba-2' }))?.props.label).toBe('◧')

    // A tecla é a posição na barra: Visão geral, Agentes, Turnos, Diffs,
    // Árvore, Contexto e Inventário.
    for (const [aba, tecla] of [['1', '2'], ['4', '3'], ['2', '4'], ['5', '5'], ['3', '6'], ['6', '7']] as const) {
      expect((await ui.find({ key: `aba-${aba}` }))?.props.hotkey).toBe(tecla)
    }

    await ui.press({ key: 'aba-3' })
    expect(await fundoDoSelo(ui, '◔ Contexto')).toBe('#58a6ff')
    expect((await ui.find({ key: 'aba-0' }))?.props.hotkey).toBe('1')
    expect(await ui.find({ key: 'aba-3' })).toBeUndefined()
    await ui.press({ key: 'aba-0' })
    await ui.unmount()
  }

  // No painel largo, ícone e nome.
  const largo = await $.ui.mount({ ...PAINEL, surface: 'desktop', props: painel('dock', 100) })
  expect((await largo.find({ key: 'aba-2' }))?.props.label).toBe('◧ Diffs')
  await largo.unmount()

  expect((await $.command.run(COMANDO)).text).toBeUndefined()
  expect(motor.visto.fechados).toEqual([MOD])
})

test('sem lugar ao lado: versão compacta acima do prompt', async ($, on) => {
  const motor = ligar(on)
  await $.session.start(INICIO)
  const explore = await $.agent.spawn(subagente('t1', 'Explore', 'procurar hooks'))
  await $.tool.call(doAgente({ tool: 'Read', file_path: '/proj/src/a.ts' }, explore.agentId))

  motor.semLugar = true
  expect((await $.command.run(COMANDO)).text).toMatch(/compacta acima do prompt/)
  // O painel que não teve lugar não fica aberto à espera.
  expect(motor.visto.fechados).toEqual([MOD])

  for (const surface of SUPERFICIES) {
    const ui = await $.ui.mount({ plugin: MOD, surface, component: 'AbovePrompt', props: faixa() })
    // A faixa também abre na Visão geral; os agentes, na aba deles.
    if ((await ui.find({ key: 'aba-1' })) !== undefined) {
      await ui.press({ key: 'aba-1' })
    }
    await mostra(ui, 'Rodando · 1')
    // Compacta: o agente e a atividade numa linha só.
    await mostra(ui, /^● Explore · Haiku 4\.5 · \d+s · Read src\/a\.ts$/)
    // A tecla é a posição na barra: Diffs é a 4ª.
    expect((await ui.find({ key: 'aba-2' }))?.props.hotkey).toBe('4')
    expect(await ui.find({ key: 'fechar' })).toBeDefined()
    // Na versão compacta, só as iniciais no selo, na linha das abas.
    expect(await fundoDoSelo(ui, '✦ CSR')).toBe('#0d80bf')
    await naoMostra(ui, /CSR Lens/)
    await ui.unmount()
  }

  // O mesmo desenho compacto quando o painel senta acima do prompt.
  const sentado = await $.ui.mount({ ...PAINEL, surface: 'desktop', props: painel('inline') })
  // O painel abre na Visão geral: estes testes são da aba Agentes.
  if ((await sentado.find({ key: 'aba-1' })) !== undefined) {
    await sentado.press({ key: 'aba-1' })
  }
  await mostra(sentado, /^● Explore · Haiku 4\.5 · \d+s · Read src\/a\.ts$/)
  expect(await sentado.find({ key: 'fechar' })).toBeUndefined()
  await sentado.unmount()

  const ui = await $.ui.mount({
    plugin: MOD,
    surface: 'desktop',
    component: 'AbovePrompt',
    props: faixa(),
  })
  await ui.press({ key: 'fechar' })
  expect(await ui.find({ key: 'fechar' })).toBeUndefined()
  await naoMostra(ui, 'Rodando · 1')
  await ui.unmount()

  // /lens também fecha a faixa.
  expect((await $.command.run(COMANDO)).text).toMatch(/compacta/)
  expect((await $.command.run(COMANDO)).text).toBeUndefined()
})

test('grafo dos agentes: quem criou quem e as mensagens entre eles', async ($, on) => {
  ligar(on)
  await $.session.start(INICIO)
  await $.turn.start({ text: 'planeje e revise', turnId: 't1' })
  const plan = await $.agent.spawn(subagente('p1', 'Plan', 'Planejar'))
  const revisor = await $.agent.spawn({ ...subagente('r1', 'code-reviewer', 'Revisar o plano'), parentAgentId: plan.agentId, name: 'revisor' })
  // O Plan manda duas mensagens ao revisor pelo nome; a conversa principal, uma.
  for (const texto of ['veja o frete', 'e os testes']) {
    await $.session.send({ to: 'revisor', text: texto, origin: { kind: 'model' }, ...(plan.agentId === undefined ? {} : { agentId: plan.agentId }) })
  }
  await $.session.send({ to: String(revisor.agentId), text: 'pressa', origin: { kind: 'model' } })
  // Um recado do revisor a um nome que ninguém carrega: não chega.
  await $.session.send({ to: 'ninguem-aqui', text: 'oi?', origin: { kind: 'model' }, ...(revisor.agentId === undefined ? {} : { agentId: revisor.agentId }) })

  // No Desktop, o grafo: o centro, os dois agentes, um ponto correndo pelo
  // fio do Plan ao revisor (o revisor acabou de nascer) e as mensagens contadas.
  const desktop = await $.ui.mount({ ...PAINEL, surface: 'desktop', props: painel('dock', 100) })
  // O painel abre na Visão geral: estes testes são da aba Agentes.
  if ((await desktop.find({ key: 'aba-1' })) !== undefined) {
    await desktop.press({ key: 'aba-1' })
  }
  await mostra(desktop, 'Quem chamou quem')
  const grafo = (await desktop.findAll({ type: 'Svg' })).find(svg => String(svg.props.alt).startsWith('A conversa principal'))
  const fonte = String(grafo?.props.source)
  expect(grafo?.props.isInteractive).toBe(true)
  expect(fonte).toContain('>Principal</text>')
  // Cada nó com a tarefa do agente e, menor embaixo, o tipo.
  expect(fonte).toContain('>Planejar</text><text class="tipo"')
  expect(fonte).toContain('>Plan</text>')
  expect(fonte).toContain('>Revisar o plano</text><text class="tipo"')
  expect(fonte).toContain('>code-reviewer</text>')
  expect(fonte).toContain('>✉ 2</text>')
  expect(fonte).toContain('>✉ 1</text>')
  expect(fonte).toContain('<animateMotion')
  // O selo no fio: a tarefa entregue e o revisor ainda trabalhando.
  expect(fonte).toContain('>↓ <tspan class="c-azul">…</tspan></text>')
  // As dicas das linhas: o fio diz quem criou, a tarefa e o resultado; o
  // recado, o texto.
  expect(fonte).toContain('.fa1:hover~.fd1{opacity:1;transition-delay:0s}')
  expect(fonte).toContain('Planejar criou Revisar o plano')
  expect(fonte).toContain('… trabalhando, ainda sem resultado')
  expect(fonte).toContain('✉ &quot;veja o frete&quot;')
  // O recado que não chegou: um ✕ no revisor, e o motivo na dica dele.
  expect(fonte).toContain('>✕1</text>')
  // A legenda explica as duas linhas, numa fileira de símbolos.
  await mostra(desktop, / trabalhando /)
  await mostra(desktop, / recado perdido/)
  // A dica de cada nó abre na hora.
  expect(fonte).toContain('.na0:hover~.nd0{opacity:1;transition-delay:0s}')
  // A dica de cada agente é do app, no botão sobre o nó: abre na hora, em toda a área clicável.
  const dicasDosNos = (await desktop.findAll({ type: 'Text' }))
    .filter(texto => texto.props.color === '#ececec')
    .map(texto => texto.text)
  expect(dicasDosNos.some(texto => texto.startsWith('Revisar o plano · code-reviewer'))).toBe(true)
  expect(fonte).not.toMatch(/<g class="dica nd1">/)
  // Ampliar: o grafo toma a largura e a altura do painel (num painel estreito,
  // o zoom já está no limite da largura: ele não cresce, mas não diminui).
  const antes = grafo?.props.height as number
  await desktop.press({ key: 'grafo-tamanho' })
  expect((await desktop.find({ key: 'grafo-tamanho' }))?.props.label).toBe('⤡ Reduzir')
  const ampliado = (await desktop.findAll({ type: 'Svg' })).find(svg => String(svg.props.alt).startsWith('A conversa principal'))
  expect(ampliado?.props.height as number).toBeGreaterThanOrEqual(antes)
  // Ampliado, o grafo é a vista inteira: a linha do tempo e os cartões somem.
  await naoMostra(desktop, 'Linha do tempo')
  await desktop.press({ key: 'grafo-tamanho' })
  await mostra(desktop, 'Linha do tempo')
  // O zoom parte de 150% (o tamanho do grafo em todo lugar); − diminui o
  // desenho (e os botões por cima dos nós acompanham), + volta.
  await mostra(desktop, '150%')
  const noAntes = (await desktop.find({ key: `grafo-agente-${String(revisor.agentId)}` }))?.props.label as string
  await desktop.press({ key: 'grafo-menos' })
  await mostra(desktop, '125%')
  const menor = (await desktop.findAll({ type: 'Svg' })).find(svg => String(svg.props.alt).startsWith('A conversa principal'))
  expect(menor?.props.height as number).toBeLessThan(antes)
  // O botão fica só sobre o robô: poucas colunas, que não aumentam ao diminuir.
  expect(((await desktop.find({ key: `grafo-agente-${String(revisor.agentId)}` }))?.props.label as string).length).toBeLessThanOrEqual(noAntes.length)
  await desktop.press({ key: 'grafo-mais' })
  await mostra(desktop, '150%')
  // Um clique no nó (um botão invisível por cima) abre o detalhe do agente,
  // como o "Ver detalhes".
  await desktop.press({ key: `grafo-agente-${String(revisor.agentId)}` })
  await mostra(desktop, 'Pedido que o agente recebeu')
  await desktop.press({ key: 'voltar' })
  // Na linha do tempo, o nome de cada agente é o botão que abre o detalhe.
  expect((await desktop.find({ key: `tempo-agente-${String(plan.agentId)}` }))?.props.label).toBe('Planejar')
  await desktop.press({ key: `tempo-agente-${String(plan.agentId)}` })
  await mostra(desktop, 'Pedido que o agente recebeu')
  await desktop.press({ key: 'voltar' })
  await desktop.unmount()

  // No terminal, uma árvore de texto, com as mensagens embaixo.
  const terminal = await $.ui.mount({ ...PAINEL, surface: 'terminal', props: painel('dock', 100) })
  // O painel abre na Visão geral: estes testes são da aba Agentes.
  if ((await terminal.find({ key: 'aba-1' })) !== undefined) {
    await terminal.press({ key: 'aba-1' })
  }
  await mostra(terminal, /^✦ Principal$/)
  await mostra(terminal, /^└─ ● Plan · Planejar$/)
  await mostra(terminal, /^ {3}└─ ● code-reviewer · Revisar o plano$/)
  await mostra(terminal, /^✉ Plan → code-reviewer · 2 mensagens$/)
  await mostra(terminal, /^✉ Principal → code-reviewer · 1 mensagem$/)
  await mostra(terminal, /^✕ code-reviewer → "ninguem-aqui" · 1 mensagem não chegou$/)
  await terminal.unmount()
})

test('aba 5, Árvore: o nome da pasta abre e fecha, e "Expandir tudo" abre todas', async ($, on) => {
  const motor = ligar(on)
  comRepositorio(motor)
  await $.session.start(INICIO)
  await $.tool.call({ tool: 'Read', file_path: '/proj/src/lib/fundo/x.ts' })

  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop', props: painel('dock', 100) })
  await ui.press({ key: 'aba-5' })
  await mostra(ui, 'O que a sessão leu e editou')
  await ui.press({ key: 'arvore-recolher' })
  expect((await ui.find({ key: 'pasta-/proj/src' }))?.props.label).toBe('▸')
  // Clicar no nome, e não só na setinha, abre a pasta.
  await ui.press({ key: 'nome-da-pasta-/proj/src' })
  expect((await ui.find({ key: 'pasta-/proj/src' }))?.props.label).toBe('▾')
  await ui.press({ key: 'arvore-recolher' })
  await ui.press({ key: 'arvore-expandir' })
  expect((await ui.find({ key: 'pasta-/proj/src' }))?.props.label).toBe('▾')
  await mostra(ui, /^x\.ts$/)
  await ui.unmount()
})

test('detalhe de um turno: os subagentes dele, com o grafo, o pedido, a resposta e o detalhe de cada um', async ($, on) => {
  ligar(on)
  await $.session.start(INICIO)
  await $.turn.start({ text: 'planeje', turnId: 't1' })
  const plan = await $.agent.spawn({ ...subagente('p1', 'Plan', 'Planejar'), prompt: 'Planeje a refatoração do carrinho' })
  const revisor = await $.agent.spawn({ ...subagente('r1', 'code-reviewer', 'Revisar'), parentAgentId: plan.agentId })
  await $.turn.complete(fimDoTurno('s1', 'Plano em 3 passos.', 4000, plan.agentId))
  await $.turn.complete(fimDoTurno('t1', 'Feito.', 9000))
  // Outro pedido, com outro agente: ele não entra no turno 1.
  await $.turn.start({ text: 'outra coisa', turnId: 't2' })
  await $.agent.spawn(subagente('x1', 'Explore', 'Outra tarefa'))

  for (const surface of SUPERFICIES) {
    const ui = await $.ui.mount({ ...PAINEL, surface, props: painel('dock', 100) })
    await ui.press({ key: 'aba-4' })
    await ui.press({ key: 'ver-turno-1' })
    await mostra(ui, 'Subagentes · 2')
    await naoMostra(ui, 'Quem chamou quem')
    await naoMostra(ui, 'Outra tarefa')
    await mostra(ui, 'Planeje a refatoração do carrinho')
    await mostra(ui, 'Plano em 3 passos.')
    await mostra(ui, 'ainda trabalhando')

    if (surface === 'desktop') {
      const grafo = (await ui.findAll({ type: 'Svg' })).find(svg => String(svg.props.alt).startsWith('A conversa principal'))
      expect(String(grafo?.props.alt)).toContain('Planejar (Plan)')
      expect(String(grafo?.props.alt)).not.toContain('Outra tarefa')
    }

    // O detalhe do agente abre de dentro do turno, e o Voltar volta ao turno.
    await ui.press({ key: `ver-agente-${String(plan.agentId)}` })
    await mostra(ui, 'Pedido que o agente recebeu')
    await ui.press({ key: 'voltar' })
    await mostra(ui, 'Subagentes · 2')
    await ui.press({ key: 'voltar' })
    await ui.press({ key: 'aba-1' })
    await ui.unmount()
  }
  expect(revisor.agentId).toBeDefined()
})

test('painel estreito e nomes compridos: o ramo e o arquivo perdem o meio; as setas, as contas e o selo não quebram', async ($, on) => {
  const motor = ligar(on)
  comRepositorio(motor)
  const RAMO = 'feature/checkout-redesign-with-a-very-long-branch-name-that-keeps-going'
  motor.comandos['git status --porcelain=v1 -b -z --untracked-files=all'] =
    `## ${RAMO}...origin/${RAMO} [ahead 12, behind 3]\0 M src/a.ts\0`
  motor.comandos['git diff HEAD --numstat -z'] = '320\t51\tsrc/a.ts\0'
  let soltar: (saida: ToolCallResult) => void = () => undefined
  const preso = new Promise<ToolCallResult>(resolve => {
    soltar = resolve
  })
  const trecho = { oldStart: 1, oldLines: 1, newStart: 1, newLines: 2, lines: [' const a = 1', '+const b = 2'] }
  motor.responder = e =>
    e.tool === 'Write' ? preso : { result: { filePath: e.file_path, structuredPatch: [trecho] }, text: 'ok' }
  await $.session.start(INICIO)
  await $.turn.start({ text: 'edita', turnId: 't1' })
  await $.tool.call({ tool: 'Edit', file_path: '/proj/src/a.ts', old_string: 'x', new_string: 'y' })
  await $.tool.call({
    tool: 'Edit',
    file_path: '/proj/src/payment_intent_succeeded.handler.spec.ts',
    old_string: 'x',
    new_string: 'y',
  })
  // Uma escrita que ainda não terminou: o arquivo aceso.
  const escrita = $.tool.call({ tool: 'Write', file_path: '/proj/src/c.ts', content: 'x\n' })
  await motor.relogio.advance(2000)

  // A 60 colunas, a árvore: o ramo perde o meio e as setas ficam; o remoto, sem lugar, sai.
  const estreito = await $.ui.mount({ ...PAINEL, surface: 'desktop', props: painel('dock', 60) })
  await estreito.press({ key: 'aba-5' })
  const ramo = String((await estreito.findAll({ type: 'Svg' })).find(svg => String(svg.props.alt).startsWith('Ramo '))?.props.alt)
  const nome = ramo.slice('Ramo '.length).split(' ')[0] ?? ''
  expect(nome).toMatch(/^feature\/.*…/)
  expect(nome.length).toBeLessThan(RAMO.length)
  // O fim do nome fica (o corte é no meio); em letra grande, cabe menos dele.
  expect(nome).toMatch(/…[\w-]*going$/)
  expect(ramo).toContain(' ↑12 ↓3')
  expect(ramo).not.toMatch(/origin\//)
  // As contas da direita numa Box que não encolhe (o Text de fora, sem props,
  // sai sem a chave); o selo sai do estreito e fica o ◉ laranja.
  expect(JSON.stringify(await estreito.drawn())).toMatch(
    new RegExp(`"flexShrink":0\\},"children":\\[\\{"type":"Text",(?:"props":\\{[^}]*\\},)?"children":\\[\\{"type":"Text","props":\\{"color":"${VERDE}"\\},"children":\\[" \\+32\\d"\\]`),
  )
  await naoMostra(estreito, /^ editando… $/)
  expect(await corDe(estreito, /^ ◉ $/)).toBe(LARANJA)
  await estreito.press({ key: 'aba-1' })
  await estreito.unmount()

  // A 110 colunas, os diffs lado a lado: o nome comprido cabe na lista,
  // cortado pelo meio e com a extensão; e o selo da árvore, com lugar, inteiro.
  const largo = await $.ui.mount({ ...PAINEL, surface: 'desktop', props: painel('dock', 110) })
  await largo.press({ key: 'aba-2' })
  const rotulo = String(
    (await largo.find({ key: 'ver-arquivo-/proj/src/payment_intent_succeeded.handler.spec.ts' }))?.props.label,
  )
  expect(rotulo).toMatch(/^payment_\S*…\S*\.spec\.ts$/)
  expect(rotulo.length).toBeLessThanOrEqual(24)
  await largo.press({ key: 'aba-5' })
  expect(await fundoDoSelo(largo, 'editando…')).toBe('#f0883e')
  await largo.press({ key: 'aba-1' })
  await largo.unmount()

  soltar({ result: { type: 'create', structuredPatch: [] }, text: 'ok' })
  await escrita
})

test('pílulas: um ramo comprido perde o meio para a pílula do git caber na fileira', async ($, on) => {
  const motor = ligar(on)
  comRepositorio(motor)
  const RAMO = 'feature/checkout-redesign-with-a-very-long-branch-name-that-keeps-going'
  motor.comandos['git status --porcelain=v1 -b -z --untracked-files=all'] =
    `## ${RAMO}...origin/${RAMO} [ahead 12]\0 M src/a.ts\0`
  motor.uso = uso(134_400, 67, 1.84)
  await $.session.start(INICIO)
  await $.agent.spawn(subagente('t1', 'Explore', 'procurar hooks'))
  await $.session.measure({ ...motor.uso, changed: ['context'] })

  const ui = await $.ui.mount({ ...FAIXA, surface: 'desktop', props: { ...faixa(), bodyColumns: 60, isWorking: false } })
  const svg = await ui.find({ type: 'Svg' })
  const fonte = String(svg?.props.source)
  // O desenho cabe nas 60 colunas (7,4 px cada): o ramo com a reticência no
  // meio e o fim inteiro, o repositório como está; a dica, com o nome todo.
  expect(Number(svg?.props.width)).toBeLessThanOrEqual(Math.ceil(60 * 7.4) + 1)
  expect(fonte).toMatch(/>feature\/[^<]*…[^<]*keeps-going<\/text>/)
  expect(fonte).toContain('>proj</text>')
  expect(String(svg?.props.alt)).toContain(`ramo ${RAMO}`)
  await ui.unmount()
})

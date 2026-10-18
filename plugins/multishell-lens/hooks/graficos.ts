// Gráficos em SVG para o app Desktop, que desenha o elemento `Svg` como uma
// imagem (o terminal não tem o elemento: lá as abas usam barras de texto).
// O SVG não sabe se o app está em tema claro ou escuro: o texto vai na cor do
// próprio gráfico ou num cinza médio, que se lê nos dois.

import { ESTILO_DOS_DESENHOS, cerebro, robo } from './desenhos'

const FONTE = 'ui-sans-serif, -apple-system, system-ui, sans-serif'
const CINZA = '#8b949e'
const TRILHO = 'rgba(139,148,158,0.25)'

export const escapar = (texto: string): string =>
  texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const num = (valor: number): string => String(Math.round(valor * 10) / 10)

// Uma barra empilhada: cada parte na sua cor, proporcional ao valor.
export const pilha = (partes: readonly { valor: number; cor: string }[], largura = 280): string => {
  const altura = 14
  const total = Math.max(1, partes.reduce((soma, parte) => soma + parte.valor, 0))
  let x = 0
  const blocos = partes.map(parte => {
    const w = (parte.valor / total) * largura
    const bloco = `<rect x="${num(x)}" y="0" width="${num(Math.max(0, w))}" height="${altura}" fill="${parte.cor}"/>`
    x += w

    return bloco
  })

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}" viewBox="0 0 ${largura} ${altura}">`,
    `<clipPath id="r"><rect width="${largura}" height="${altura}" rx="7"/></clipPath>`,
    `<g clip-path="url(#r)"><rect width="${largura}" height="${altura}" fill="${TRILHO}"/>${blocos.join('')}</g>`,
    '</svg>',
  ].join('')
}

// As dicas que o próprio SVG mostra ao passar o mouse. A dica nativa (o
// <title>) demora a abrir e o app não deixa mudar a demora; esta abre na
// hora (ou depois de `atraso` segundos), numa caixa nas cores do tema.
// Cada alvo leva a classe `<p>a<i>` e a sua dica, desenhada depois de todos
// os alvos (para ficar por cima deles), a classe `<p>d<i>`: o CSS liga um ao
// outro. O prefixo `p` separa os gráficos, caso dois dividam a mesma página.
export const estiloDasDicas = (quantas: number, atraso = 0, p = ''): string =>
  [
    '.dica{opacity:0;pointer-events:none;transition:opacity .12s ease 0s}',
    '.dica rect{fill:#ffffff;stroke:rgba(31,35,40,.16)}',
    '.dica text{fill:#1f2328}.dica .fraco{fill:#656d76}',
    '@media (prefers-color-scheme: dark){.dica rect{fill:#2b2a27;stroke:rgba(255,255,255,.14)}.dica text{fill:#ececec}.dica .fraco{fill:#a8a8a8}}',
    ...Array.from({ length: quantas }, (_, i) => `.${p}a${i}:hover~.${p}d${i}{opacity:1;transition-delay:${atraso}s}`),
  ].join('')

// `antes`: um começo em negrito, na mesma linha (o título da dica).
export type LinhaDaDica = { texto: string; isFraco?: boolean; isNegrito?: boolean; antes?: string }

export type MedidaDaDica = {
  fonte: string
  corpo: number
  // A largura média de um caractere, para o tamanho da caixa.
  caractere: number
  // A distância entre as linhas e a folga em cima e embaixo.
  entrelinha: number
  folga: number
}

export const MEDIDA_DA_DICA: MedidaDaDica = { fonte: FONTE, corpo: 11, caractere: 6.4, entrelinha: 15, folga: 6 }

const cortar = (texto: string, cabe: number): string =>
  [...texto].length <= cabe ? texto : `${[...texto].slice(0, Math.max(1, cabe - 1)).join('')}…`

// A caixa da dica `i`: centrada em `cx` (ou começando em `x0`), com o topo em
// `topo` e sem passar da largura do desenho; o texto que não cabe é cortado.
export const caixaDaDica = (
  i: number,
  linhas: readonly LinhaDaDica[],
  posicao: { cx?: number; x0?: number; topo: number },
  limite: number,
  medida: MedidaDaDica = MEDIDA_DA_DICA,
  raio = 6,
  p = '',
): string => {
  const recuo = 9
  const cabe = Math.max(4, Math.floor((limite - 2 - recuo * 2) / medida.caractere))
  const textos = linhas.map(linha => {
    const antes = linha.antes === undefined ? '' : cortar(linha.antes, cabe)

    return { ...linha, antes, texto: cortar(linha.texto, Math.max(1, cabe - [...antes].length)) }
  })
  const maior = Math.max(...textos.map(linha => [...`${linha.antes}${linha.texto}`].length * medida.caractere))
  const w = Math.min(limite - 2, recuo * 2 + maior)
  const h = medida.folga * 2 + medida.entrelinha * textos.length
  const desejado = posicao.x0 ?? (posicao.cx ?? 0) - w / 2
  const x = Math.max(1, Math.min(limite - w - 1, desejado))
  const corpo = textos.map((linha, k) => {
    const y = posicao.topo + medida.folga + k * medida.entrelinha + medida.entrelinha / 2 + medida.corpo * 0.36
    const classe = linha.isFraco === true ? ' class="fraco"' : ''
    const peso = linha.isNegrito === true ? ' font-weight="700"' : ''

    const antes = linha.antes === '' ? '' : `<tspan font-weight="700">${escapar(linha.antes)}</tspan>`
    const texto = linha.antes === '' ? escapar(linha.texto) : `<tspan${classe}>${escapar(linha.texto)}</tspan>`

    return `<text${linha.antes === '' ? classe : ''} x="${num(x + recuo)}" y="${num(y)}" font-family="${medida.fonte}" font-size="${medida.corpo}"${peso}>${antes}${texto}</text>`
  })

  return (
    `<g class="dica ${p}d${i}">` +
    `<rect x="${num(x)}" y="${num(posicao.topo)}" width="${num(w)}" height="${num(h)}" rx="${raio}"/>` +
    corpo.join('') +
    '</g>'
  )
}

export type BarraDoTurno = {
  rotulo: string
  valor: number
  // 'ok', 'falha' ou 'andando': a cor da barra.
  estado: 'ok' | 'falha' | 'andando'
  // A dica: o título em negrito e os detalhes embaixo.
  titulo: string
  dica: string
}

// Barras verticais, uma por turno, da mais antiga à mais nova, com a dica de
// cada uma na hora em que o mouse passa. Tons para o tema claro e o escuro.
export const barrasDosTurnos = (barras: readonly BarraDoTurno[], largura: number): string => {
  const altura = 92
  const base = altura - 16
  const topo = 8
  const maximo = Math.max(1, ...barras.map(barra => barra.valor))
  const passo = barras.length === 0 ? 0 : (largura - 8) / barras.length
  const grossura = Math.max(4, Math.min(28, passo * 0.62))
  const estilo = [
    '<style>',
    ':root{color-scheme:light dark;background:transparent}',
    `text{font-family:${FONTE};font-size:10px;fill:#6e7781}`,
    '.ok{fill:#8957e5}.falha{fill:#cf222e}.andando{fill:#5769f7}.base{stroke:rgba(128,128,128,.35)}',
    '.alvo:hover .barra{opacity:.7}',
    '@media (prefers-color-scheme: dark){text{fill:#8b949e}.ok{fill:#a371f7}.falha{fill:#f85149}.andando{fill:#b1b9f9}}',
    estiloDasDicas(barras.length, 0, 't'),
    '</style>',
  ].join('')
  const colunas = barras.map((barra, i) => {
    const h = Math.max(2, (barra.valor / maximo) * (base - topo))
    const x = 4 + i * passo + (passo - grossura) / 2

    return (
      `<g class="alvo ta${i}">` +
      `<rect class="barra ${barra.estado}" x="${num(x)}" y="${num(base - h)}" width="${num(grossura)}" height="${num(h)}" rx="3"/>` +
      `<rect x="${num(4 + i * passo)}" y="0" width="${num(passo)}" height="${altura}" fill="transparent"/>` +
      `<text x="${num(x + grossura / 2)}" y="${altura - 3}" text-anchor="middle">${escapar(barra.rotulo)}</text></g>`
    )
  })
  // A dica fica acima da barra quando cabe; numa barra alta, no alto do gráfico.
  const dicas = barras.map((barra, i) => {
    const h = Math.max(2, (barra.valor / maximo) * (base - topo))
    const cx = 4 + i * passo + passo / 2
    const alturaDaCaixa = MEDIDA_DA_DICA.folga * 2 + MEDIDA_DA_DICA.entrelinha * 2

    return caixaDaDica(
      i,
      [{ texto: barra.titulo, isNegrito: true }, { texto: barra.dica, isFraco: true }],
      { cx, topo: Math.max(1, base - h - alturaDaCaixa - 4) },
      largura,
      MEDIDA_DA_DICA,
      6,
      't',
    )
  })

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(largura)}" height="${altura}" viewBox="0 0 ${Math.round(largura)} ${altura}" style="color-scheme:light dark">`,
    estilo,
    `<line class="base" x1="0" y1="${base + 0.5}" x2="${Math.round(largura)}" y2="${base + 0.5}"/>`,
    ...colunas,
    ...dicas,
    '</svg>',
  ].join('')
}

// Cores dos gráficos, com um tom para o tema claro e outro para o escuro.
export const PALETA = {
  // O mesmo tom do "suggestion" do tema do app, o azul do texto "rodando".
  azul: ['#5769f7', '#b1b9f9'],
  roxo: ['#8957e5', '#a371f7'],
  verde: ['#1a7f37', '#3fb950'],
  vermelho: ['#cf222e', '#f85149'],
  ambar: ['#9a6700', '#d29922'],
  ciano: ['#1b7c83', '#39c5cf'],
  cinza: ['#8c959f', '#6e7681'],
} as const

export type CorDoGrafico = keyof typeof PALETA

// As classes `.c-<cor>` (preenchimento) de cada cor da paleta, nos dois temas.
const estiloDaPaleta = (): string =>
  [
    ...Object.entries(PALETA).map(([nome, [claro]]) => `.c-${nome}{fill:${claro}}`),
    '@media (prefers-color-scheme: dark){',
    ...Object.entries(PALETA).map(([nome, [, escuro]]) => `.c-${nome}{fill:${escuro}}`),
    '}',
  ].join('')

const ESTILO_BASE = [
  ':root{color-scheme:light dark;background:transparent}',
  `text{font-family:${FONTE};font-size:11px;fill:#57606a}`,
  '.forte{fill:#1f2328}.trilho{fill:rgba(128,128,128,.14)}.guia{stroke:rgba(128,128,128,.3)}',
  '@media (prefers-color-scheme: dark){text{fill:#8b949e}.forte{fill:#e6edf3}}',
].join('')

export type BarraHorizontal = {
  rotulo: string
  valor: number
  // O que vai escrito depois da barra; sem ele, o valor.
  texto?: string
  cor: CorDoGrafico
}

export const ALTURA_DA_BARRA_HORIZONTAL = 30

// Barras deitadas, uma por linha: o rótulo à esquerda, a barra num trilho e o
// número no fim, em letra de painel (14 px). Para contagens (as ferramentas
// mais chamadas, por exemplo).
export const barrasHorizontais = (barras: readonly BarraHorizontal[], largura: number): string => {
  const linha = ALTURA_DA_BARRA_HORIZONTAL
  const letra = 8.2
  const altura = barras.length * linha
  const rotulo = Math.min(200, Math.max(60, ...barras.map(barra => [...barra.rotulo].length * letra + 14)))
  const numero = Math.max(36, ...barras.map(barra => [...(barra.texto ?? String(barra.valor))].length * letra + 14))
  const trilho = Math.max(40, largura - rotulo - numero)
  const maximo = Math.max(1, ...barras.map(barra => barra.valor))
  const linhas = barras.map((barra, i) => {
    const y = i * linha
    const w = Math.max(4, (barra.valor / maximo) * trilho)

    return (
      `<text class="forte" x="0" y="${num(y + 20)}" font-size="14" font-weight="600">${escapar(cortar(barra.rotulo, Math.floor((rotulo - 14) / letra)))}</text>` +
      `<rect class="trilho" x="${num(rotulo)}" y="${num(y + 8)}" width="${num(trilho)}" height="14" rx="7"/>` +
      `<rect class="c-${barra.cor}" x="${num(rotulo)}" y="${num(y + 8)}" width="${num(w)}" height="14" rx="7"/>` +
      `<text class="forte" x="${num(rotulo + trilho + 10)}" y="${num(y + 20)}" font-size="14" font-weight="700">${escapar(barra.texto ?? String(barra.valor))}</text>`
    )
  })

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(largura)}" height="${altura}" viewBox="0 0 ${Math.round(largura)} ${altura}" style="color-scheme:light dark">`,
    `<style>${ESTILO_BASE}${estiloDaPaleta()}</style>`,
    ...linhas,
    '</svg>',
  ].join('')
}

// Um trecho da barra de um agente: uma rodada (o mesmo agente acordado por um
// recado trabalha mais de uma vez, e cada vez é um trecho na mesma linha).
export type TrechoDaFaixa = {
  inicio: number
  fim: number
  estado: 'rodando' | 'ok' | 'falhou'
  // A dica do trecho ("rodada 2 · 30s").
  dica?: string
}

export type FaixaDoAgente = {
  trechos: readonly TrechoDaFaixa[]
  // Escrito ao lado da barra (a duração somada).
  tempo: string
}

const COR_DA_FAIXA = { rodando: 'azul', ok: 'verde', falhou: 'vermelho' } as const

export const ALTURA_DA_FAIXA = 18

// A barra de um agente na linha do tempo, do começo ao fim (ou até agora,
// enquanto roda), na régua de t0 a t1 comum a todos: um trecho por rodada. O
// nome, clicável, fica fora do desenho, à esquerda.
export const barraDoAgente = (faixa: FaixaDoAgente, t0: number, t1: number, largura: number): string => {
  const altura = ALTURA_DA_FAIXA
  const trilho = Math.max(40, largura - 56)
  const xDe = (t: number): number => ((t - t0) / Math.max(1000, t1 - t0)) * trilho
  const fimDoUltimo = Math.max(0, ...faixa.trechos.map(trecho => xDe(trecho.fim)))
  const isDentro = fimDoUltimo + 8 + faixa.tempo.length * 6.4 > largura

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(largura)}" height="${altura}" viewBox="0 0 ${Math.round(largura)} ${altura}" style="color-scheme:light dark">`,
    `<style>${ESTILO_BASE}${estiloDaPaleta()}</style>`,
    `<rect class="trilho" x="0" y="${altura / 2 - 1}" width="${num(trilho)}" height="2" rx="1"/>`,
    ...faixa.trechos.map(trecho => {
      const x = xDe(trecho.inicio)
      const w = Math.max(4, xDe(trecho.fim) - x)
      const dica = trecho.dica === undefined ? '' : `<title>${escapar(trecho.dica)}</title>`

      return `<rect class="c-${COR_DA_FAIXA[trecho.estado]}" x="${num(x)}" y="3" width="${num(w)}" height="12" rx="4">${dica}</rect>`
    }),
    `<text x="${num(isDentro ? fimDoUltimo - 6 : fimDoUltimo + 6)}" y="13" text-anchor="${isDentro ? 'end' : 'start'}">${escapar(faixa.tempo)}</text>`,
    '</svg>',
  ].join('')
}

// A linha da conversa principal na linha do tempo: um trecho na cor do
// cérebro para cada vez que ela pensou (um turno, do pedido à resposta), no
// mesmo trilho e na mesma escala das barras dos agentes; o que ainda roda
// pisca. No fim, quanto tempo ela pensou ao todo.
export const barraDoPrincipal = (
  trechos: readonly { inicio: number; fim: number; isAndando: boolean }[],
  t0: number,
  t1: number,
  largura: number,
  tempo: string,
): string => {
  const altura = ALTURA_DA_FAIXA
  const trilho = Math.max(40, largura - 56)
  const xDe = (t: number): number => Math.max(0, Math.min(trilho, ((t - t0) / Math.max(1000, t1 - t0)) * trilho))
  const fimDoUltimo = Math.max(0, ...trechos.map(trecho => xDe(trecho.fim)))
  const larguraDoTexto = tempo.length * 6.4
  const isDentro = fimDoUltimo + 8 + larguraDoTexto > largura
  // Sem lugar à direita: dentro do último trecho, se ele for largo o bastante;
  // senão, antes dele (por cima de um trecho curto, o texto cobria a barra).
  const ultimo = trechos.reduce<{ inicio: number; fim: number } | undefined>(
    (maior, trecho) => (maior === undefined || trecho.fim > maior.fim ? trecho : maior),
    undefined,
  )
  const inicioDoUltimo = ultimo === undefined ? 0 : xDe(ultimo.inicio)
  const isNaBarra = isDentro && fimDoUltimo - inicioDoUltimo >= larguraDoTexto + 12

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(largura)}" height="${altura}" viewBox="0 0 ${Math.round(largura)} ${altura}" style="color-scheme:light dark">`,
    `<style>${ESTILO_BASE}.c-marca{fill:#d97757}</style>`,
    `<rect class="trilho" x="0" y="${altura / 2 - 1}" width="${num(trilho)}" height="2" rx="1"/>`,
    ...trechos.map(trecho => {
      const x = xDe(trecho.inicio)
      const w = Math.max(4, xDe(trecho.fim) - x)
      const pisca = trecho.isAndando
        ? '<animate attributeName="opacity" values="1;.45;1" dur="1.6s" repeatCount="indefinite"/>'
        : ''

      return `<rect class="c-marca" x="${num(x)}" y="3" width="${num(w)}" height="12" rx="4">${pisca}</rect>`
    }),
    // Dentro da barra, na tinta escura que a paleta dá ao laranja: o cinza das
    // outras legendas sumia nele.
    `<text x="${num(!isDentro ? fimDoUltimo + 6 : isNaBarra ? fimDoUltimo - 6 : Math.max(larguraDoTexto, inicioDoUltimo - 6))}" y="13" text-anchor="${isDentro ? 'end' : 'start'}"${isNaBarra ? ' style="fill:#1f2328;font-weight:600"' : ''}>${escapar(tempo)}</text>`,
    '</svg>',
  ].join('')
}

// A régua embaixo das barras: há quanto tempo, no começo, no meio e no fim.
export const eixoDoTempo = (
  t0: number,
  t1: number,
  agora: number,
  largura: number,
  relativo: (ms: number) => string,
): string => {
  const trilho = Math.max(40, largura - 56)
  const fim = Math.max(t0 + 1000, t1)
  const marcas = [t0, t0 + (fim - t0) / 2, fim].map((t, i) => {
    const x = ((t - t0) / (fim - t0)) * trilho
    const texto = i === 2 && agora - fim < 5000 ? 'agora' : `há ${relativo(agora - t)}`
    const ancora = i === 0 ? 'start' : i === 2 ? 'end' : 'middle'

    return `<text x="${num(x)}" y="11" text-anchor="${ancora}">${escapar(texto)}</text>`
  })

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(largura)}" height="14" viewBox="0 0 ${Math.round(largura)} 14" style="color-scheme:light dark">`,
    `<style>${ESTILO_BASE}</style>`,
    ...marcas,
    '</svg>',
  ].join('')
}

// De onde vem a definição de um tipo de agente: as suas configurações
// (global, ~/.claude/agents), o projeto (.claude/agents), um plugin ou o
// próprio Claude Code. A borda do nó diz qual.
export type EscopoDoAgente = 'global' | 'projeto' | 'plugin' | 'embutido'

// A cor de cada origem, a mesma em todo lugar (a borda do robô, o tipo
// embaixo do nome, a pílula do cartão, os agentes disponíveis): global roxo,
// do projeto laranja, de plugin azul; os embutidos (Explore, Plan...), cinza.
export const COR_DO_ESCOPO: Record<EscopoDoAgente, string> = {
  global: '#a371f7',
  projeto: '#f0883e',
  plugin: '#58a6ff',
  embutido: '#8b949e',
}

export const NOME_DO_ESCOPO: Record<EscopoDoAgente, string> = {
  global: 'global',
  projeto: 'projeto',
  plugin: 'plugin',
  embutido: 'embutido',
}

// Os estilos das origens no SVG: a borda do robô e o texto do tipo.
const ESTILO_DOS_ESCOPOS = (Object.keys(COR_DO_ESCOPO) as EscopoDoAgente[])
  .map(escopo => `.borda.borda-${escopo}{stroke:${COR_DO_ESCOPO[escopo]};stroke-width:2}.tipo.e-${escopo}{fill:${COR_DO_ESCOPO[escopo]}}`)
  .join('')

export type NoDoGrafo = {
  id: string
  // 'principal' ou o id do agente que o criou.
  pai: string
  // O nome que aparece no nó (a tarefa do agente) e, menor embaixo, o tipo.
  rotulo: string
  tipo: string
  estado: 'rodando' | 'ok' | 'falhou'
  escopo: EscopoDoAgente
  // Criado ou terminado há pouco: um ponto corre pelo fio, do pai ao filho
  // (`ida`, a tarefa entregue) ou do filho ao pai (`volta`, o resultado).
  corre?: 'ida' | 'volta'
  // Fora do filtro do grafo: fica no lugar, apagado.
  isApagado?: boolean
  // O agente aberto no detalhe: um anel na cor do Lens em volta do robô,
  // para achá-lo no grafo dos que ele criou (o nome fica como os outros).
  isDestaque?: boolean
  // Uma fase de workflow, não um agente: o nó que agrupa os agentes dela,
  // desenhado como uma pilha de cartões (e sem clique).
  isFase?: boolean
  titulo: string
  dica: string
  // A dica do fio que chega neste nó: quem criou, a tarefa e o resultado.
  dicaDoFio?: readonly LinhaDaDica[]
  // Recados deste agente que não chegaram a ninguém do grafo (um nome que
  // nenhum agente carrega): um ✕ vermelho ao lado do robô.
  perdidos?: number
}

// Os recados (SendMessage) de um agente a outro: `vezes` os entregues,
// `falhas` os que não chegaram.
export type ArestaDoGrafo = {
  de: string
  para: string
  vezes: number
  falhas?: number
  isRecente: boolean
  dica?: readonly LinhaDaDica[]
  // Recados nos dois sentidos entre os mesmos dois: uma curva só, com seta
  // nas duas pontas (duas curvas, uma por cima e outra por baixo, enchiam o
  // grafo quando os dois ficam em lados opostos).
  isIdaEVolta?: boolean
}

// O grafo dos agentes da sessão: a conversa principal no centro, cada agente
// num anel em volta ou, com agentes criando agentes, numa árvore para os dois
// lados (os criados por outro agente mais para fora, do lado do pai).
// Duas linhas, duas conversas. O fio cinza, do pai ao filho, é a criação: leva
// a tarefa na ida e traz o resultado na volta; um selo no meio diz onde está
// (↓ …, ↓ ✓ ou ↓ ✕) e um ponto corre por ele quando a tarefa acaba de sair ou o
// resultado acaba de voltar. Os recados (SendMessage), entre quaisquer dois
// agentes, são curvas roxas tracejadas com quantos foram; os que não chegaram,
// vermelhas com ✕. Passar o mouse num fio ou num recado mostra o que passou
// por ele. A cor do nó é o estado; a borda, o escopo.
export const grafoDosAgentes = (
  nos: readonly NoDoGrafo[],
  arestas: readonly ArestaDoGrafo[],
  // `isApagado`: no grafo de um agente, a conversa principal que só está ali
  // para ligar a árvore (não criou o agente nem trocou recado com ele).
  principal: { isTrabalhando: boolean; dica: string; isApagado?: boolean },
  largura: number,
  // `isAjustavel`: o zoom é o padrão da tela, não um que a pessoa escolheu, e
  // pode baixar (até 100%) quando vários nomes sairiam cortados.
  medidas: { altura?: number; escala?: number; isAjustavel?: boolean } = {},
): {
  source: string
  height: number
  escala: number
  pontos: { id: string; x: number; y: number; isDireita: boolean; cabe: number }[]
} => {
  // A escala (o zoom): o desenho é feito numa largura menor e esticado até a
  // largura pedida, com o texto e os robôs junto. O zoom acima de 100% para
  // onde a largura lógica ficaria abaixo de 560 (os rótulos não caberiam).
  const escala = Math.max(0.6, Math.min(medidas.escala ?? 1, Math.max(1, largura / 560)))
  const logica = largura / escala
  const filhosDe = (id: string) => nos.filter(no => no.pai === id)
  const folhas = (id: string): number => Math.max(1, filhosDe(id).reduce((soma, filho) => soma + folhas(filho.id), 0))
  const profundidade = (id: string, visto = 0): number =>
    Math.max(visto, ...filhosDe(id).map(filho => profundidade(filho.id, visto + 1)))
  const niveis = Math.max(1, profundidade('principal'))
  // Duas formas. Com poucos agentes, todos criados pela conversa principal,
  // o radial: o cérebro no centro e os robôs num anel em volta. Com agentes
  // criando agentes (ou muitos), a árvore: um nível por coluna e uma linha por
  // agente, que cresce para baixo e não cruza rótulos; para os dois lados do
  // cérebro quando cabe, senão com o cérebro à esquerda.
  // O radial vale mesmo com zoom (os agentes dos dois lados do cérebro);
  // num painel largo, com até 12 agentes.
  // Num painel muito estreito, o anel não cabe: a árvore recuada.
  const isArvore = niveis > 1 || nos.length > (logica >= 900 ? 12 : 8) || logica < 420
  const posicao = new Map<string, { x: number; y: number; angulo: number; nivel: number }>()
  // Quantas letras do nome de cada nível cabem antes da coluna seguinte.
  const cabeNoNivel = new Map<number, number>()
  // No radial, quantas letras cabem em cada nó, do lado para onde o nome vai.
  const cabeNoNo = new Map<string, number>()

  // A árvore recuada dá uma linha a cada nó (as fases de workflow também).
  // (a mesma conta do `isRecuada` abaixo: x1 = 148).
  const isRecuadaPrevista = niveis > 1 && (logica - 148 - 210) / (niveis - 1) < 150
  // A árvore dos dois lados: o cérebro no meio, os agentes da conversa
  // principal repartidos entre a direita e a esquerda, e cada um com os que
  // criou mais para fora, do seu lado (o nome vai para fora também). Cada lado
  // ganha a largura que os seus níveis e nomes pedem; sem lugar para uma
  // coluna por nível, fica a árvore de um lado só.
  const raizes = filhosDe('principal')
  const PRIMEIRA = 96
  const MARGEM = 12
  // Letras que o nome de um agente na ponta mostra, no mínimo.
  const NOME_MINIMO = 16
  const nivelDe = new Map<string, number>()
  const marcar = (id: string, nivel: number) => {
    nivelDe.set(id, nivel)
    filhosDe(id).forEach(filho => marcar(filho.id, nivel + 1))
  }
  raizes.forEach(raiz => marcar(raiz.id, 1))
  const descendentes = (id: string): string[] => [id, ...filhosDe(id).flatMap(filho => descendentes(filho.id))]
  const letras = (no: NoDoGrafo) => Math.max([...no.rotulo].length, [...no.tipo].length)
  // As raízes na ordem: a direita fica com as primeiras, até a metade das
  // linhas; a esquerda, com o resto.
  const ladoDe = new Map<string, 1 | -1>()
  raizes.reduce((soma, raiz) => {
    ladoDe.set(raiz.id, soma + folhas(raiz.id) / 2 <= folhas('principal') / 2 ? 1 : -1)

    return soma + folhas(raiz.id)
  }, 0)
  const lados = ([1, -1] as const).map(sinal => {
    const suas = raizes.filter(raiz => ladoDe.get(raiz.id) === sinal)
    const ids = suas.flatMap(raiz => descendentes(raiz.id))
    const doLado = nos.filter(no => ids.includes(no.id))
    const fundo = Math.max(1, ...doLado.map(no => nivelDe.get(no.id) ?? 1))
    // Quem criou alguém tem o nome até a coluna seguinte; quem não criou
    // ninguém está sozinho na sua linha, e o nome vai até a borda.
    const isPai = (no: NoDoGrafo) => filhosDe(no.id).length > 0
    const dosPais = Math.min(40, Math.max(0, ...doLado.filter(isPai).map(letras)))
    const passoPedido = Math.min(280, Math.max(150, 21 + dosPais * 6.2 + 24))
    // A largura que o lado pede: até o fim do nome mais distante do cérebro.
    const ate = (no: NoDoGrafo) =>
      PRIMEIRA + ((nivelDe.get(no.id) ?? 1) - 1) * passoPedido + 21 + Math.min(30, Math.max(NOME_MINIMO, letras(no))) * 6.2

    return {
      sinal,
      suas,
      ids,
      fundo,
      passoPedido,
      pedido: Math.max(PRIMEIRA, ...doLado.filter(no => !isPai(no)).map(ate)) + MARGEM,
      folhas: suas.reduce((conta, raiz) => conta + folhas(raiz.id), 0),
    }
  })
  const pedidoTotal = lados.reduce((conta, lado) => conta + lado.pedido, 0)
  // Sobrando largura, metade para cada lado; faltando, cada lado encolhe na
  // proporção do que pediu.
  const larguraDe = (pedido: number) =>
    pedidoTotal <= logica ? pedido + (logica - pedidoTotal) / 2 : (logica * pedido) / pedidoTotal
  const medidasDosLados = lados.map(lado => {
    const largo = larguraDe(lado.pedido)
    const pontaMinima = 21 + NOME_MINIMO * 6.2 + MARGEM
    const passo = lado.fundo === 1 ? 0 : Math.min(lado.passoPedido, (largo - PRIMEIRA - pontaMinima) / (lado.fundo - 1))

    return { ...lado, largo, passo, isCabe: lado.fundo === 1 ? largo - PRIMEIRA >= pontaMinima : passo >= 150 }
  })
  const isDosDoisLados = isArvore && raizes.length >= 2 && medidasDosLados.every(lado => lado.isCabe)
  // Na árvore recuada os fios correm colados aos robôs: sem selo no meio.
  let isRecuadaUsada = false

  if (isDosDoisLados) {
    const linhas = Math.max(...medidasDosLados.map(lado => lado.folhas))
    const linha =
      medidas.altura === undefined ? 50 : Math.max(50, Math.min(96, (medidas.altura / escala - 70) / linhas))
    const cx = medidasDosLados[1]?.largo ?? logica / 2

    for (const lado of medidasDosLados) {
      // O lado com menos linhas fica no meio da altura do outro.
      let proxima = (linhas - lado.folhas) / 2
      const angulo = lado.sinal === 1 ? 0 : Math.PI
      const xDe = (nivel: number) => cx + lado.sinal * (PRIMEIRA + (nivel - 1) * lado.passo)
      const descer = (id: string, nivel: number): number => {
        const filhos = filhosDe(id)

        if (filhos.length === 0) {
          proxima += 1
          const y = (proxima - 0.5) * linha
          posicao.set(id, { x: xDe(nivel), y, angulo, nivel })

          return y
        }

        const ys = filhos.map(filho => descer(filho.id, nivel + 1))
        const y = ((ys[0] ?? 0) + (ys.at(-1) ?? 0)) / 2
        posicao.set(id, { x: xDe(nivel), y, angulo, nivel })

        return y
      }
      lado.suas.forEach(raiz => descer(raiz.id, 1))

      for (const id of lado.ids) {
        const nivel = nivelDe.get(id) ?? 1
        const sobra =
          filhosDe(id).length > 0
            ? lado.passo - 24 - 21
            : lado.largo - PRIMEIRA - (nivel - 1) * lado.passo - 21 - MARGEM
        cabeNoNo.set(id, Math.max(6, Math.min(40, Math.floor(sobra / 6.2))))
      }
    }

    posicao.set('principal', { x: cx, y: (linhas * linha) / 2, angulo: 0, nivel: 0 })
  } else if (isArvore) {
    const linhas = isRecuadaPrevista ? Math.max(1, nos.length) : folhas('principal')
    // A altura de uma linha: a pedida (o grafo ampliado reparte a do painel)
    // ou a que cabe um robô e as duas linhas do rótulo.
    const linha =
      medidas.altura === undefined ? 50 : Math.max(50, Math.min(96, (medidas.altura / escala - 70) / linhas))
    const x0 = 52
    const x1 = x0 + 96
    const largo = niveis === 1 ? 0 : (logica - x1 - 210) / (niveis - 1)
    // Sem largura para uma coluna por nível (painel estreito, muitos níveis),
    // a árvore recuada: um agente por linha, cada nível um pouco mais para a
    // direita, como uma árvore de pastas; o nome vai até a borda.
    const isRecuada = niveis > 1 && largo < 150
    isRecuadaUsada = isRecuada
    const passo = isRecuada ? 40 : Math.min(280, largo)

    for (let nivel = 1; nivel <= niveis; nivel += 1) {
      const x = x1 + (nivel - 1) * passo
      const ate = nivel === niveis || isRecuada ? logica - 12 : x + passo - 24
      cabeNoNivel.set(nivel, Math.max(6, Math.min(isRecuada ? 64 : 40, Math.floor((ate - x - 21) / 6.2))))
    }

    let proxima = 0

    if (isRecuada) {
      // O cérebro no alto, à esquerda; cada agente na sua linha, abaixo do pai.
      posicao.set('principal', { x: x0, y: 0, angulo: 0, nivel: 0 })
      const descer = (id: string, nivel: number) => {
        for (const filho of filhosDe(id)) {
          proxima += 1
          posicao.set(filho.id, { x: x1 + (nivel - 1) * passo, y: 30 + proxima * linha, angulo: 0, nivel })
          descer(filho.id, nivel + 1)
        }
      }
      descer('principal', 1)
    } else {
      // As folhas ganham as linhas na ordem; cada pai fica no meio dos filhos.
      const descer = (id: string, nivel: number): number => {
        const filhos = filhosDe(id)

        if (filhos.length === 0 && id !== 'principal') {
          proxima += 1
          const y = (proxima - 0.5) * linha
          posicao.set(id, { x: x1 + (nivel - 1) * passo, y, angulo: 0, nivel })

          return y
        }

        const ys = filhos.map(filho => descer(filho.id, nivel + 1))
        const y = ((ys[0] ?? 0) + (ys.at(-1) ?? 0)) / 2
        posicao.set(id, { x: id === 'principal' ? x0 : x1 + (nivel - 1) * passo, y, angulo: 0, nivel })

        return y
      }
      descer('principal', 0)
    }
  } else {
    // A altura do desenho (lógica): a pedida (o grafo ampliado toma a do
    // painel) ou uma que cresce com quantos agentes há.
    const espaco = Math.max(
      340,
      medidas.altura === undefined ? 360 + Math.max(0, nos.length - 5) * 18 : medidas.altura / escala,
    )
    const cx = logica / 2
    const cy = espaco / 2
    // O anel é uma elipse: na largura, o que sobra dos rótulos dos lados; na
    // altura, o que a altura dá (longe o bastante do cérebro e do "Principal").
    // O anel não passa de uma elipse 2,6 vezes mais larga que alta: num
    // painel muito largo, o que sobra fica dos lados, com o desenho no meio.
    const ry = Math.max(118, espaco / 2 - 50)
    const rx = Math.max(130, Math.min(logica / 2 - 190, ry * 2.6))
    posicao.set('principal', { x: cx, y: cy, angulo: 0, nivel: 0 })
    cabeNoNivel.set(1, 26)
    filhosDe('principal').forEach((filho, i, todos) => {
      const angulo = -Math.PI / 2 + (2 * Math.PI * (i + 0.5)) / todos.length
      const x = cx + rx * Math.cos(angulo)
      const isDireita = Math.cos(angulo) >= -0.01
      // O nome vai para fora do anel, até a borda do desenho.
      const sobra = isDireita ? logica - (x + 21) - 8 : x - 21 - 8
      posicao.set(filho.id, { x, y: cy + ry * Math.sin(angulo), angulo, nivel: 1 })
      cabeNoNo.set(filho.id, Math.max(6, Math.min(30, Math.floor(sobra / 6.2))))
    })
  }

  // A árvore fica no meio do painel quando sobra largura: de onde começa o
  // cérebro até o fim do nome mais à direita (a dos dois lados já nasce no meio).
  if (isArvore && !isDosDoisLados) {
    const fimDoNome = (id: string) => {
      const p = posicao.get(id)
      const no = nos.find(um => um.id === id)

      return p === undefined || no === undefined
        ? 0
        : p.x + 27 + Math.min(cabeNoNivel.get(p.nivel) ?? 20, Math.max([...no.rotulo].length, [...no.tipo].length)) * 6.2
    }
    const direita = Math.max(52 + 40, ...nos.map(no => fimDoNome(no.id)))
    const esquerda = 52 - 34
    const desvio = Math.max(0, (logica - (direita - esquerda)) / 2 - esquerda)

    if (desvio > 8) {
      for (const [id, p] of posicao) {
        posicao.set(id, { ...p, x: p.x + desvio })
      }
    }
  }

  // O desenho só tem a altura que os nós ocupam (mais a folga dos rótulos e
  // do "Principal" embaixo do centro).
  const ys = [...posicao.values()].map(p => p.y)
  // Folga para a antena dos robôs no alto e o "Principal" (e o "pensando…")
  // embaixo do cérebro.
  const topo = Math.min(...ys) - 30
  // Embaixo, a folga cobre também a dica da conversa principal (cy + 56, duas linhas).
  const fundo = Math.max(Math.max(...ys) + 24, (posicao.get('principal')?.y ?? 0) + 90)
  for (const [id, p] of posicao) {
    posicao.set(id, { ...p, y: p.y - topo })
  }
  const altura = Math.round(fundo - topo)

  const ponto = (id: string) => posicao.get(id)
  // Fora do filtro, o nó e tudo o que chega nele ficam apagados.
  const isApagado = (id: string) =>
    id === 'principal' ? principal.isApagado === true : nos.find(no => no.id === id)?.isApagado === true
  // Uma dica abaixo do ponto (ou acima, quando não cabe embaixo).
  const ondeDaDica = (y: number, linhas: number) => {
    const h = MEDIDA_DA_DICA.folga * 2 + MEDIDA_DA_DICA.entrelinha * linhas

    return y + 12 + h > altura ? Math.max(1, y - 12 - h) : y + 12
  }
  const dicasDasLinhas: string[] = []
  // Os pontos que correm: depois de todas as linhas, para passar por cima delas.
  const correndo: string[] = []
  const fios = nos.map((no, i) => {
    const a = ponto(no.pai) ?? ponto('principal')
    const b = ponto(no.id)

    if (a === undefined || b === undefined) {
      return ''
    }

    // O fio apaga com qualquer das pontas: no grafo de um agente, o que liga
    // dois nós de fora da conversa dele fica fraco.
    const apagado = no.isApagado === true || isApagado(no.pai ?? 'principal') ? ' apagado' : ''
    // Na árvore, uma curva que sai na horizontal do pai e chega na horizontal
    // ao filho; no radial, uma reta do centro.
    const meio = (a.x + b.x) / 2
    const d = isArvore
      ? `M${num(a.x)} ${num(a.y)} C${num(meio)} ${num(a.y)} ${num(meio)} ${num(b.y)} ${num(b.x)} ${num(b.y)}`
      : `M${num(a.x)} ${num(a.y)} L${num(b.x)} ${num(b.y)}`

    if (no.corre !== undefined) {
      const cor = no.corre === 'ida' ? 'azul' : COR_DO_NO[no.estado]
      const volta = no.corre === 'volta' ? ' keyPoints="1;0" keyTimes="0;1" calcMode="linear"' : ''
      correndo.push(
        `<circle class="c-${cor}${apagado}" r="3.4"><animateMotion dur="1.2s" repeatCount="indefinite" path="${d}"${volta}/></circle>`,
      )
    }

    // O selo: ↓ a tarefa foi entregue; depois, … trabalhando, ✓ o resultado
    // voltou ou ✕ falhou. Na árvore, no fio logo antes do filho, na linha
    // dele (o nome do pai ocupa a linha do pai até perto do filho); num fio
    // reto (pai e filho na mesma linha), embaixo dele. No radial, no meio.
    const lado = Math.sign(b.x - a.x) || 1
    const selo = !isArvore
      ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      : { x: b.x - lado * 36, y: Math.abs(b.y - a.y) < 20 ? b.y + 21 : b.y }
    const fim =
      no.estado === 'rodando'
        ? '<tspan class="c-azul">…</tspan>'
        : no.estado === 'falhou'
          ? '<tspan class="c-vermelho">✕</tspan>'
          : '<tspan class="c-verde">✓</tspan>'
    const isComSelo = no.isFase !== true && !isRecuadaUsada
    const seloSvg = isComSelo
      ? `<rect class="placa" x="${num(selo.x - 14)}" y="${num(selo.y - 7.5)}" width="28" height="15" rx="7.5"/>` +
        `<text class="selo-do-fio" x="${num(selo.x)}" y="${num(selo.y + 3.5)}" text-anchor="middle">↓ ${fim}</text>`
      : ''
    const linhas = no.dicaDoFio ?? []

    if (linhas.length > 0) {
      dicasDasLinhas.push(caixaDaDica(i, linhas, { cx: selo.x, topo: ondeDaDica(selo.y, linhas.length) }, logica, MEDIDA_DA_DICA, 6, 'f'))
    }

    return (
      `<g class="alvo-fio fa${i}${apagado}">` +
      `<path class="fio" d="${d}" fill="none"/>` +
      `<path d="${d}" fill="none" stroke="transparent" stroke-width="12"/>` +
      seloSvg +
      '</g>'
    )
  })
  const recados = arestas.map((aresta, i) => {
    const a = ponto(aresta.de)
    const b = ponto(aresta.para)

    if (a === undefined || b === undefined || aresta.de === aresta.para) {
      return ''
    }

    // Uma curva para o lado, para não cobrir o fio de quem criou quem (nem o
    // selo no meio dele).
    const mx = (a.x + b.x) / 2
    const my = (a.y + b.y) / 2
    const dx = b.x - a.x
    const dy = b.y - a.y
    const tamanho = Math.max(1, Math.hypot(dx, dy))
    const qx = mx - (dy / tamanho) * 40
    const qy = my + (dx / tamanho) * 40
    const d = `M${num(a.x)} ${num(a.y)} Q${num(qx)} ${num(qy)} ${num(b.x)} ${num(b.y)}`
    // Nenhum chegou: a curva inteira em vermelho.
    const isPerdido = aresta.vezes === 0
    const apagado = isApagado(aresta.de) || isApagado(aresta.para) ? ' apagado' : ''
    const falhas = aresta.falhas ?? 0
    const rotulo = [
      aresta.vezes > 0 ? `✉ ${aresta.vezes}` : '',
      falhas > 0 ? `<tspan class="falhou">✕ ${falhas}</tspan>` : '',
    ]
      .filter(parte => parte !== '')
      .join(' ')
    const lx = (mx + qx) / 2
    const ly = (my + qy) / 2

    if (aresta.isRecente) {
      correndo.push(
        `<circle class="c-${isPerdido ? 'vermelho' : 'roxo'}${apagado}" r="3.2"><animateMotion dur="1s" repeatCount="indefinite" path="${d}"/></circle>`,
      )
    }

    if ((aresta.dica ?? []).length > 0) {
      const linhas = aresta.dica ?? []
      dicasDasLinhas.push(caixaDaDica(i, linhas, { cx: lx, topo: ondeDaDica(ly, linhas.length) }, logica, MEDIDA_DA_DICA, 6, 'm'))
    }

    return (
      `<g class="alvo-recado ma${i}${apagado}">` +
      `<path class="recado${isPerdido ? ' perdido' : ''}" d="${d}" fill="none" stroke-dasharray="4 4" marker-end="url(#${isPerdido ? 'seta-perdida' : 'seta'})"${aresta.isIdaEVolta === true ? ` marker-start="url(#${isPerdido ? 'seta-perdida' : 'seta'})"` : ''}/>` +
      `<path d="${d}" fill="none" stroke="transparent" stroke-width="12"/>` +
      `<text class="vezes" x="${num(lx)}" y="${num(ly + 4)}" text-anchor="middle">${rotulo}</text>` +
      '</g>'
    )
  })
  // Quantas letras cabem no nome de um nó sem sair do desenho nem invadir a
  // coluna seguinte (num painel estreito, menos).
  const cabeDe = (id: string) => cabeNoNo.get(id) ?? cabeNoNivel.get(ponto(id)?.nivel ?? 1) ?? 20
  // Dois ou mais nomes cortados com um zoom que pode baixar: o mesmo grafo um
  // passo menor (no detalhe de um agente, dois ramos fundos não cabiam a 150%).
  const cortados = nos.filter(no => ponto(no.id) !== undefined && [...no.rotulo].length > cabeDe(no.id)).length

  if (medidas.isAjustavel === true && cortados >= 2 && escala > 1) {
    return grafoDosAgentes(nos, arestas, principal, largura, { ...medidas, escala: Math.max(1, escala - 0.25) })
  }
  const circulos = nos.map((no, i) => {
    const p = ponto(no.id)

    if (p === undefined) {
      return ''
    }

    const isDireita = Math.cos(p.angulo) >= -0.01
    // O anel do destaque (r = 25) passa do robô: o nome vai mais para fora,
    // senão as primeiras letras ficavam por cima do anel.
    const afasta = no.isDestaque === true ? 31 : 21
    const lx = p.x + (isDireita ? afasta : -afasta)
    const halo =
      no.estado === 'rodando'
        ? `<circle class="c-azul" cx="${num(p.x)}" cy="${num(p.y)}" r="15" opacity=".3"><animate attributeName="r" values="15;24;15" dur="1.6s" repeatCount="indefinite"/><animate attributeName="opacity" values=".3;0;.3" dur="1.6s" repeatCount="indefinite"/></circle>`
        : ''

    const cabe = cabeDe(no.id) - (no.isDestaque === true ? 2 : 0)
    const nome = cortar(no.rotulo, cabe)
    const tipo = cortar(no.tipo, cabe + 4)
    // Uma placa da cor do fundo atrás do rótulo: o fio ou a mensagem que
    // passa por trás não risca as letras.
    const larguraDaPlaca = Math.max([...nome].length * 6.4, [...tipo].length * 5.6) + 6
    const placa = `<rect class="placa" x="${num(isDireita ? lx - 3 : lx - larguraDaPlaca + 3)}" y="${num(p.y - 11)}" width="${num(larguraDaPlaca)}" height="26" rx="4"/>`

    // Recados que não chegaram a ninguém: um ✕ vermelho do lado de onde vem o
    // fio, acima dele (o detalhe fica na dica do nó).
    const perdidos =
      (no.perdidos ?? 0) > 0
        ? `<text class="falhou perdidos" x="${num(p.x + (isDireita ? -17 : 17))}" y="${num(p.y - 12)}" text-anchor="${isDireita ? 'end' : 'start'}">✕${no.perdidos}</text>`
        : ''

    const destaque =
      no.isDestaque === true
        ? `<circle cx="${num(p.x)}" cy="${num(p.y)}" r="25" fill="none" stroke="#d97757" stroke-width="2.5"/>` +
          `<circle cx="${num(p.x)}" cy="${num(p.y)}" r="25" fill="#d97757" opacity=".12"/>`
        : ''

    return (
      `<g class="no na${i}${no.isApagado === true ? ' apagado' : ''}${no.isDestaque === true ? ' destaque' : ''}">${destaque}${no.isFase === true ? '' : halo}` +
      (no.isFase === true ? pilhaDaFase(p.x, p.y, no.estado) : robo(p.x, p.y, no.estado, no.escopo, i)) +
      perdidos +
      placa +
      `<text class="forte" x="${num(lx)}" y="${num(p.y)}" text-anchor="${isDireita ? 'start' : 'end'}">${escapar(nome)}</text>` +
      `<text class="tipo${no.escopo === 'embutido' ? '' : ` e-${no.escopo}`}" x="${num(lx)}" y="${num(p.y + 12)}" text-anchor="${isDireita ? 'start' : 'end'}">${escapar(tipo)}</text>` +
      `<circle cx="${num(p.x)}" cy="${num(p.y)}" r="20" fill="transparent"/></g>`
    )
  })
  const centro = ponto('principal') ?? { x: logica / 2, y: altura / 2 }
  const larguraFinal = Math.round(largura)
  const alturaFinal = Math.round(altura * escala)
  const pensando = principal.isTrabalhando
    ? `<text class="pensando" x="${num(centro.x)}" y="${num(centro.y + 51)}" text-anchor="middle">pensando…<animate attributeName="opacity" values="1;.35;1" dur="1.6s" repeatCount="indefinite"/></text>`
    : ''
  const principalSvg =
    `<g class="no na${nos.length}${principal.isApagado === true ? ' apagado' : ''}">` +
    cerebro(centro.x, centro.y, principal.isTrabalhando) +
    `<text class="forte" x="${num(centro.x)}" y="${num(centro.y + 39)}" text-anchor="middle" font-weight="700">Principal</text>` +
    pensando +
    '</g>'
  // A dica de cada agente é do app (no botão sobre o nó); aqui, só a da conversa principal.
  const dicas = [
    caixaDaDica(
      nos.length,
      [{ antes: 'Conversa principal', texto: ` · ${principal.dica}`, isFraco: true }],
      { cx: centro.x, topo: centro.y + 56 },
      logica,
      MEDIDA_DA_DICA,
      6,
      'n',
    ),
  ]

  return {
    height: alturaFinal,
    escala,
    // Em pixels do desenho final (já na escala): onde vão os botões por cima,
    // e quantas letras do nome aparecem.
    pontos: nos.flatMap(no => {
      const p = ponto(no.id)

      return p === undefined || no.isFase === true
        ? []
        : [{ id: no.id, x: p.x * escala, y: p.y * escala, isDireita: Math.cos(p.angulo) >= -0.01, cabe: cabeDe(no.id) }]
    }),
    source: [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${larguraFinal}" height="${alturaFinal}" viewBox="0 0 ${num(logica)} ${altura}" style="color-scheme:light dark">`,
      '<style>',
      ESTILO_BASE,
      estiloDaPaleta(),
      '.c-marca{fill:#d97757}.branco{fill:#ffffff;font-size:15px}.tipo{font-size:9.5px}',
      ESTILO_DOS_DESENHOS,
      // Um contorno da cor do fundo do painel em volta dos rótulos: um fio ou
      // uma mensagem que passa por trás não atravessa as letras. A placa atrás
      // do rótulo fica bem transparente: num tom um pouco diferente do fundo,
      // aparecia como um retângulo.
      '.no text,.vezes{paint-order:stroke;stroke:#faf9f5;stroke-width:3.5px;stroke-linejoin:round}.placa{fill:#faf9f5;fill-opacity:.35}',
      '.pensando{fill:#d97757;font-size:10.5px;font-weight:600}',
      '.apagado{opacity:.22}',
      '.fio{stroke:rgba(128,128,128,.45);stroke-width:1.4}',
      '.alvo-fio:hover .fio{stroke:rgba(128,128,128,.85);stroke-width:2.4}',
      '.selo-do-fio{font-size:9.5px;font-weight:700;fill:#8b949e}',
      '.recado{stroke:#8957e5;stroke-width:1.4}.vezes{fill:#8957e5;font-size:10px}#seta path{fill:#8957e5}',
      '.alvo-recado:hover .recado{stroke-width:2.4}',
      '.recado.perdido{stroke:#cf222e}.falhou{fill:#cf222e}#seta-perdida path{fill:#cf222e}',
      '.perdidos{font-size:10px;font-weight:700}',
      '.borda{stroke:#1f2328;stroke-width:1.6}',
      '.no:hover .borda{stroke-width:2.6}',
      '@media (prefers-color-scheme: dark){',
      '.recado{stroke:#a371f7}.vezes{fill:#a371f7}#seta path{fill:#a371f7}.borda{stroke:#e6edf3}',
      '.recado.perdido{stroke:#f85149}.falhou{fill:#f85149}#seta-perdida path{fill:#f85149}',
      '.no text,.vezes{stroke:#1f1e1d}.placa{fill:#1f1e1d}',
      '}',
      ESTILO_DOS_ESCOPOS,
      estiloDasDicas(nos.length + 1, 0, 'n'),
      estiloDasDicas(nos.length, 0, 'f'),
      estiloDasDicas(arestas.length, 0, 'm'),
      '</style>',
      '<defs>',
      '<marker id="seta" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L8 4 L0 8 Z"/></marker>',
      '<marker id="seta-perdida" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L8 4 L0 8 Z"/></marker>',
      '</defs>',
      ...fios,
      ...recados,
      ...correndo,
      ...circulos,
      principalSvg,
      ...dicas,
      ...dicasDasLinhas,
      '</svg>',
    ].join(''),
  }
}

const COR_DO_NO = { rodando: 'azul', ok: 'verde', falhou: 'vermelho' } as const

// Uma fase de workflow: três cartões empilhados na cor do estado da fase
// (azul enquanto algum agente dela roda), do tamanho de um robô.
const pilhaDaFase = (x: number, y: number, estado: NoDoGrafo['estado']): string => {
  const cor = COR_DO_NO[estado]
  const cartao = (dx: number, dy: number, opacidade: number) =>
    `<rect class="c-${cor}" x="${num(x - 11 + dx)}" y="${num(y - 8 + dy)}" width="20" height="15" rx="4" opacity="${opacidade}"/>`

  return (
    cartao(4, -5, 0.35) +
    cartao(2, -2.5, 0.6) +
    cartao(0, 0, 1) +
    `<path d="M${num(x - 6)} ${num(y - 2)} H${num(x + 4)} M${num(x - 6)} ${num(y + 2)} H${num(x + 1)}" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round"/>`
  )
}

// Os números grandes da aba Contexto: o texto do painel tem o tamanho que o
// app dá, então os destaques vão em SVG, com as cores dos dois temas.
const ESTILO_DOS_NUMEROS = [
  ':root{color-scheme:light dark;background:transparent}',
  `text{font-family:${FONTE};fill:#57606a}`,
  '.forte{fill:#1f2328}.medio{fill:#6e7781}.sobe{fill:#bc4c00}',
  '.cartao{fill:rgba(128,128,128,.05);stroke:rgba(128,128,128,.3)}',
  '.cartao-total{fill:rgba(13,128,191,.07);stroke:rgba(13,128,191,.45)}',
  '.trilho{fill:rgba(128,128,128,.16)}',
  '.conversa{fill:#d97757}.agentes{fill:#1a7f37}.total{fill:#0d80bf}.sem{fill:#8957e5}.lido{fill:#8fb8de}',
  '@media (prefers-color-scheme: dark){',
  'text{fill:#8b949e}.forte{fill:#e6edf3}.medio{fill:#a5aeb8}.sobe{fill:#f0883e}',
  '.agentes{fill:#3fb950}.total{fill:#58a6ff}.sem{fill:#a371f7}.lido{fill:#3d6a93}',
  '}',
].join('')

// Um limite de uso da conta, já em texto: o nome da janela, o percentual, a
// cor do nível e quando renova.
export type LimiteDoPainel = { nome: string; percentual: number; cor: string; renova?: string }

const ALTURA_DO_LIMITE = 46

// Os limites de uso em barras grossas, a partir de (x0, y0) e com a largura
// dada: o nome e o percentual grandes, o "renova em" à direita, e a barra.
const desenhoDosLimites = (limites: readonly LimiteDoPainel[], x0: number, y0: number, largura: number): string =>
  [
    `<text x="${num(x0)}" y="${num(y0 + 12)}" font-size="11" font-weight="600" letter-spacing=".08em">LIMITE DE USO DA CONTA</text>`,
    ...limites.map((limite, i) => {
      const y = y0 + 26 + i * ALTURA_DO_LIMITE
      const cheio = Math.max(0, Math.min(1, limite.percentual / 100))

      return (
        `<text x="${num(x0)}" y="${num(y + 16)}"><tspan class="forte" font-size="16" font-weight="600">${escapar(limite.nome)}</tspan>` +
        `<tspan dx="10" font-size="18" font-weight="700" style="fill:${limite.cor}">${Math.round(limite.percentual)}%</tspan></text>` +
        (limite.renova === undefined
          ? ''
          : `<text x="${num(x0 + largura)}" y="${num(y + 16)}" text-anchor="end" font-size="12">${escapar(limite.renova)}</text>`) +
        `<rect class="trilho" x="${num(x0)}" y="${num(y + 25)}" width="${num(largura)}" height="9" rx="4.5"/>` +
        `<rect x="${num(x0)}" y="${num(y + 25)}" width="${num(Math.max(cheio > 0 ? 9 : 0, largura * cheio))}" height="9" rx="4.5" style="fill:${limite.cor}"/>`
      )
    }),
  ].join('')

const alturaDosLimites = (quantos: number): number => 26 + quantos * ALTURA_DO_LIMITE

// Os limites de uso sozinhos, num painel do tamanho do cartão (quando não
// cabem ao lado do anel do contexto).
export const painelDosLimites = (
  limites: readonly LimiteDoPainel[],
  largura: number,
): { source: string; width: number; height: number } => {
  const altura = alturaDosLimites(limites.length) + 4
  const w = Math.round(Math.max(240, Math.min(900, largura)))

  return {
    width: w,
    height: altura,
    source: [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${altura}" viewBox="0 0 ${w} ${altura}">`,
      `<style>${ESTILO_DOS_NUMEROS}</style>`,
      desenhoDosLimites(limites, 2, 0, w - 4),
      '</svg>',
    ].join(''),
  }
}

// O contexto da conversa: o anel com o percentual e, ao lado, quanto da
// janela está ocupado e o que o último pedido somou. Num painel largo, os
// limites de uso da conta vão à direita, separados por um fio (`isComLimites`).
// Num painel mais estreito que o desenho, ele encolhe por inteiro.
export const painelDoContexto = (
  medida: {
    percentual: number | undefined
    usado: string
    janela: string
    variacao: string
    isSobe: boolean
    cor: string
  },
  cabe: number,
  limites: readonly LimiteDoPainel[] = [],
): { source: string; width: number; height: number; isComLimites: boolean } => {
  const isComLimites = limites.length > 0 && cabe >= 960
  const largura = isComLimites ? Math.round(Math.min(1300, cabe)) : 620
  const altura = isComLimites ? Math.max(150, alturaDosLimites(limites.length) + 16) : 150
  const escala = Math.max(0.4, Math.min(1, cabe / largura))
  const raio = 58
  const volta = 2 * Math.PI * raio
  const cheio = Math.max(0, Math.min(100, medida.percentual ?? 0)) / 100
  const percentual = medida.percentual === undefined ? '–' : `${Math.round(medida.percentual)}%`

  return {
    width: Math.round(largura * escala),
    height: Math.round(altura * escala),
    source: [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(largura * escala)}" height="${Math.round(altura * escala)}" viewBox="0 0 ${largura} ${altura}">`,
      `<style>${ESTILO_DOS_NUMEROS}</style>`,
      `<circle cx="75" cy="75" r="${raio}" fill="none" stroke="rgba(128,128,128,.18)" stroke-width="13"/>`,
      `<circle cx="75" cy="75" r="${raio}" fill="none" stroke="${medida.cor}" stroke-width="13" stroke-linecap="round" stroke-dasharray="${num(volta * cheio)} ${num(volta)}" transform="rotate(-90 75 75)"/>`,
      `<text x="75" y="81" text-anchor="middle" font-size="30" font-weight="700" style="fill:${medida.cor}">${percentual}</text>`,
      '<text x="75" y="100" text-anchor="middle" font-size="11">do contexto</text>',
      `<text x="172" y="66"><tspan class="forte" font-size="36" font-weight="700">${escapar(medida.usado)}</tspan><tspan dx="10" font-size="17">de ${escapar(medida.janela)} tokens</tspan></text>`,
      `<text x="172" y="102" font-size="16"${medida.isSobe ? ' class="sobe"' : ''}>${escapar(medida.variacao)}</text>`,
      isComLimites
        ? `<line x1="620" y1="12" x2="620" y2="${altura - 12}" stroke="rgba(128,128,128,.3)"/>` +
          desenhoDosLimites(limites, 650, 10, largura - 650 - 8)
        : '',
      '</svg>',
    ].join(''),
    isComLimites,
  }
}

// A linha do ramo da aba Árvore, em destaque: o ⑂ e o nome grandes, as setas
// do que falta empurrar e puxar, o remoto e, à direita, as contas do git.
export const faixaDoRamo = (
  ramo: {
    nome: string
    frente: number
    atras: number
    remoto?: string
    contas: readonly { texto: string; cor?: string }[]
  },
  largura: number,
): { source: string; width: number; height: number } => {
  const w = Math.round(Math.max(320, Math.min(1600, largura)))
  const altura = 34
  const contas = ramo.contas
    .map(conta => `<tspan font-weight="700"${conta.cor === undefined ? ' class="forte"' : ` style="fill:${conta.cor}"`}>${escapar(conta.texto)}</tspan>`)
    .join('')
  const larguraDasContas = ramo.contas.reduce((soma, conta) => soma + [...conta.texto].length, 0) * 9
  const cabe = Math.max(6, Math.floor((w - larguraDasContas - 120) / 11))

  return {
    width: w,
    height: altura,
    source: [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${altura}" viewBox="0 0 ${w} ${altura}">`,
      `<style>${ESTILO_DOS_NUMEROS}</style>`,
      `<text x="0" y="24"><tspan font-size="19" font-weight="700" style="fill:#a371f7">⑂ </tspan>`,
      `<tspan class="forte" font-size="19" font-weight="700">${escapar(cortar(ramo.nome, Math.max(cabe, [...ramo.nome].length)))}</tspan>`,
      ramo.frente > 0 ? `<tspan dx="8" font-size="15" font-weight="700" style="fill:#3fb950">↑${ramo.frente}</tspan>` : '',
      ramo.atras > 0 ? `<tspan dx="6" font-size="15" font-weight="700" style="fill:#d29922">↓${ramo.atras}</tspan>` : '',
      ramo.remoto === undefined ? '' : `<tspan dx="10" font-size="14">${escapar(cortar(ramo.remoto, 40))}</tspan>`,
      '</text>',
      `<text x="${w - 2}" y="24" text-anchor="end" font-size="15">${contas}</text>`,
      '</svg>',
    ].join(''),
  }
}

// Pílulas soltas, como as acima do prompt: cada uma um retângulo de pontas
// redondas na cor dela, com o texto na tinta que contrasta. Em fileiras que
// caibam em `largura`. O selo de uma aba aberta, de um filtro escolhido e as
// etiquetas dos números são isto no app Desktop (o texto com fundo de uma
// célula do painel só sai quadrado).
export type PilulaSolta = { texto: string; fundo: string; tinta: string; isNegrito?: boolean }

const LETRA_DA_PILULA = 6.9

export const pilulasSoltas = (
  itens: readonly PilulaSolta[],
  opcoes: { largura?: number; altura?: number; corpo?: number } = {},
): { source: string; width: number; height: number } => {
  const altura = opcoes.altura ?? 22
  const corpo = opcoes.corpo ?? 12.5
  const letra = LETRA_DA_PILULA * (corpo / 12.5)
  const vao = 6
  const maximo = Math.max(120, opcoes.largura ?? 1200)
  const posicoes: { item: PilulaSolta; x: number; y: number; w: number }[] = []
  let x = 0
  let y = 0
  let maisLarga = 0

  for (const item of itens) {
    const w = Math.ceil([...item.texto].length * letra * (item.isNegrito === true ? 1.06 : 1) + 18)

    if (x > 0 && x + w > maximo) {
      x = 0
      y += altura + vao
    }

    posicoes.push({ item, x, y, w })
    x += w + vao
    maisLarga = Math.max(maisLarga, x - vao)
  }

  const width = Math.max(1, Math.ceil(maisLarga) + 1)
  const height = y + altura + 1

  return {
    width,
    height,
    source: [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
      `<style>text{font-family:${FONTE};font-size:${corpo}px}</style>`,
      ...posicoes.map(
        ({ item, x: px, y: py, w }) =>
          `<rect x="${num(px + 0.5)}" y="${num(py + 0.5)}" width="${num(w - 1)}" height="${altura}" rx="${num(altura / 2)}" fill="${item.fundo}"/>` +
          `<text x="${num(px + w / 2)}" y="${num(py + altura / 2 + corpo * 0.36)}" text-anchor="middle" fill="${item.tinta}"${item.isNegrito === true ? ' font-weight="700"' : ''}>${escapar(item.texto)}</text>`,
      ),
      '</svg>',
    ].join(''),
  }
}

// A barra do título de uma seção: da largura do painel, de pontas redondas,
// na cor da aba; a seta (▾ aberta, ▸ fechada) e o nome em negrito, a contagem
// depois. A seção que dobra põe botões invisíveis por cima da barra inteira.
export const ALTURA_DA_BARRA_DE_TITULO = 26

// O título do cartão de um agente: o glifo do estado, o nome maior e em
// negrito (as pílulas embaixo, coloridas, chamavam mais atenção que ele) e o
// tipo, apagado, ao lado. Uma linha de altura, como o texto.
export const ALTURA_DO_TITULO_DO_AGENTE = 20

export const tituloDoAgente = (
  titulo: { glifo: string; corDoGlifo: string; nome: string; tipo?: string },
  largura: number,
): { source: string; width: number; height: number } => {
  const maximo = Math.max(120, Math.round(largura))
  const h = ALTURA_DO_TITULO_DO_AGENTE
  const tipo = titulo.tipo === undefined || titulo.tipo === '' ? '' : `  ${titulo.tipo}`
  const cabeNome = Math.max(8, Math.floor((maximo - 24 - [...tipo].length * 6.8) / 8.6))
  const nome = cortar(titulo.nome, cabeNome)
  const w = Math.min(maximo, Math.round(24 + [...nome].length * 8.6 + [...tipo].length * 6.8 + 8))

  return {
    width: w,
    height: h,
    source: [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="color-scheme:light dark">`,
      `<style>text{font-family:${FONTE}}.n{fill:#1f2328}.t{fill:#57606a}@media (prefers-color-scheme: dark){.n{fill:#f0f6fc}.t{fill:#8b949e}}</style>`,
      `<text x="0" y="15" font-size="13" style="fill:${titulo.corDoGlifo}">${escapar(titulo.glifo)}</text>`,
      `<text x="18" y="15" font-size="15" font-weight="700"><tspan class="n">${escapar(nome)}</tspan><tspan class="t" font-size="12" font-weight="400">${escapar(tipo)}</tspan></text>`,
      '</svg>',
    ].join(''),
  }
}

// Uma cor misturada com outra: `p` de 0 (a primeira) a 1 (a segunda).
export const misturar = (cor: string, com: string, p: number): string => {
  const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
  const [a, b] = [rgb(cor), rgb(com)]

  return `#${a.map((v, i) => Math.round(v + ((b[i] ?? v) - v) * p).toString(16).padStart(2, '0')).join('')}`
}

export const barraDeTitulo = (
  titulo: { texto: string; contagem?: string; seta?: '▾' | '▸'; fundo: string; tinta: string },
  largura: number,
): { source: string; width: number; height: number } => {
  const w = Math.round(Math.max(200, Math.min(2400, largura)))
  const h = ALTURA_DA_BARRA_DE_TITULO
  const cabe = Math.max(10, Math.floor((w - 30) / 7.6))
  const inteiro = `${titulo.seta === undefined ? '' : `${titulo.seta}  `}${titulo.texto}${titulo.contagem === undefined || titulo.contagem === '' ? '' : ` ${titulo.contagem}`}`
  const cortado = [...inteiro].length > cabe
  const nome = `${titulo.seta === undefined ? '' : `${titulo.seta}  `}${titulo.texto}`
  const resto = cortado ? '' : titulo.contagem === undefined || titulo.contagem === '' ? '' : ` ${titulo.contagem}`

  return {
    width: w,
    height: h,
    // Leve: o fundo na cor da aba bem transparente, um filete sólido à
    // esquerda e o título na cor da aba (a cápsula cheia ficou só na aba
    // aberta; cheias, as barras dominavam a tela). No tema claro, o título
    // numa versão mais escura da cor, que se lê sobre o branco.
    source: [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="color-scheme:light dark">`,
      `<style>text{font-family:${FONTE};font-size:13.5px}.t{fill:${titulo.fundo}}.c{fill:#9da7b3}` +
        `@media (prefers-color-scheme: light){.t{fill:${misturar(titulo.fundo, '#000000', 0.35)}}.c{fill:#57606a}}</style>`,
      `<defs><clipPath id="barra"><rect x="0" y="0" width="${w}" height="${h}" rx="7"/></clipPath></defs>`,
      `<g clip-path="url(#barra)"><rect x="0" y="0" width="${w}" height="${h}" fill="${titulo.fundo}" fill-opacity=".14"/>`,
      `<rect x="0" y="0" width="4" height="${h}" fill="${titulo.fundo}"/></g>`,
      `<text x="14" y="${num(h / 2 + 4.8)}"><tspan class="t" font-weight="700">${escapar(cortado ? cortar(nome, cabe) : nome)}</tspan><tspan class="c">${escapar(resto)}</tspan></text>`,
      '</svg>',
    ].join(''),
  }
}

// Um agente disponível (instalado: global, do projeto ou de plugin) num
// cartão: o robô, o nome, a origem numa pílula na cor dela e a situação. O
// que ainda não foi chamado fica apagado, em cinza, de borda tracejada; o
// chamado, aceso, na cor da origem, com quantas vezes e quando.
export const LARGURA_DO_DISPONIVEL = 280
export const ALTURA_DO_DISPONIVEL = 78

export const cartaoDoDisponivel = (
  agente: {
    nome: string
    escopo: EscopoDoAgente
    situacao: 'nunca' | 'rodando' | 'chamado' | 'falhou'
    detalhe: string
    // O que o agente faz (a descrição dele): uma linha, cortada; inteira na dica.
    descricao?: string
  },
  i: number,
  // A largura do cartão: a da tela divide a fileira (de 280 a 420 px).
  largura = LARGURA_DO_DISPONIVEL,
): string => {
  const w = Math.round(largura)
  const h = ALTURA_DO_DISPONIVEL
  const cor = COR_DO_ESCOPO[agente.escopo]
  const isNunca = agente.situacao === 'nunca'
  const estado = agente.situacao === 'rodando' ? 'rodando' : agente.situacao === 'falhou' ? 'falhou' : 'ok'
  const origem = NOME_DO_ESCOPO[agente.escopo]
  const larguraDaPilula = [...origem].length * 6.4 + 14
  const corDoDetalhe =
    agente.situacao === 'rodando' ? '#58a6ff' : agente.situacao === 'falhou' ? '#f85149' : isNunca ? '#8b949e' : '#3fb950'

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="color-scheme:light dark">`,
    `<style>${ESTILO_BASE}${estiloDaPaleta()}${ESTILO_DOS_DESENHOS}.borda{stroke:#1f2328;stroke-width:1.6}@media (prefers-color-scheme: dark){.borda{stroke:#e6edf3}}${ESTILO_DOS_ESCOPOS}.nunca{filter:grayscale(1);opacity:.4}</style>`,
    `<rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="12" fill="${cor}" fill-opacity="${isNunca ? 0.03 : 0.09}" stroke="${isNunca ? '#8b949e' : cor}" stroke-opacity="${isNunca ? 0.55 : 0.85}" stroke-width="1.4"${isNunca ? ' stroke-dasharray="5 4"' : ''}/>`,
    `<g${isNunca ? ' class="nunca"' : ''}>${robo(30, 38, estado, agente.escopo, i)}</g>`,
    `<text x="58" y="25" class="forte" font-size="13.5" font-weight="700"${isNunca ? ' opacity=".6"' : ''}>${escapar(cortar(agente.nome, Math.floor((w - 58 - larguraDaPilula - 14) / 7.6)))}</text>`,
    `<rect x="${num(w - larguraDaPilula - 10)}" y="12" width="${num(larguraDaPilula)}" height="17" rx="8.5" fill="${cor}"${isNunca ? ' opacity=".55"' : ''}/>`,
    `<text x="${num(w - 10 - larguraDaPilula / 2)}" y="24.5" text-anchor="middle" font-size="10.5" font-weight="700" style="fill:#ffffff">${escapar(origem)}</text>`,
    `<text x="58" y="45" font-size="11.5" style="fill:${corDoDetalhe}">${escapar(cortar(agente.detalhe, Math.floor((w - 66) / 6.3)))}</text>`,
    agente.descricao === undefined || agente.descricao === ''
      ? ''
      : `<text x="58" y="63" font-size="11"${isNunca ? ' opacity=".7"' : ''}>${escapar(cortar(agente.descricao, Math.floor((w - 66) / 5.9)))}</text>`,
    // A descrição inteira na dica do próprio desenho.
    agente.descricao === undefined || agente.descricao === '' ? '' : `<title>${escapar(agente.descricao)}</title>`,
    '</svg>',
  ].join('')
}

// Um indicador da Visão geral: o rótulo pequeno, o valor grande, uma linha
// de detalhe e, quando é um nível (o contexto, um limite), uma barra.
export type Indicador = {
  rotulo: string
  valor: string
  detalhe?: string
  // A cor do valor e da barra, crua (o SVG não conhece o tema).
  cor?: string
  // 0 a 100: desenha a barra embaixo.
  nivel?: number
}

// Os indicadores da Visão geral lado a lado, quantos couberem por linha (os
// que não cabem descem). Devolve também onde ficou cada um, em pixels, para
// os botões invisíveis por cima (cada indicador abre a aba dele).
export const painelDeIndicadores = (
  indicadores: readonly Indicador[],
  largura: number,
): { source: string; width: number; height: number; caixas: { x: number; y: number; w: number; h: number }[] } => {
  const w = Math.round(Math.max(300, Math.min(1600, largura)))
  const vao = 10
  const cabem = Math.max(1, Math.min(indicadores.length, Math.floor((w + vao) / (150 + vao))))
  // Linhas equilibradas: seis que não cabem numa linha vão 3 e 3, não 5 e 1.
  const porLinha = Math.ceil(indicadores.length / Math.ceil(indicadores.length / cabem))
  const lado = (w - vao * (porLinha - 1)) / porLinha
  const alto = 92
  const linhas = Math.ceil(indicadores.length / porLinha)
  const altura = linhas * (alto + vao) - vao + 2
  const caixas = indicadores.map((_, i) => ({
    x: (i % porLinha) * (lado + vao),
    y: Math.floor(i / porLinha) * (alto + vao),
    w: lado,
    h: alto,
  }))
  const corpo = indicadores.map((indicador, i) => {
    const caixa = caixas[i] ?? { x: 0, y: 0, w: lado, h: alto }
    const cabe = Math.max(4, Math.floor((lado - 24) / 13.5))
    const cor = indicador.cor === undefined ? ' class="forte"' : ` style="fill:${indicador.cor}"`
    const barra =
      indicador.nivel === undefined
        ? ''
        : `<rect class="trilho" x="${num(caixa.x + 12)}" y="${num(caixa.y + 76)}" width="${num(lado - 24)}" height="6" rx="3"/>` +
          `<rect x="${num(caixa.x + 12)}" y="${num(caixa.y + 76)}" width="${num(Math.max(6, ((lado - 24) * Math.max(0, Math.min(100, indicador.nivel))) / 100))}" height="6" rx="3" style="fill:${indicador.cor ?? '#8b949e'}"/>`

    return (
      `<rect class="cartao" x="${num(caixa.x + 0.5)}" y="${num(caixa.y + 0.5)}" width="${num(lado - 1)}" height="${alto}" rx="10"/>` +
      `<text x="${num(caixa.x + 12)}" y="${num(caixa.y + 21)}" font-size="10" font-weight="600" letter-spacing=".08em">${escapar(indicador.rotulo.toUpperCase())}</text>` +
      `<text x="${num(caixa.x + 12)}" y="${num(caixa.y + 49)}" font-size="24" font-weight="700"${cor}>${escapar(cortar(indicador.valor, cabe))}</text>` +
      (indicador.detalhe === undefined
        ? ''
        : `<text x="${num(caixa.x + 12)}" y="${num(caixa.y + (indicador.nivel === undefined ? 72 : 67))}" font-size="12">${escapar(cortar(indicador.detalhe, Math.floor((lado - 24) / 6.6)))}</text>`) +
      barra
    )
  })

  return {
    width: w,
    height: altura,
    caixas,
    source: [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${altura}" viewBox="0 0 ${w} ${altura}">`,
      `<style>${ESTILO_DOS_NUMEROS}</style>`,
      ...corpo,
      '</svg>',
    ].join(''),
  }
}

// Uma etiqueta do cabeçalho de um detalhe: o rótulo pequeno em cima e o valor
// grande embaixo, na cor dada.
export type Ladrilho = { rotulo: string; valor: string; cor?: CorDoGrafico }

// O cabeçalho do detalhe de um agente ou de um turno: o nome grande, o estado
// num selo colorido e, embaixo, os números em ladrilhos (o modelo, o tempo, o
// custo...), quantos couberem por linha.
export const cabecalhoDoItem = (
  item: {
    titulo: string
    estado: { texto: string; cor: CorDoGrafico }
    subtitulo?: string
    ladrilhos: readonly Ladrilho[]
  },
  largura: number,
): { source: string; width: number; height: number } => {
  const w = Math.round(Math.max(320, Math.min(1400, largura)))
  const vao = 10
  const larguraMinima = 128
  const cabem = Math.max(1, Math.min(item.ladrilhos.length, Math.floor((w + vao) / (larguraMinima + vao))))
  // Linhas equilibradas: oito que não cabem numa linha vão 4 e 4, não 7 e 1.
  const porLinha = Math.ceil(item.ladrilhos.length / Math.ceil(item.ladrilhos.length / cabem))
  const lado = (w - vao * (porLinha - 1)) / porLinha
  const alturaDoLadrilho = 54
  const topoDosLadrilhos = item.subtitulo === undefined ? 52 : 74
  const linhas = Math.ceil(item.ladrilhos.length / porLinha)
  const altura = topoDosLadrilhos + linhas * (alturaDoLadrilho + vao)
  const selo = escapar(item.estado.texto)
  const larguraDoSelo = [...item.estado.texto].length * 7.6 + 22
  // O título tem 23 px em negrito: uns 13 px por letra. Ele fica com o que o
  // selo deixa (com 10,8 px por letra, o selo caía em cima do fim do nome).
  const LETRA_DO_TITULO = 13
  const letrasDoTitulo = Math.max(8, Math.floor((w - larguraDoSelo - 30) / LETRA_DO_TITULO))
  const titulo = cortar(item.titulo, letrasDoTitulo)
  const xDoSelo = Math.min(w - larguraDoSelo - 2, [...titulo].length * LETRA_DO_TITULO + 18)
  const ladrilhos = item.ladrilhos.map((ladrilho, i) => {
    const x = (i % porLinha) * (lado + vao)
    const y = topoDosLadrilhos + Math.floor(i / porLinha) * (alturaDoLadrilho + vao)
    // O valor tem 17 px em negrito: uns 10 px por letra.
    const valor = cortar(ladrilho.valor, Math.max(4, Math.floor((lado - 24) / 10)))

    return (
      `<rect class="cartao" x="${num(x + 0.5)}" y="${num(y + 0.5)}" width="${num(lado - 1)}" height="${alturaDoLadrilho}" rx="9"/>` +
      `<text x="${num(x + 12)}" y="${num(y + 19)}" font-size="10" font-weight="600" letter-spacing=".08em">${escapar(ladrilho.rotulo.toUpperCase())}</text>` +
      `<text x="${num(x + 12)}" y="${num(y + 42)}" font-size="17" font-weight="700" class="${ladrilho.cor === undefined ? 'forte' : `c-${ladrilho.cor}`}">${escapar(valor)}</text>`
    )
  })

  return {
    width: w,
    height: altura,
    source: [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${altura}" viewBox="0 0 ${w} ${altura}">`,
      `<style>${ESTILO_DOS_NUMEROS}${estiloDaPaleta()}</style>`,
      `<text x="0" y="30" class="forte" font-size="23" font-weight="700">${escapar(titulo)}</text>`,
      `<rect class="c-${item.estado.cor}" x="${num(xDoSelo)}" y="10" width="${num(larguraDoSelo)}" height="26" rx="13" opacity=".18"/>`,
      `<text class="c-${item.estado.cor}" x="${num(xDoSelo + larguraDoSelo / 2)}" y="28" text-anchor="middle" font-size="13" font-weight="700">${selo}</text>`,
      item.subtitulo === undefined ? '' : `<text x="0" y="56" font-size="14">${escapar(cortar(item.subtitulo, Math.floor(w / 7.4)))}</text>`,
      ...ladrilhos,
      '</svg>',
    ].join(''),
  }
}

// Uma linha da grade de custo e tokens (os textos já formatados).
export type LinhaDeGasto = {
  nome: string
  classe: 'total' | 'conversa' | 'agentes'
  usd: string
  reais?: string
  // O que o último pedido somou (ausente antes do primeiro).
  usdTurno?: string
  // Embaixo do custo: a divisão entre a conversa e os agentes (no total) ou uma nota.
  divisao?: { conversa: number; agentes: number }
  nota?: string
  semCache: string
  semCacheTurno?: string
  comCache: string
  comCacheTurno?: string
  // A parte dos tokens com cache que não é releitura (de 0 a 1).
  fracaoSemCache: number
}

// Abaixo desta largura (em pixels), a grade vira texto.
export const LARGURA_MINIMA_DA_GRADE = 700

// O custo e os tokens da sessão: uma linha para o total, a conversa e os
// agentes; uma coluna para o custo e outra para os tokens sem e com o cache
// relido. O ▲ é o que o último pedido da pessoa somou.
export const gradeDeGastos = (
  linhas: readonly LinhaDeGasto[],
  largura: number,
): { source: string; height: number } => {
  const rotulo = 112
  const vao = 10
  const alto = 100
  const topo = 48
  const larguraDoCusto = Math.round((largura - rotulo - vao) * 0.42)
  const x1 = rotulo
  const x2 = x1 + larguraDoCusto + vao
  const larguraDosTokens = largura - x2 - 1
  const fim = topo + linhas.length * (alto + vao) - vao
  const noTurno = (valor: string | undefined, y: number, x: number, tamanho = 13) =>
    valor === undefined
      ? `<text x="${x}" y="${y}" font-size="${tamanho}">sem pedido medido</text>`
      : `<text x="${x}" y="${y}" font-size="${tamanho}" class="sobe">▲ <tspan font-weight="700">${escapar(valor)}</tspan> no último turno</text>`
  const barra = (x: number, y: number, larguraDaBarra: number, partes: readonly [string, number][]) => {
    let andou = 0

    return [
      `<rect class="trilho" x="${num(x)}" y="${y}" width="${num(larguraDaBarra)}" height="7" rx="3.5"/>`,
      `<clipPath id="b${num(x)}-${y}"><rect x="${num(x)}" y="${y}" width="${num(larguraDaBarra)}" height="7" rx="3.5"/></clipPath>`,
      `<g clip-path="url(#b${num(x)}-${y})">`,
      ...partes.map(([classe, fracao]) => {
        const pedaco = Math.max(0, Math.min(1, fracao)) * larguraDaBarra
        const rect = `<rect class="${classe}" x="${num(x + andou)}" y="${y}" width="${num(pedaco)}" height="7"/>`
        andou += pedaco

        return rect
      }),
      '</g>',
    ].join('')
  }

  const cabecalho = [
    `<text x="${x1 + 4}" y="14" font-size="10.5" letter-spacing=".06em">EM DINHEIRO</text>`,
    `<text x="${x1 + 4}" y="32" font-size="13" font-weight="700" class="forte">Custo</text>`,
    `<text x="${x2 + 4}" y="14" font-size="10.5" letter-spacing=".06em">SEM E COM O CACHE RELIDO</text>`,
    `<text x="${x2 + 4}" y="32" font-size="13" font-weight="700" class="forte">Tokens processados</text>`,
  ]
  const corpo = linhas.map((linha, i) => {
    const y = topo + i * (alto + vao)
    const cartao = linha.classe === 'total' ? 'cartao-total' : 'cartao'
    const xDireita = x2 + 16 + Math.max(150, larguraDosTokens * 0.5)
    const custo = [
      `<rect class="${cartao}" x="${x1}" y="${y}" width="${larguraDoCusto}" height="${alto}" rx="10"/>`,
      `<text x="${x1 + 16}" y="${y + 38}"><tspan class="forte" font-size="27" font-weight="700">${escapar(linha.usd)}</tspan>${linha.reais === undefined ? '' : `<tspan dx="8" font-size="14">${escapar(linha.reais)}</tspan>`}</text>`,
      noTurno(linha.usdTurno, y + 62, x1 + 16),
      linha.divisao === undefined
        ? linha.nota === undefined
          ? ''
          : `<text x="${x1 + 16}" y="${y + 86}" font-size="12.5">${escapar(linha.nota)}</text>`
        : barra(x1 + 16, y + 80, larguraDoCusto - 32, [
            ['conversa', linha.divisao.conversa],
            ['agentes', linha.divisao.agentes],
          ]),
    ]
    const tokens = [
      `<rect class="${cartao}" x="${x2}" y="${y}" width="${larguraDosTokens}" height="${alto}" rx="10"/>`,
      `<text x="${x2 + 16}" y="${y + 20}" font-size="10.5" letter-spacing=".05em">SEM CACHE</text>`,
      `<text x="${x2 + 16}" y="${y + 48}" class="forte" font-size="27" font-weight="700">${escapar(linha.semCache)}</text>`,
      noTurno(linha.semCacheTurno, y + 70, x2 + 16),
      `<text x="${num(xDireita)}" y="${y + 20}" font-size="10.5" letter-spacing=".05em">COM CACHE</text>`,
      `<text x="${num(xDireita)}" y="${y + 46}" class="medio" font-size="20" font-weight="600">${escapar(linha.comCache)}</text>`,
      linha.comCacheTurno === undefined
        ? ''
        : `<text x="${num(xDireita)}" y="${y + 68}" font-size="12.5">▲ ${escapar(linha.comCacheTurno)}</text>`,
      barra(x2 + 16, y + 82, larguraDosTokens - 32, [
        ['sem', linha.fracaoSemCache],
        ['lido', 1 - linha.fracaoSemCache],
      ]),
    ]

    return [
      `<circle class="${linha.classe}" cx="8" cy="${y + alto / 2}" r="6"/>`,
      `<text x="22" y="${y + alto / 2 + 5}" class="forte" font-size="15" font-weight="700">${escapar(linha.nome)}</text>`,
      ...custo,
      ...tokens,
    ].join('')
  })
  // A legenda: um quadradinho na cor e o nome, um depois do outro; o que
  // não cabe na linha desce para a seguinte.
  let x = x1 + 4
  let linhaDaLegenda = 0
  const legenda = (
    [
      ['conversa', 'conversa'],
      ['agentes', 'agentes'],
      ['sem', 'sem cache: entrada nova, cache gravado e saída'],
      ['lido', 'cache lido: a releitura, ≈10% do preço da entrada'],
    ] as const
  ).map(([classe, texto]) => {
    const largo = 14 + texto.length * 6.3

    if (x > x1 + 4 && x + largo > largura - 4) {
      x = x1 + 4
      linhaDaLegenda += 1
    }

    const y = fim + 15 + linhaDaLegenda * 20
    const item = `<rect class="${classe}" x="${num(x)}" y="${y}" width="9" height="9" rx="2"/><text x="${num(x + 14)}" y="${y + 9}" font-size="12">${escapar(texto)}</text>`
    x += largo + 16

    return item
  })
  const altura = fim + 34 + linhaDaLegenda * 20

  return {
    height: altura,
    source: [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(largura)}" height="${altura}" viewBox="0 0 ${num(largura)} ${altura}">`,
      `<style>${ESTILO_DOS_NUMEROS}</style>`,
      ...cabecalho,
      ...corpo,
      ...legenda,
      '</svg>',
    ].join(''),
  }
}

// A paleta do Lens, numa fonte só: TONS, as cores cruas (em hex), cada uma
// com a tinta que contrasta com ela. Delas saem:
//
// - os selos e as pílulas (texto sobre o fundo colorido) e os gráficos em
//   SVG, que não conhecem o tema;
// - COR, as cores de texto e de moldura: o mesmo hex do fundo do tom. Antes
//   eram chaves do tema do Claude Code ('claude', 'planMode'...), e cada
//   chave vale uma cor diferente em cada tema: a aba Visão geral, azul no
//   selo, ficava laranja no texto ('claude' é o laranja do Claude), e a aba
//   Agentes, ciano no selo, saía verde ('planMode'). Com o hex, a aba, o
//   caminho, os títulos e as barras têm a mesma cor em qualquer tema.

export type Tom = {
  fundo: string
  tinta: string
}

const ESCURA = '#0d1117'
const CLARA = '#ffffff'

export const TONS = {
  // O azul-celeste do Grêmio.
  marca: { fundo: '#0d80bf', tinta: CLARA },
  rotulo: { fundo: '#30363d', tinta: '#e6edf3' },
  verde: { fundo: '#3fb950', tinta: ESCURA },
  ambar: { fundo: '#d29922', tinta: ESCURA },
  vermelho: { fundo: '#f85149', tinta: CLARA },
  azul: { fundo: '#58a6ff', tinta: ESCURA },
  roxo: { fundo: '#a371f7', tinta: CLARA },
  ciano: { fundo: '#39c5cf', tinta: ESCURA },
  laranja: { fundo: '#f0883e', tinta: ESCURA },
  cinza: { fundo: '#6e7681', tinta: CLARA },
  // A faixa do item escolhido numa lista, como a seleção do VS Code.
  selecao: { fundo: '#264f78', tinta: CLARA },
} as const satisfies Record<string, Tom>

export type NomeDoTom = keyof typeof TONS

// As cores de texto: o hex do tom de mesmo nome.
export const COR = {
  marca: TONS.marca.fundo,
  verde: TONS.verde.fundo,
  ambar: TONS.ambar.fundo,
  vermelho: TONS.vermelho.fundo,
  azul: TONS.azul.fundo,
  roxo: TONS.roxo.fundo,
  ciano: TONS.ciano.fundo,
  laranja: TONS.laranja.fundo,
  cinza: TONS.cinza.fundo,
} as const

export type NomeDaCor = keyof typeof COR

// O tom de cada cor de texto, pelo hex (o selo que corresponde a ela).
const TOM_DA_COR: Readonly<Record<string, NomeDoTom>> = Object.fromEntries(
  (Object.keys(TONS) as NomeDoTom[]).map(nome => [TONS[nome].fundo, nome]),
)

export const tomDaCor = (cor: string): Tom => TONS[TOM_DA_COR[cor] ?? 'rotulo']

// Verde até a metade, âmbar até 80%, vermelho daí para cima.
export const tomDoNivel = (percentual: number): 'verde' | 'ambar' | 'vermelho' =>
  percentual >= 80 ? 'vermelho' : percentual >= 50 ? 'ambar' : 'verde'

// A mesma escala, como cor de texto.
export const corDoNivel = (percentual: number): string => COR[tomDoNivel(percentual)]

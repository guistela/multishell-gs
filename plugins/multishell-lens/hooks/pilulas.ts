// A linha de resumo no app Desktop: pílulas arredondadas desenhadas num SVG,
// cada uma com ícone e divisores. O repositório e o contexto abrem a aba do
// painel que fala deles ao clique (um botão invisível por cima, telas.tsx).
// O terminal não desenha SVG nem canto redondo: lá ficam os selos de texto.
//
// Cada pílula usa um matiz só: o fundo é ele bem transparente, o contorno um
// pouco menos e o texto ele cheio. O matiz tem um tom para cada tema (mais
// fechado no claro, mais aberto no escuro), escolhido pelo próprio SVG com
// prefers-color-scheme. O SVG declara color-scheme light dark: sem isso, o
// quadro isolado em que o Desktop o desenha se acha claro e, no app escuro,
// ganha um fundo branco opaco.

import type { LensAba, LensAgente, LensContexto, LensFaixa, LensGit, LensSessao } from '../types'
import { tokensSomados, variacaoDoUltimoTurno } from './dados'
import { curtoNoMeio, nomeCurtoDoLimite, nomeDoLimite, plural, renovaEm, tokens } from './formato'
import { iconeDoCerebro, iconeDoRobo } from './desenhos'
import { escapar } from './graficos'

// Tons dessaturados, de pastel: o fundo é o matiz bem transparente, e o texto
// um tom mais fechado (claro) ou mais aberto (escuro) do mesmo matiz.
const MATIZES = {
  marca: { claro: '#a85a3d', escuro: '#e6a184' },
  // O azul-celeste do Grêmio, igual nos dois temas: a pílula da marca é cheia.
  gremio: { claro: '#0d80bf', escuro: '#0d80bf' },
  verde: { claro: '#4b7856', escuro: '#93c6a0' },
  ambar: { claro: '#8f6b1c', escuro: '#d9b870' },
  vermelho: { claro: '#a14a3e', escuro: '#e6a094' },
  roxo: { claro: '#5d5299', escuro: '#b5aae6' },
  ciano: { claro: '#3d7a7e', escuro: '#8ec8cb' },
  azul: { claro: '#4a62a3', escuro: '#a2b4ea' },
  cinza: { claro: '#6b717a', escuro: '#a9afb8' },
} as const

// As variáveis de cor de cada matiz, nos dois temas, e o fundo transparente.
const ESTILO = [
  '<style>',
  ':root{color-scheme:light dark;background:transparent}',
  '.fundo{fill-opacity:.16}',
  ...Object.entries(MATIZES).map(([nome, tons]) => `.m-${nome}{--c:${tons.claro}}`),
  '@media (prefers-color-scheme: dark){',
  ...Object.entries(MATIZES).map(([nome, tons]) => `.m-${nome}{--c:${tons.escuro}}`),
  '.fundo{fill-opacity:.14}',
  '}',
  '</style>',
].join('')

type Matiz = keyof typeof MATIZES

type Icone =
  | 'estrela'
  | 'pizza'
  | 'relogio'
  | 'dolar'
  | 'rodando'
  | 'pulso'
  | 'ramo'
  | 'raio'
  | 'medidor'
  | 'calendario'

type Peca =
  // `percentual`: o quanto a pizza está cheia.
  | { tipo: 'icone'; icone: Icone; percentual?: number }
  // `isEncurtavel`: pode perder o meio quando a pílula não cabe na fileira
  // (o repositório e o ramo).
  | { tipo: 'texto'; texto: string; isNegrito?: boolean; isApagado?: boolean; isEncurtavel?: boolean }
  | { tipo: 'divisor' }

type Pilula = {
  // O endereço da pílula (a chave do botão) e a aba do painel que ela abre
  // ao clique; sem aba, ela não é clicável.
  chave: string
  aba?: LensAba
  matiz: Matiz
  // Cheia: o fundo no matiz inteiro e o texto em branco (a marca).
  isCheia?: boolean
  pecas: Peca[]
  // O que ela diz, por extenso: o texto alternativo do desenho.
  dica: string
}

// Monoespaçada e pequena: cada caractere tem a mesma largura (0,6 do corpo),
// e a conta do layout bate com o desenho; o textLength só acerta os décimos.
const FONTE = "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace"
const CORPO = 10.5
const CARACTERE = CORPO * 0.6

const larguraDoTexto = (texto: string): number => [...texto].length * CARACTERE

const ALTURA = 20
const ESPACO = 5
const RECUO = 7
const ENTRE_PECAS = 4
// Os ícones são desenhados numa caixa de 14 px e reduzidos a esta.
const ICONE = 11
// O divisor: a linha no meio de um espaço, com a mesma folga dos dois lados.
const DIVISOR = 7
// Quantos pixels cabem numa coluna do Desktop, para quebrar a linha.
const PIXELS_POR_COLUNA = 7.4

const num = (valor: number): string => String(Math.round(valor * 10) / 10)

const largura = (peca: Peca): number => {
  if (peca.tipo === 'icone') {
    return ICONE
  }

  if (peca.tipo === 'divisor') {
    return DIVISOR
  }

  return larguraDoTexto(peca.texto)
}

const larguraDaPilula = (pilula: Pilula): number =>
  RECUO * 2 + pilula.pecas.reduce((soma, peca) => soma + largura(peca), 0) + ENTRE_PECAS * (pilula.pecas.length - 1)

// Um ícone de 14 px com o centro em (cx, cy), no traço do matiz.
const icone = (qual: Icone, cx: number, cy: number, cor: string, percentual = 0): string => {
  if (qual === 'estrela') {
    const r = 6
    const i = 1.8

    return `<path d="M${num(cx)} ${num(cy - r)} L${num(cx + i)} ${num(cy - i)} L${num(cx + r)} ${num(cy)} L${num(cx + i)} ${num(cy + i)} L${num(cx)} ${num(cy + r)} L${num(cx - i)} ${num(cy + i)} L${num(cx - r)} ${num(cy)} L${num(cx - i)} ${num(cy - i)} Z" style="fill:${cor}"/>`
  }

  if (qual === 'pizza') {
    // Um círculo com a fatia do percentual preenchida.
    const r = 5.5
    const p = Math.max(0, Math.min(99.9, percentual)) / 100
    const angulo = p * 2 * Math.PI
    const x = cx + r * Math.sin(angulo)
    const y = cy - r * Math.cos(angulo)
    const fatia =
      p <= 0
        ? ''
        : `<path d="M${num(cx)} ${num(cy)} L${num(cx)} ${num(cy - r)} A${r} ${r} 0 ${p > 0.5 ? 1 : 0} 1 ${num(x)} ${num(y)} Z" style="fill:${cor}"/>`

    return `<circle cx="${num(cx)}" cy="${num(cy)}" r="${r}" fill="none" style="stroke:${cor}" stroke-width="1.4"/>${fatia}`
  }

  if (qual === 'medidor') {
    // Um medidor: meio círculo e o ponteiro (o limite de poucas horas).
    return (
      `<path d="M${num(cx - 5.5)} ${num(cy + 2.5)} A5.5 5.5 0 1 1 ${num(cx + 5.5)} ${num(cy + 2.5)}" fill="none" style="stroke:${cor}" stroke-width="1.4" stroke-linecap="round"/>` +
      `<path d="M${num(cx)} ${num(cy + 1.5)} L${num(cx + 2.8)} ${num(cy - 2)}" fill="none" style="stroke:${cor}" stroke-width="1.4" stroke-linecap="round"/>` +
      `<circle cx="${num(cx)}" cy="${num(cy + 1.5)}" r="1.2" style="fill:${cor}"/>`
    )
  }

  if (qual === 'calendario') {
    // Um calendário (o limite da semana).
    return (
      `<rect x="${num(cx - 5)}" y="${num(cy - 4)}" width="10" height="9.5" rx="1.8" fill="none" style="stroke:${cor}" stroke-width="1.3"/>` +
      `<path d="M${num(cx - 5)} ${num(cy - 1)} L${num(cx + 5)} ${num(cy - 1)} M${num(cx - 2.5)} ${num(cy - 5.5)} L${num(cx - 2.5)} ${num(cy - 2.8)} M${num(cx + 2.5)} ${num(cy - 5.5)} L${num(cx + 2.5)} ${num(cy - 2.8)}" fill="none" style="stroke:${cor}" stroke-width="1.3" stroke-linecap="round"/>`
    )
  }

  if (qual === 'pulso') {
    // O cérebro da conversa principal, pulsando enquanto ela trabalha.
    return iconeDoCerebro(cx, cy, cor, true)
  }

  if (qual === 'ramo') {
    // Um ramo do git: dois pontos numa linha e um terceiro saindo dela.
    return (
      `<path d="M${num(cx - 3)} ${num(cy - 3.5)} L${num(cx - 3)} ${num(cy + 3.5)} M${num(cx + 3)} ${num(cy - 1.5)} C${num(cx + 3)} ${num(cy + 1.5)} ${num(cx - 3)} ${num(cy + 0.5)} ${num(cx - 3)} ${num(cy + 3)}" fill="none" style="stroke:${cor}" stroke-width="1.3" stroke-linecap="round"/>` +
      `<circle cx="${num(cx - 3)}" cy="${num(cy - 4.5)}" r="1.7" style="fill:${cor}"/>` +
      `<circle cx="${num(cx - 3)}" cy="${num(cy + 4.5)}" r="1.7" style="fill:${cor}"/>` +
      `<circle cx="${num(cx + 3)}" cy="${num(cy - 2.5)}" r="1.7" style="fill:${cor}"/>`
    )
  }

  if (qual === 'raio') {
    // Um raio: o cache deixa a resposta mais rápida e mais barata.
    return `<path d="M${num(cx + 1)} ${num(cy - 6)} L${num(cx - 3.5)} ${num(cy + 1)} L${num(cx - 0.2)} ${num(cy + 1)} L${num(cx - 1)} ${num(cy + 6)} L${num(cx + 3.5)} ${num(cy - 1)} L${num(cx + 0.2)} ${num(cy - 1)} Z" style="fill:${cor}"/>`
  }

  if (qual === 'relogio') {
    return (
      `<circle cx="${num(cx)}" cy="${num(cy)}" r="5.5" fill="none" style="stroke:${cor}" stroke-width="1.4"/>` +
      `<path d="M${num(cx)} ${num(cy - 3)} L${num(cx)} ${num(cy)} L${num(cx + 2.4)} ${num(cy + 1.6)}" fill="none" style="stroke:${cor}" stroke-width="1.4" stroke-linecap="round"/>`
    )
  }

  if (qual === 'dolar') {
    return (
      `<circle cx="${num(cx)}" cy="${num(cy)}" r="6.5" style="fill:${cor}" fill-opacity="0.22"/>` +
      `<text x="${num(cx)}" y="${num(cy + 3.6)}" text-anchor="middle" font-family="${FONTE}" font-size="10" font-weight="700" style="fill:${cor}">$</text>`
    )
  }

  // 'rodando': o robozinho dos agentes, com a luz da antena piscando.
  return iconeDoRobo(cx, cy, cor, true)
}

const desenharPilula = (pilula: Pilula, x0: number, y0: number): string => {
  // Numa pílula cheia, tudo dentro dela é branco sobre o matiz.
  const cor = pilula.isCheia === true ? '#ffffff' : 'var(--c)'
  const w = larguraDaPilula(pilula)
  const meio = y0 + ALTURA / 2
  const partes: string[] = [
    `<g class="m-${pilula.matiz}">`,
    // Sem contorno: só o fundo, cheio na marca e quase transparente nas outras.
    pilula.isCheia === true
      ? `<rect x="${num(x0)}" y="${num(y0)}" width="${num(w)}" height="${ALTURA}" rx="${ALTURA / 2}" style="fill:var(--c)"/>`
      : `<rect class="fundo" x="${num(x0)}" y="${num(y0)}" width="${num(w)}" height="${ALTURA}" rx="${ALTURA / 2}" style="fill:var(--c)"/>`,
  ]
  let x = x0 + RECUO

  for (const peca of pilula.pecas) {
    const w = largura(peca)

    if (peca.tipo === 'icone') {
      // Desenhado em 14 px e reduzido, traço junto.
      const cx = x + ICONE / 2
      const escala = ICONE / 14
      partes.push(
        `<g transform="translate(${num(cx)} ${num(meio)}) scale(${Math.round(escala * 100) / 100}) translate(${num(-cx)} ${num(-meio)})">`,
        icone(peca.icone, cx, meio, cor, peca.percentual),
        '</g>',
      )
    } else if (peca.tipo === 'divisor') {
      partes.push(
        `<line x1="${num(x + DIVISOR / 2)}" y1="${num(y0 + 5)}" x2="${num(x + DIVISOR / 2)}" y2="${num(y0 + ALTURA - 5)}" style="stroke:${cor}" stroke-opacity="0.3"/>`,
      )
    } else {
      partes.push(
        `<text x="${num(x)}" y="${num(meio + CORPO * 0.36)}" font-family="${FONTE}" font-size="${CORPO}"` +
          `${peca.isNegrito === true ? ' font-weight="600"' : ''}` +
          ` style="fill:${cor}"${peca.isApagado === true ? ' fill-opacity="0.7"' : ''}` +
          ` textLength="${num(w)}" lengthAdjust="spacing">${escapar(peca.texto)}</text>`,
      )
    }

    x += w + ENTRE_PECAS
  }

  partes.push('</g>')

  return partes.join('')
}

const tomDoNivel = (percentual: number): Matiz =>
  percentual >= 80 ? 'vermelho' : percentual >= 50 ? 'ambar' : 'verde'

// A quantos pontos da compactação o aviso aparece, e a partir de quantos fica vermelho.
const PERTO_DE_COMPACTAR = 15
const QUASE_COMPACTANDO = 5

// A cor do contexto pela distância até a compactação: é ela que diz se há
// com que se preocupar (75% de uma janela de 1M ainda está longe).
const tomDaCompactacao = (percentual: number, compacta: number): Matiz => {
  const distancia = compacta - percentual

  return distancia <= QUASE_COMPACTANDO ? 'vermelho' : distancia <= PERTO_DE_COMPACTAR ? 'ambar' : 'verde'
}

// "claude-opus-5-5" vira "Opus 5.5"; "claude-haiku-4-5-20251001", "Haiku 4.5".
export const nomeDoModelo = (id: string): string => {
  const limpo = id.replace(/^claude-/, '').replace(/\[.*\]$/, '').replace(/-\d{8}$/, '')
  const [familia, ...versao] = limpo.split('-')

  if (familia === undefined || familia === '' || versao.some(parte => !/^\d+$/.test(parte))) {
    return id
  }

  return `${familia.charAt(0).toUpperCase()}${familia.slice(1)}${versao.length > 0 ? ` ${versao.join('.')}` : ''}`
}

export type Leitura = LensFaixa & {
  // A conversa principal está no meio de um turno.
  isTrabalhando: boolean
}

// As pílulas da sessão, só as que têm leitura. Primeiro o que está vivo (a
// conversa principal trabalhando, agentes em paralelo), depois as medidas.
export const pilulasDoStatus = (leitura: Leitura, agora: number): Pilula[] => {
  const { rodando, contexto, git, sessao } = leitura
  // Sem pílula de marca: a barra é do Multishell, não de um produto à parte.
  const pilulas: Pilula[] = []

  // Primeiro o que está vivo: a conversa principal trabalhando e os agentes
  // em paralelo.
  if (leitura.isTrabalhando) {
    pilulas.push({
      chave: 'trabalhando',
      matiz: 'marca',
      pecas: [{ tipo: 'icone', icone: 'pulso' }],
      dica: 'A conversa principal está trabalhando neste turno',
    })
  }

  if (rodando > 0) {
    pilulas.push({
      chave: 'agentes',
      // Azul, como tudo o que está rodando no painel.
      matiz: 'azul',
      pecas: [{ tipo: 'icone', icone: 'rodando' }, { tipo: 'texto', texto: `${rodando} em paralelo` }],
      dica: `${plural(rodando, 'subagente rodando', 'subagentes rodando')} em paralelo`,
    })
  }

  // Depois do que está vivo: em que repositório e ramo a sessão está.
  if (git.isRepo) {
    const alterados = git.arquivos.length
    // O nome do repositório é o da pasta dele (a raiz do git).
    const repositorio = git.topo?.split('/').filter(parte => parte !== '').at(-1)
    pilulas.push({
      chave: 'git',
      aba: 5,
      matiz: alterados > 0 ? 'ambar' : 'verde',
      pecas: [
        { tipo: 'icone', icone: 'ramo' },
        ...(repositorio === undefined
          ? []
          : [{ tipo: 'texto' as const, texto: repositorio, isEncurtavel: true }, { tipo: 'divisor' as const }]),
        { tipo: 'texto', texto: git.ramo ?? 'HEAD', isEncurtavel: true },
        { tipo: 'divisor' },
        { tipo: 'texto', texto: alterados > 0 ? plural(alterados, 'alterado', 'alterados') : 'limpo' },
      ],
      dica: `Git: ${repositorio === undefined ? '' : `repositório ${repositorio} · `}ramo ${git.ramo ?? 'HEAD'} · ${alterados > 0 ? `${plural(alterados, 'arquivo', 'arquivos')} sem commit` : 'nada sem commit'}`,
    })
  }

  if (contexto.percentual !== undefined) {
    const somado = tokensSomados(contexto)
    const compacta =
      contexto.detalhe?.compactaEm === undefined || contexto.janela <= 0
        ? undefined
        : Math.round((contexto.detalhe.compactaEm / contexto.janela) * 100)
    const pecas: Peca[] = [
      { tipo: 'icone', icone: 'pizza', percentual: contexto.percentual },
      { tipo: 'texto', texto: `${contexto.percentual}%`, isNegrito: true },
    ]

    if (contexto.tokens !== undefined) {
      pecas.push({ tipo: 'divisor' }, { tipo: 'texto', texto: tokens(contexto.tokens) })

      if (somado !== undefined) {
        pecas.push({ tipo: 'texto', texto: somado, isApagado: true })
      }
    }

    // O aviso só aparece perto de compactar, com quanto falta; longe, ele
    // fica só na dica, e a cor da pílula diz que está tudo bem.
    const isPerto = compacta !== undefined && compacta - contexto.percentual <= PERTO_DE_COMPACTAR
    const compactaEm = contexto.detalhe?.compactaEm

    if (isPerto && compactaEm !== undefined) {
      const faltam = contexto.tokens === undefined ? undefined : Math.max(0, compactaEm - contexto.tokens)
      pecas.push(
        { tipo: 'divisor' },
        {
          tipo: 'texto',
          texto: `compacta em ${compacta}%${faltam === undefined ? '' : ` · faltam ${tokens(faltam)}`}`,
          isNegrito: true,
        },
      )
    }

    const delta = variacaoDoUltimoTurno(contexto)
    pilulas.push({
      chave: 'contexto',
      aba: 3,
      matiz: compacta === undefined ? tomDoNivel(contexto.percentual) : tomDaCompactacao(contexto.percentual, compacta),
      pecas,
      dica: [
        `Contexto: ${contexto.percentual}% da janela`,
        contexto.tokens === undefined ? undefined : `${tokens(contexto.tokens)} de ${tokens(contexto.janela)} tokens`,
        delta === undefined || Math.round(delta) === 0 ? undefined : `${somado} no último turno`,
        compacta === undefined ? undefined : `compacta sozinho ao chegar a ${compacta}%`,
      ]
        .filter((parte): parte is string => parte !== undefined)
        .join(' · '),
    })
  }

  // Sem pílula de custo: a barra mostra contexto e limites, não dinheiro.

  for (const limite of contexto.limites) {
    const renova = renovaEm(limite.renova, agora)
    pilulas.push({
      chave: `limite-${limite.tipo}`,
      matiz: limite.percentual >= 80 ? 'vermelho' : 'roxo',
      pecas: [
        { tipo: 'icone', icone: limite.tipo === 'five_hour' ? 'medidor' : 'calendario' },
        { tipo: 'texto', texto: nomeCurtoDoLimite(limite.tipo) },
        { tipo: 'texto', texto: `${limite.percentual}%`, isNegrito: true },
        ...(renova === undefined
          ? []
          : [
              { tipo: 'divisor' as const },
              { tipo: 'icone' as const, icone: 'relogio' as const },
              { tipo: 'texto' as const, texto: renova },
            ]),
      ],
      dica: `Limite de ${nomeDoLimite(limite.tipo)}: ${limite.percentual}% usado${renova === undefined ? '' : ` · renova em ${renova}`}`,
    })
  }

  if (sessao.modelo !== undefined) {
    const modelo = nomeDoModelo(sessao.modelo)
    pilulas.push({
      chave: 'modelo',
      matiz: 'marca',
      pecas: [
        { tipo: 'icone', icone: 'estrela' },
        { tipo: 'texto', texto: modelo },
        ...(sessao.esforco === undefined
          ? []
          : [{ tipo: 'divisor' as const }, { tipo: 'texto' as const, texto: sessao.esforco }]),
      ],
      dica: `Modelo da conversa principal: ${modelo}${sessao.esforco === undefined ? '' : ` · esforço ${sessao.esforco}`}`,
    })
  }

  if (sessao.entrada !== undefined && sessao.cacheLido !== undefined && sessao.entrada > 0) {
    const percentual = Math.round((sessao.cacheLido / sessao.entrada) * 100)
    pilulas.push({
      chave: 'cache',
      matiz: 'cinza',
      pecas: [
        { tipo: 'icone', icone: 'raio' },
        { tipo: 'texto', texto: 'cache' },
        { tipo: 'texto', texto: `${percentual}%`, isNegrito: true },
      ],
      dica: `Cache: ${percentual}% da entrada da última resposta veio do cache (${tokens(sessao.cacheLido)} de ${tokens(sessao.entrada)} tokens); quanto mais, mais barato o turno`,
    })
  }

  return pilulas
}

export type Desenho = {
  source: string
  width: number
  height: number
  alt: string
}

// Onde fica, no desenho, uma pílula que abre uma aba do painel ao clique.
export type AreaClicavel = {
  chave: string
  aba: LensAba
  x: number
  y: number
  width: number
}

// Abaixo disto, um nome encurtado já não diz de que ramo é.
const MINIMO_ENCURTADO = 8

const comprimento = (peca: Peca | undefined): number => (peca?.tipo === 'texto' ? [...peca.texto].length : 0)

// Uma pílula larga demais para a fileira: os nomes encurtáveis (o repositório
// e o ramo) perdem o meio, o mais comprido primeiro, até ela caber. A dica
// continua com os nomes inteiros.
const caber = (pilula: Pilula, maximo: number): Pilula => {
  let pecas = pilula.pecas

  while (larguraDaPilula({ ...pilula, pecas }) > maximo) {
    // A mais comprida das encurtáveis que ainda tem o que perder.
    let indice = -1
    pecas.forEach((peca, i) => {
      if (
        peca.tipo === 'texto' &&
        peca.isEncurtavel === true &&
        comprimento(peca) > MINIMO_ENCURTADO &&
        comprimento(peca) > comprimento(pecas[indice])
      ) {
        indice = i
      }
    })
    const original = pilula.pecas[indice]
    const atual = pecas[indice]

    if (original?.tipo !== 'texto' || atual?.tipo !== 'texto') {
      break
    }

    // Sempre a partir do nome inteiro, um caractere a menos: a reticência fica no meio.
    pecas = pecas.map((peca, i) =>
      i === indice ? { ...peca, texto: curtoNoMeio(original.texto, comprimento(atual) - 1) } : peca,
    )
  }

  return { ...pilula, pecas }
}

// As pílulas num SVG só, em fileiras que caibam em `colunas` do Desktop, e as
// áreas das que abrem uma aba (o repositório e o contexto), para um botão
// invisível ir por cima de cada uma.
export const desenharPilulas = (
  pilulas: readonly Pilula[],
  colunas: number,
): Desenho & { areas: AreaClicavel[] } => {
  const maximo = Math.max(320, colunas * PIXELS_POR_COLUNA)
  const posicoes: { pilula: Pilula; x: number; y: number; w: number }[] = []
  let x = 0
  let y = 0
  let maisLarga = 0

  for (const inteira of pilulas) {
    const pilula = caber(inteira, maximo)
    const w = larguraDaPilula(pilula)

    if (x > 0 && x + w > maximo) {
      x = 0
      y += ALTURA + ESPACO
    }

    posicoes.push({ pilula, x, y, w })
    x += w + ESPACO
    maisLarga = Math.max(maisLarga, x - ESPACO)
  }

  const width = Math.ceil(maisLarga) + 1
  const height = y + ALTURA

  return {
    width,
    height,
    alt: pilulas.map(pilula => pilula.dica).join('. '),
    areas: posicoes.flatMap(({ pilula, x: px, y: py, w }) =>
      pilula.aba === undefined ? [] : [{ chave: pilula.chave, aba: pilula.aba, x: px, y: py, width: w }],
    ),
    source: [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="color-scheme:light dark">`,
      ESTILO,
      ...posicoes.map(({ pilula, x: px, y: py }) => desenharPilula(pilula, px, py)),
      '</svg>',
    ].join(''),
  }
}

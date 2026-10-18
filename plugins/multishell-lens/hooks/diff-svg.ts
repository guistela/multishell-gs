// O corpo de um diff no app Desktop, desenhado em SVG como o diff nativo do
// Claude Code: fonte monoespaçada, duas colunas de número de linha, a linha
// inteira com fundo verde ou vermelho, a palavra que mudou em destaque, cores
// de sintaxe e, entre os trechos, quantas linhas ficaram iguais.
//
// No Desktop o texto do painel é proporcional, e código nessa fonte desalinha;
// o SVG resolve. O terminal segue com o elemento Code.

import { escapar } from './graficos'

const FONTE = "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace"
const CORPO = 12
const CARACTERE = CORPO * 0.6
const LINHA = 18
const NUMERO = 4
// Colunas: número antigo, número novo, sinal e o texto.
const X_ANTIGO = 6
const X_NOVO = X_ANTIGO + (NUMERO + 1) * CARACTERE
const X_SINAL = X_NOVO + (NUMERO + 1) * CARACTERE
const X_TEXTO = X_SINAL + 2 * CARACTERE
const MAX_LINHAS = 400
// Uma linha muito longa (um JSON numa linha só) para aqui, já quebrada.
const MAX_COLUNAS = 2000
// Abaixo do teto do elemento Svg (131072), com folga para o estilo.
const MAX_CARACTERES = 120_000

// Os tons de cada tema, como o diff do GitHub e do Claude Code.
const ESTILO = [
  '<style>',
  ':root{color-scheme:light dark;background:transparent}',
  'text{white-space:pre;font-family:' + FONTE + ';font-size:' + CORPO + 'px}',
  '.t{fill:#1f2328}.n{fill:#8c959f}.s{fill:#8c959f}',
  '.ba{fill:rgba(46,160,67,.13)}.br{fill:rgba(248,81,73,.13)}',
  '.pa{fill:rgba(46,160,67,.35)}.pr{fill:rgba(248,81,73,.35)}',
  '.sa{fill:#1a7f37}.sr{fill:#cf222e}',
  '.bi{fill:rgba(128,128,128,.10)}',
  '.k{fill:#cf222e}.c{fill:#6e7781;font-style:italic}.q{fill:#0a3069}.d{fill:#0550ae}',
  '@media (prefers-color-scheme: dark){',
  '.t{fill:#e6edf3}.n{fill:#6e7681}.s{fill:#7d8590}',
  '.ba{fill:rgba(46,160,67,.16)}.br{fill:rgba(248,81,73,.16)}',
  '.pa{fill:rgba(46,160,67,.42)}.pr{fill:rgba(248,81,73,.42)}',
  '.sa{fill:#3fb950}.sr{fill:#f85149}',
  '.k{fill:#ff7b72}.c{fill:#8b949e}.q{fill:#a5d6ff}.d{fill:#79c0ff}',
  '}',
  '</style>',
].join('')

const PALAVRAS_CHAVE = new Set(
  (
    'const let var function return if else for while do switch case break continue import from export ' +
    'default type interface class extends implements new await async try catch finally throw of in as ' +
    'public private protected readonly static void null undefined true false this super yield typeof ' +
    'def elif None True False lambda with pass raise self fn pub mut impl struct enum match use mod ' +
    'func package go defer chan select map range val fun object when'
  ).split(' '),
)

type Pedaco = { texto: string; classe: string }

// Um realce de sintaxe simples, de uma linha: comentários, textos, números e
// palavras-chave. Erra em casos raros (um texto que atravessa linhas), e só
// muda a cor.
export const pedacos = (linha: string): Pedaco[] => {
  const saida: Pedaco[] = []
  const padrao = /(\/\/.*$|#(?![\w{[]).*$|\/\*.*?(\*\/|$))|("(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?|`(?:[^`\\]|\\.)*`?)|(\b\d[\d_.]*\b)|([A-Za-z_$][\w$]*)/g
  let ultimo = 0

  for (const achado of linha.matchAll(padrao)) {
    const inicio = achado.index ?? 0

    if (inicio > ultimo) {
      saida.push({ texto: linha.slice(ultimo, inicio), classe: 't' })
    }

    const [texto, comentario, , textoLiteral, numero, palavra] = achado
    const classe =
      comentario !== undefined
        ? 'c'
        : textoLiteral !== undefined
          ? 'q'
          : numero !== undefined
            ? 'd'
            : palavra !== undefined && PALAVRAS_CHAVE.has(palavra)
              ? 'k'
              : 't'
    saida.push({ texto, classe })
    ultimo = inicio + texto.length
  }

  if (ultimo < linha.length) {
    saida.push({ texto: linha.slice(ultimo), classe: 't' })
  }

  return saida
}

type Linha =
  | { tipo: '+' | '-' | ' '; texto: string; antiga?: number; nova?: number; destaque?: [number, number] }
  | { tipo: 'iguais'; quantas: number }

// O trecho que difere entre uma linha que saiu e a que entrou no lugar dela:
// tudo menos o começo e o fim em comum.
const diferenca = (a: string, b: string): { emA: [number, number]; emB: [number, number] } | undefined => {
  let inicio = 0

  while (inicio < a.length && inicio < b.length && a[inicio] === b[inicio]) {
    inicio += 1
  }

  let fimA = a.length
  let fimB = b.length

  while (fimA > inicio && fimB > inicio && a[fimA - 1] === b[fimB - 1]) {
    fimA -= 1
    fimB -= 1
  }

  // Igual, ou diferente demais para valer o destaque.
  if (fimA === inicio && fimB === inicio) {
    return undefined
  }

  if ((fimA - inicio) / Math.max(1, a.length) > 0.85 && (fimB - inicio) / Math.max(1, b.length) > 0.85) {
    return undefined
  }

  return { emA: [inicio, fimA], emB: [inicio, fimB] }
}

// O texto unificado (trechos @@) em linhas com número, destaque e os
// intervalos de linhas iguais entre os trechos.
export const lerUnificado = (texto: string): Linha[] => {
  const linhas: Linha[] = []
  let antiga = 1
  let nova = 1
  let fimDoAnterior = 1

  const brutas = texto.split('\n')

  for (let i = 0; i < brutas.length; i += 1) {
    const bruta = brutas[i] ?? ''
    const cabecalho = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(bruta)

    if (cabecalho !== null) {
      antiga = Number(cabecalho[1])
      nova = Number(cabecalho[2])
      const iguais = antiga - fimDoAnterior

      if (iguais > 0) {
        linhas.push({ tipo: 'iguais', quantas: iguais })
      }

      continue
    }

    const sinal = bruta[0]
    const corpo = bruta.slice(1).replaceAll('\t', '  ')

    if (sinal === '-') {
      linhas.push({ tipo: '-', texto: corpo, antiga })
      antiga += 1
    } else if (sinal === '+') {
      linhas.push({ tipo: '+', texto: corpo, nova })
      nova += 1
    } else if (sinal === ' ') {
      linhas.push({ tipo: ' ', texto: corpo, antiga, nova })
      antiga += 1
      nova += 1
    }

    fimDoAnterior = antiga
  }

  // Cada bloco de linhas que saíram seguido do de linhas que entraram: a
  // primeira com a primeira, a segunda com a segunda, para o destaque.
  for (let i = 0; i < linhas.length; i += 1) {
    if (linhas[i]?.tipo !== '-') {
      continue
    }

    let fimDasSaidas = i

    while (linhas[fimDasSaidas]?.tipo === '-') {
      fimDasSaidas += 1
    }

    let fimDasEntradas = fimDasSaidas

    while (linhas[fimDasEntradas]?.tipo === '+') {
      fimDasEntradas += 1
    }

    const pares = Math.min(fimDasSaidas - i, fimDasEntradas - fimDasSaidas)

    for (let k = 0; k < pares; k += 1) {
      const saiu = linhas[i + k]
      const entrou = linhas[fimDasSaidas + k]

      if (saiu?.tipo === '-' && entrou?.tipo === '+') {
        const trecho = diferenca(saiu.texto, entrou.texto)

        if (trecho !== undefined) {
          saiu.destaque = trecho.emA
          entrou.destaque = trecho.emB
        }
      }
    }

    i = fimDasEntradas - 1
  }

  return linhas
}

const num = (valor: number): string => String(Math.round(valor * 10) / 10)

// Até onde, no fim de uma fileira, vale procurar um espaço para quebrar ali:
// nos últimos 30% dela. Mais para trás, a fileira ficaria curta demais.
const FOLGA_DA_QUEBRA = 0.3

// Uma linha longa em fileiras de até `cabe` letras, cada uma com onde começa
// (o destaque da palavra conta a partir dali). Quebra depois do último espaço
// perto do fim, para não partir a palavra ("versã ↪ o"); sem espaço por
// perto, corta onde der. Nada some: as fileiras juntas são a linha inteira.
export const fileiras = (linha: string, cabe: number): { inicio: number; texto: string }[] => {
  const saida: { inicio: number; texto: string }[] = []
  const recuo = Math.floor(cabe * FOLGA_DA_QUEBRA)
  let inicio = 0

  while (linha.length - inicio > cabe) {
    const espaco = linha.lastIndexOf(' ', inicio + cabe - 1)
    const fim = espaco >= inicio + cabe - recuo ? espaco + 1 : inicio + cabe
    saida.push({ inicio, texto: linha.slice(inicio, fim) })
    inicio = fim
  }

  saida.push({ inicio, texto: linha.slice(inicio) })

  return saida
}

export type DiffDesenhado = {
  source: string
  width: number
  height: number
  alt: string
}

// O SVG do diff, `largura` em pixels. Uma linha mais longa que a largura
// quebra em mais de uma (as de continuação sem número, com ↪ no lugar do
// sinal): o painel não rola para o lado, e nada fica escondido.
export const desenharDiff = (texto: string, largura: number): DiffDesenhado => {
  const todas = lerUnificado(texto)
  const width = Math.max(320, Math.round(largura))
  // Quantas letras cabem depois dos números e do sinal.
  const cabe = Math.max(20, Math.floor((width - X_TEXTO - 8) / CARACTERE))
  const desenhos: string[] = []
  let tamanho = 0
  let mais = 0
  let menos = 0
  // A fileira do desenho (uma linha do diff pode ocupar várias).
  let fila = 0
  let lidas = 0

  for (const linha of todas.slice(0, MAX_LINHAS)) {
    let desenho = ''
    let filas = 1

    if (linha.tipo === 'iguais') {
      const y = 2 + fila * LINHA
      const base = y + LINHA / 2 + CORPO * 0.36
      desenho =
        `<rect class="bi" x="0" y="${y}" width="${width}" height="${LINHA}"/>` +
        `<text class="s" x="${num(X_ANTIGO)}" y="${num(base)}">⌄  ${linha.quantas} ${linha.quantas === 1 ? 'linha sem mudança' : 'linhas sem mudança'}</text>`
    } else {
      const pedacosDaLinha = fileiras(linha.texto.slice(0, MAX_COLUNAS), cabe)
      filas = pedacosDaLinha.length
      const partes: string[] = []
      const antiga = linha.antiga === undefined ? '' : String(linha.antiga).padStart(NUMERO)
      const nova = linha.nova === undefined ? '' : String(linha.nova).padStart(NUMERO)

      for (const [k, { inicio, texto: corpo }] of pedacosDaLinha.entries()) {
        const y = 2 + (fila + k) * LINHA
        const base = y + LINHA / 2 + CORPO * 0.36

        if (linha.tipo !== ' ') {
          partes.push(`<rect class="${linha.tipo === '+' ? 'ba' : 'br'}" x="0" y="${y}" width="${width}" height="${LINHA}"/>`)
        }

        // O destaque da palavra que mudou, no pedaço em que ele cai.
        if (linha.destaque !== undefined) {
          const de = Math.max(linha.destaque[0], inicio)
          const fim = Math.min(linha.destaque[1], inicio + corpo.length)

          if (fim > de) {
            partes.push(
              `<rect class="${linha.tipo === '+' ? 'pa' : 'pr'}" x="${num(X_TEXTO + (de - inicio) * CARACTERE)}" y="${y + 1}" width="${num((fim - de) * CARACTERE)}" height="${LINHA - 2}" rx="2"/>`,
            )
          }
        }

        const tspans = pedacos(corpo)
          .map(pedaco => `<tspan class="${pedaco.classe}">${escapar(pedaco.texto)}</tspan>`)
          .join('')

        partes.push(
          k === 0 ? `<text class="n" x="${num(X_ANTIGO)}" y="${num(base)}">${antiga}</text>` : '',
          k === 0 ? `<text class="n" x="${num(X_NOVO)}" y="${num(base)}">${nova}</text>` : '',
          k > 0
            ? `<text class="s" x="${num(X_SINAL)}" y="${num(base)}">↪</text>`
            : linha.tipo === ' '
              ? ''
              : `<text class="${linha.tipo === '+' ? 'sa' : 'sr'}" x="${num(X_SINAL)}" y="${num(base)}">${linha.tipo === '-' ? '−' : '+'}</text>`,
          `<text x="${num(X_TEXTO)}" y="${num(base)}">${tspans}</text>`,
        )
      }

      desenho = partes.join('')
    }

    // O SVG tem um teto de caracteres: o que não couber fica no aviso.
    if (tamanho + desenho.length > MAX_CARACTERES) {
      break
    }

    tamanho += desenho.length
    desenhos.push(desenho)
    fila += filas
    lidas += 1
    mais += linha.tipo === '+' ? 1 : 0
    menos += linha.tipo === '-' ? 1 : 0
  }

  const resto = todas.length - lidas
  const height = fila * LINHA + 4 + (resto > 0 ? LINHA : 0)

  if (resto > 0) {
    desenhos.push(`<text class="s" x="${num(X_ANTIGO)}" y="${height - 6}">… mais ${resto} ${resto === 1 ? 'linha' : 'linhas'}</text>`)
  }

  return {
    width,
    height,
    alt: `Diff: ${mais} ${mais === 1 ? 'linha entrou' : 'linhas entraram'}, ${menos} ${menos === 1 ? 'saiu' : 'saíram'}`,
    source: [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="color-scheme:light dark">`,
      ESTILO,
      ...desenhos,
      '</svg>',
    ].join(''),
  }
}

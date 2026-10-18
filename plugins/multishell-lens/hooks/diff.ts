import type { LensLinha } from '../types'

// Um trecho de diff no formato que Edit e Write devolvem em structuredPatch.
export type Remendo = {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: readonly string[]
}

export type Diff = {
  linhas: LensLinha[]
  mais: number
  menos: number
  cortadas: number
}

type Op = { t: '+' | '-' | ' '; x: string }

const LINHAS_GUARDADAS = 400
const COLUNAS_GUARDADAS = 300
const CONTEXTO = 3
const CELULAS_LCS = 1_500_000

const linhasDe = (texto: string): string[] => {
  if (texto === '') {
    return []
  }

  const linhas = texto.replace(/\r\n/g, '\n').split('\n')

  if (linhas.at(-1) === '') {
    linhas.pop()
  }

  return linhas
}

const guardar = (texto: string): string =>
  texto.replaceAll('\t', '  ').slice(0, COLUNAS_GUARDADAS)

export const deRemendos = (remendos: readonly Remendo[]): Diff => {
  const linhas: LensLinha[] = []
  let mais = 0
  let menos = 0

  for (const remendo of remendos) {
    let antiga = remendo.oldStart
    let nova = remendo.newStart
    linhas.push({
      t: '@',
      x: `@@ -${remendo.oldStart},${remendo.oldLines} +${remendo.newStart},${remendo.newLines} @@`,
    })

    for (const bruta of remendo.lines) {
      const sinal = bruta[0]
      const x = guardar(bruta.slice(1))

      if (sinal === '+') {
        linhas.push({ t: '+', n: nova, x })
        nova += 1
        mais += 1
      } else if (sinal === '-') {
        linhas.push({ t: '-', n: antiga, x })
        antiga += 1
        menos += 1
      } else if (sinal !== '\\') {
        linhas.push({ t: ' ', n: nova, x })
        antiga += 1
        nova += 1
      }
    }
  }

  return {
    linhas: linhas.slice(0, LINHAS_GUARDADAS),
    mais,
    menos,
    cortadas: Math.max(0, linhas.length - LINHAS_GUARDADAS),
  }
}

// Maior subsequência comum do miolo; acima do limite, troca o miolo inteiro.
const miolo = (a: readonly string[], b: readonly string[]): Op[] => {
  if (a.length * b.length > CELULAS_LCS) {
    return [...a.map((x): Op => ({ t: '-', x })), ...b.map((x): Op => ({ t: '+', x }))]
  }

  const largura = b.length + 1
  const tabela = new Uint32Array((a.length + 1) * largura)

  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      tabela[i * largura + j] =
        a[i] === b[j]
          ? (tabela[(i + 1) * largura + j + 1] ?? 0) + 1
          : Math.max(tabela[(i + 1) * largura + j] ?? 0, tabela[i * largura + j + 1] ?? 0)
    }
  }

  const ops: Op[] = []
  let i = 0
  let j = 0

  while (i < a.length && j < b.length) {
    const linhaA = a[i] ?? ''
    const linhaB = b[j] ?? ''

    if (linhaA === linhaB) {
      ops.push({ t: ' ', x: linhaA })
      i += 1
      j += 1
    } else if ((tabela[(i + 1) * largura + j] ?? 0) >= (tabela[i * largura + j + 1] ?? 0)) {
      ops.push({ t: '-', x: linhaA })
      i += 1
    } else {
      ops.push({ t: '+', x: linhaB })
      j += 1
    }
  }

  for (; i < a.length; i += 1) {
    ops.push({ t: '-', x: a[i] ?? '' })
  }

  for (; j < b.length; j += 1) {
    ops.push({ t: '+', x: b[j] ?? '' })
  }

  return ops
}

const remendosDe = (antes: string, depois: string): Remendo[] => {
  const a = linhasDe(antes)
  const b = linhasDe(depois)
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

  const igual = (x: string): Op => ({ t: ' ', x })
  const ops: Op[] = [
    ...a.slice(0, inicio).map(igual),
    ...miolo(a.slice(inicio, fimA), b.slice(inicio, fimB)),
    ...a.slice(fimA).map(igual),
  ]

  // A linha de cada lado em que cada operação começa.
  const emA: number[] = []
  const emB: number[] = []
  let linhaA = 1
  let linhaB = 1

  for (const op of ops) {
    emA.push(linhaA)
    emB.push(linhaB)
    linhaA += op.t === '+' ? 0 : 1
    linhaB += op.t === '-' ? 0 : 1
  }

  const remendos: Remendo[] = []
  let k = 0

  while (k < ops.length) {
    if (ops[k]?.t === ' ') {
      k += 1
      continue
    }

    const de = Math.max(0, k - CONTEXTO)
    let ultima = k

    for (let j = k; j < ops.length && j - ultima <= CONTEXTO * 2; j += 1) {
      if (ops[j]?.t !== ' ') {
        ultima = j
      }
    }

    const ate = Math.min(ops.length, ultima + CONTEXTO + 1)
    const parte = ops.slice(de, ate)
    remendos.push({
      oldStart: emA[de] ?? 1,
      oldLines: parte.filter(op => op.t !== '+').length,
      newStart: emB[de] ?? 1,
      newLines: parte.filter(op => op.t !== '-').length,
      lines: parte.map(op => `${op.t}${op.x}`),
    })
    k = ate
  }

  return remendos
}

export const compararTextos = (antes: string, depois: string): Diff =>
  deRemendos(remendosDe(antes, depois))

const numero = (valor: unknown): number | undefined =>
  typeof valor === 'number' && Number.isFinite(valor) ? valor : undefined

// Lê structuredPatch do resultado de Edit ou Write sem confiar no formato.
export const lerRemendos = (valor: unknown): Remendo[] => {
  if (!Array.isArray(valor)) {
    return []
  }

  const remendos: Remendo[] = []

  for (const item of valor as readonly unknown[]) {
    if (typeof item !== 'object' || item === null) {
      continue
    }

    const campos = item as Readonly<Record<string, unknown>>
    const oldStart = numero(campos.oldStart)
    const newStart = numero(campos.newStart)
    const lines = campos.lines

    if (oldStart === undefined || newStart === undefined || !Array.isArray(lines)) {
      continue
    }

    remendos.push({
      oldStart,
      oldLines: numero(campos.oldLines) ?? 0,
      newStart,
      newLines: numero(campos.newLines) ?? 0,
      lines: (lines as readonly unknown[]).filter(
        (linha): linha is string => typeof linha === 'string',
      ),
    })
  }

  return remendos
}

// O diff de vários arquivos do git (`git diff <antes> <depois>`), arquivo a
// arquivo: o caminho (relativo à raiz do repositório), se nasceu ou foi
// apagado, se é binário e os trechos, no formato do motor.
export type ArquivoDoDiff = {
  caminho: string
  isNovo: boolean
  isApagado: boolean
  isBinario: boolean
  remendos: Remendo[]
}

const semPrefixo = (caminho: string): string => caminho.replace(/^"|"$/g, '').replace(/^[ab]\//, '')

export const arquivosDoDiff = (saida: string): ArquivoDoDiff[] =>
  saida
    .replace(/\r\n/g, '\n')
    .split(/^diff --git /m)
    .slice(1)
    .map(bloco => {
      const linhas = bloco.split('\n')
      const cabeca = linhas[0] ?? ''
      const depois = linhas.find(linha => linha.startsWith('+++ '))?.slice(4)
      const antes = linhas.find(linha => linha.startsWith('--- '))?.slice(4)
      const isNovo = linhas.some(linha => linha.startsWith('new file mode'))
      const isApagado = linhas.some(linha => linha.startsWith('deleted file mode'))
      // Sem +++ (um binário), o caminho vem do cabeçalho: "a/x b/x".
      const doCabecalho = cabeca.slice(cabeca.lastIndexOf(' b/') + 1)
      const caminho = semPrefixo(
        depois !== undefined && depois !== '/dev/null' ? depois : antes !== undefined && antes !== '/dev/null' ? antes : doCabecalho,
      )
      const remendos: Remendo[] = []
      let corpo: string[] | undefined

      for (const linha of linhas) {
        const trecho = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(linha)

        if (trecho !== null) {
          corpo = []
          remendos.push({
            oldStart: Number(trecho[1]),
            oldLines: trecho[2] === undefined ? 1 : Number(trecho[2]),
            newStart: Number(trecho[3]),
            newLines: trecho[4] === undefined ? 1 : Number(trecho[4]),
            lines: corpo,
          })
          continue
        }

        if (corpo !== undefined && /^[ +\-\\]/.test(linha)) {
          corpo.push(linha)
        }
      }

      return { caminho, isNovo, isApagado, isBinario: linhas.some(linha => linha.startsWith('Binary files')), remendos }
    })

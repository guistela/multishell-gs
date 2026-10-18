// A aba Árvore: os arquivos que a sessão tocou e os que o git vê alterados,
// numa árvore de pastas. Funções puras: o register.tsx roda o git e grava;
// a arvore-tela.tsx desenha.

import type {
  LensEntrada,
  LensGit,
  LensGitArquivo,
  LensToque,
  LensUi,
} from '../types'

const MAX_TOQUES = 400
const MAX_GIT = 500
export const MAX_PASTAS = 80

// Quanto tempo um arquivo recém-tocado fica aceso.
export const RECENTE_MS = 8000

// Pastas que nunca entram na árvore inteira, como no claude-code-filetree.
export const IGNORADAS = new Set([
  '.git',
  'node_modules',
  'target',
  '.venv',
  '__pycache__',
  'dist',
  '.next',
  '.DS_Store',
])

export const GIT_INICIAL: LensGit = { isRepo: false, arquivos: [] }

export type Toque = {
  caminho: string
  // 'lendo' ou 'editando': enquanto a ferramenta roda.
  acao: 'lendo' | 'editando'
  quem: string
  agora: number
}

// Uma ferramenta começou a ler ou a escrever um arquivo: ele acende já.
export const comToque = (lista: readonly LensToque[], toque: Toque): LensToque[] => {
  const anterior = lista.find(um => um.caminho === toque.caminho)
  const proximo: LensToque = {
    caminho: toque.caminho,
    lido: anterior?.lido ?? 0,
    editado: anterior?.editado ?? 0,
    mais: anterior?.mais ?? 0,
    menos: anterior?.menos ?? 0,
    quem: [...new Set([...(anterior?.quem ?? []), toque.quem])],
    quando: toque.agora,
    agora: toque.acao,
    ...(anterior?.ultimo === undefined ? {} : { ultimo: anterior.ultimo }),
    ...(anterior?.isNovo === true ? { isNovo: true } : {}),
  }

  return [proximo, ...lista.filter(um => um.caminho !== toque.caminho)].slice(0, MAX_TOQUES)
}

export type FimDoToque = {
  caminho: string
  isOk: boolean
  agora: number
  // Numa escrita que deu certo: as linhas que entraram e saíram.
  mais?: number
  menos?: number
  isNovo?: boolean
}

// A ferramenta terminou: o arquivo apaga a marca de "agora" e guarda o que houve.
export const comFimDoToque = (lista: readonly LensToque[], fim: FimDoToque): LensToque[] =>
  lista.map(toque => {
    if (toque.caminho !== fim.caminho) {
      return toque
    }

    const { agora: acao, ...resto } = toque

    if (!fim.isOk || acao === undefined) {
      return resto
    }

    if (acao === 'lendo') {
      return { ...resto, lido: resto.lido + 1, ultimo: 'lido', quando: fim.agora }
    }

    return {
      ...resto,
      editado: resto.editado + 1,
      mais: resto.mais + (fim.mais ?? 0),
      menos: resto.menos + (fim.menos ?? 0),
      ultimo: fim.isNovo === true && resto.editado === 0 ? 'criado' : 'editado',
      quando: fim.agora,
      ...(fim.isNovo === true && resto.editado === 0 ? { isNovo: true } : {}),
    }
  })

// A linha de cabeçalho do `git status -b`: "## main...origin/main [ahead 1, behind 2]".
const lerRamo = (linha: string): Pick<LensGit, 'ramo' | 'remoto' | 'frente' | 'atras'> => {
  const texto = linha.replace(/^## /, '')
  const ramo = /^(?:No commits yet on )?([^.\s]+)/.exec(texto)?.[1]
  const remoto = /\.\.\.(\S+)/.exec(texto)?.[1]
  const frente = /ahead (\d+)/.exec(texto)?.[1]
  const atras = /behind (\d+)/.exec(texto)?.[1]

  return {
    ...(ramo === undefined ? {} : { ramo }),
    ...(remoto === undefined ? {} : { remoto }),
    ...(frente === undefined ? {} : { frente: Number(frente) }),
    ...(atras === undefined ? {} : { atras: Number(atras) }),
  }
}

// A letra que manda quando o índice e a árvore de trabalho dizem coisas
// diferentes: a mais forte, na ordem do claude-code-filetree.
const FORCA = ['U', 'D', 'M', 'T', 'R', 'C', 'A', '?']

export const letraMaisForte = (letras: readonly string[]): string =>
  FORCA.find(letra => letras.includes(letra)) ?? letras[0] ?? ' '

// `git status --porcelain=v1 -b -z --untracked-files=all` e
// `git diff HEAD --numstat -z`, lidos para a árvore. `topo` é a raiz do repo.
export const lerGit = (topo: string, status: string, numstat: string, agora: number): LensGit => {
  const partes = status.split('\0')
  const arquivos: LensGitArquivo[] = []
  let ramo: ReturnType<typeof lerRamo> = {}

  for (let i = 0; i < partes.length; i += 1) {
    const parte = partes[i] ?? ''

    if (parte === '') {
      continue
    }

    if (parte.startsWith('## ')) {
      ramo = lerRamo(parte)
      continue
    }

    const xy = parte.slice(0, 2)
    const caminho = parte.slice(3)
    const letras = [...xy].filter(letra => letra !== ' ' && letra !== '!')

    // Num renomeado, o caminho antigo vem na parte seguinte.
    if (xy.includes('R') || xy.includes('C')) {
      i += 1
    }

    if (letras.length > 0 && caminho !== '') {
      arquivos.push({ caminho: `${topo}/${caminho}`, letra: letraMaisForte(letras) })
    }
  }

  // As linhas somadas de cada arquivo rastreado (o não rastreado não entra).
  const contas = new Map<string, { mais: number; menos: number }>()
  const linhas = numstat.split('\0')

  for (let i = 0; i < linhas.length; i += 1) {
    const linha = linhas[i] ?? ''
    const [mais, menos, caminho] = linha.split('\t')

    if (mais === undefined || menos === undefined || caminho === undefined) {
      continue
    }

    // Renomeado: "mais\tmenos\t" e depois o antigo e o novo.
    const alvo = caminho === '' ? linhas[i + 2] : caminho

    if (caminho === '') {
      i += 2
    }

    if (alvo !== undefined && alvo !== '') {
      contas.set(`${topo}/${alvo}`, {
        mais: mais === '-' ? 0 : Number(mais),
        menos: menos === '-' ? 0 : Number(menos),
      })
    }
  }

  return {
    isRepo: true,
    topo,
    lidoEm: agora,
    ...ramo,
    arquivos: arquivos.slice(0, MAX_GIT).map(arquivo => {
      const conta = contas.get(arquivo.caminho)

      return conta === undefined ? arquivo : { ...arquivo, ...conta }
    }),
  }
}

// Uma pasta da árvore inteira, listada quando a pessoa a abre.
export const comPasta = (
  pastas: Readonly<Record<string, readonly LensEntrada[]>>,
  caminho: string,
  entradas: readonly LensEntrada[],
): Record<string, LensEntrada[]> => {
  const proximas: Record<string, LensEntrada[]> = {}

  for (const [chave, valor] of Object.entries(pastas)) {
    if (chave !== caminho) {
      proximas[chave] = [...valor]
    }
  }

  proximas[caminho] = [...entradas]
  const sobra = Object.keys(proximas).length - MAX_PASTAS

  return sobra > 0 ? Object.fromEntries(Object.entries(proximas).slice(sobra)) : proximas
}

// Abrir ou fechar uma pasta à mão: vale sobre o que a árvore abriria sozinha.
export const comPastaAlternada = (ui: LensUi, caminho: string, isAberta: boolean): LensUi => {
  const abertas = (ui.pastasAbertas ?? []).filter(uma => uma !== caminho)
  const fechadas = (ui.pastasFechadas ?? []).filter(uma => uma !== caminho)

  return isAberta
    ? { ...ui, pastasAbertas: abertas, pastasFechadas: [...fechadas, caminho].slice(-200) }
    : { ...ui, pastasAbertas: [...abertas, caminho].slice(-200), pastasFechadas: fechadas }
}

export type NoDaArvore = {
  nome: string
  caminho: string
  tipo: 'pasta' | 'arquivo'
  filhos: NoDaArvore[]
  toque?: LensToque
  git?: LensGitArquivo
  // Pastas: o que há embaixo delas.
  soma: Soma
}

export type Soma = {
  letras: Record<string, number>
  mais: number
  menos: number
  // Algum arquivo embaixo está sendo lido ou editado agora, ou acabou de ser.
  agora?: 'lendo' | 'editando'
  isRecente: boolean
  tocados: number
}

const SOMA_VAZIA = (): Soma => ({ letras: {}, mais: 0, menos: 0, isRecente: false, tocados: 0 })

type Mutavel = {
  nome: string
  caminho: string
  tipo: 'pasta' | 'arquivo'
  filhos: Map<string, Mutavel>
  toque?: LensToque
  git?: LensGitArquivo
}

const FORA = '⟨fora do projeto⟩'

// Os pedaços do caminho a partir da raiz; fora dela, sob uma pasta à parte.
const pedacos = (caminho: string, raiz: string): string[] => {
  if (raiz !== '' && caminho.startsWith(`${raiz}/`)) {
    return caminho.slice(raiz.length + 1).split('/').filter(parte => parte !== '')
  }

  return [FORA, ...caminho.split('/').filter(parte => parte !== '')]
}

const ordenar = (a: NoDaArvore, b: NoDaArvore): number => {
  if (a.tipo !== b.tipo) {
    return a.tipo === 'pasta' ? -1 : 1
  }

  // A pasta de fora do projeto vai por último.
  if (a.nome === FORA || b.nome === FORA) {
    return a.nome === FORA ? 1 : -1
  }

  return a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true, sensitivity: 'base' })
}

export type Entradas = {
  raiz: string
  toques: readonly LensToque[]
  git: LensGit
  pastas: Readonly<Record<string, readonly LensEntrada[]>>
  isToda: boolean
  agora: number
}

// A árvore: os tocados e os alterados no git e, na árvore inteira, o que as
// pastas abertas listaram.
export const montarArvore = (entradas: Entradas): NoDaArvore => {
  const { raiz } = entradas
  const topo: Mutavel = { nome: raiz.split('/').at(-1) ?? raiz, caminho: raiz, tipo: 'pasta', filhos: new Map() }

  const no = (caminho: string, tipo: 'pasta' | 'arquivo'): Mutavel => {
    const partes = pedacos(caminho, raiz)
    let atual = topo
    let base = partes[0] === FORA ? '' : raiz

    partes.forEach((parte, i) => {
      const isUltimo = i === partes.length - 1
      base = parte === FORA && i === 0 ? '' : `${base}/${parte}`
      const caminhoDoNo = parte === FORA && i === 0 ? FORA : base
      let filho = atual.filhos.get(parte)

      if (filho === undefined) {
        filho = { nome: parte, caminho: caminhoDoNo, tipo: isUltimo ? tipo : 'pasta', filhos: new Map() }
        atual.filhos.set(parte, filho)
      }

      atual = filho
    })

    return atual
  }

  if (entradas.isToda) {
    for (const [pasta, lista] of Object.entries(entradas.pastas)) {
      // Só as listagens das pastas dentro do projeto entram na árvore inteira.
      if (pasta !== raiz && !pasta.startsWith(`${raiz}/`)) {
        continue
      }

      for (const entrada of lista) {
        if (!IGNORADAS.has(entrada.nome)) {
          no(`${pasta}/${entrada.nome}`, entrada.tipo === 'pasta' ? 'pasta' : 'arquivo')
        }
      }
    }
  }

  for (const arquivo of entradas.git.arquivos) {
    no(arquivo.caminho, 'arquivo').git = arquivo
  }

  for (const toque of entradas.toques) {
    no(toque.caminho, 'arquivo').toque = toque
  }

  const fechar = (mutavel: Mutavel): NoDaArvore => {
    const filhos = [...mutavel.filhos.values()].map(fechar).sort(ordenar)
    const soma = SOMA_VAZIA()

    if (mutavel.tipo === 'arquivo') {
      const letra = mutavel.git?.letra
      const toque = mutavel.toque

      if (letra !== undefined) {
        soma.letras[letra] = 1
      }

      soma.mais = mutavel.git?.mais ?? toque?.mais ?? 0
      soma.menos = mutavel.git?.menos ?? toque?.menos ?? 0
      soma.isRecente = toque !== undefined && entradas.agora - toque.quando < RECENTE_MS
      soma.tocados = toque === undefined ? 0 : 1

      if (toque?.agora !== undefined) {
        soma.agora = toque.agora
      }
    }

    for (const filho of filhos) {
      for (const [letra, n] of Object.entries(filho.soma.letras)) {
        soma.letras[letra] = (soma.letras[letra] ?? 0) + n
      }

      soma.mais += filho.soma.mais
      soma.menos += filho.soma.menos
      soma.isRecente ||= filho.soma.isRecente
      soma.tocados += filho.soma.tocados

      // "Editando" ganha de "lendo" na pasta.
      if (filho.soma.agora === 'editando' || (filho.soma.agora === 'lendo' && soma.agora === undefined)) {
        soma.agora = filho.soma.agora
      }
    }

    return {
      nome: mutavel.nome,
      caminho: mutavel.caminho,
      tipo: mutavel.tipo,
      filhos,
      soma,
      ...(mutavel.toque === undefined ? {} : { toque: mutavel.toque }),
      ...(mutavel.git === undefined ? {} : { git: mutavel.git }),
    }
  }

  return fechar(topo)
}

export type Linha = {
  no: NoDaArvore
  nivel: number
  isAberta: boolean
}

// A pasta abre sozinha quando tem algo tocado ou alterado embaixo; a mão da
// pessoa vale sobre isso. Na árvore inteira, as listadas sem nada ficam fechadas.
export const isAberta = (no: NoDaArvore, ui: LensUi): boolean => {
  if ((ui.pastasFechadas ?? []).includes(no.caminho)) {
    return false
  }

  if ((ui.pastasAbertas ?? []).includes(no.caminho)) {
    return true
  }

  return no.soma.tocados > 0 || Object.keys(no.soma.letras).length > 0 || no.soma.agora !== undefined
}

// As linhas visíveis, de cima para baixo: a raiz não vira linha.
export const linhasDaArvore = (raiz: NoDaArvore, ui: LensUi): Linha[] => {
  const linhas: Linha[] = []

  const descer = (no: NoDaArvore, nivel: number) => {
    for (const filho of no.filhos) {
      const aberta = filho.tipo === 'pasta' && isAberta(filho, ui)
      linhas.push({ no: filho, nivel, isAberta: aberta })

      if (aberta) {
        descer(filho, nivel + 1)
      }
    }
  }

  descer(raiz, 0)

  return linhas
}

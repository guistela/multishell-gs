// A aba Diffs, como no VS Code e no Cursor: os arquivos alterados numa árvore
// à esquerda e o diff do escolhido à direita. Funções puras: a lista de
// arquivos de cada fonte (as edições da sessão, um turno ou o git) e o texto
// unificado que o elemento Code desenha.

import type { LensEdicao, LensGit, LensLinha, LensTurno, LensUi } from '../types'
import { relativo } from './formato'

export type FonteDoDiff = 'sessao' | 'turno' | 'git'

// O que o Code aceita, com folga para o aviso de corte.
const MAX_CARACTERES = 9500

export type ArquivoAlterado = {
  caminho: string
  // A letra do VS Code: M alterado, A novo, D apagado, ? não rastreado, R renomeado.
  letra: string
  mais: number
  menos: number
  // As edições do Claude no arquivo (fonte sessão ou turno), da mais antiga à mais nova.
  edicoes: { edicao: LensEdicao; turno: number }[]
}

export const fonteDe = (ui: LensUi): FonteDoDiff => ui.fonteDoDiff ?? 'sessao'

// Os turnos com edições, e o turno em vista na fonte "turno" (0: o mais recente).
export const turnosComEdicoes = (turnos: readonly LensTurno[]): LensTurno[] =>
  turnos.filter(turno => turno.edicoes.length > 0)

export const turnoEmVista = (ui: LensUi, turnos: readonly LensTurno[]): LensTurno | undefined => {
  const lista = turnosComEdicoes(turnos)

  return (ui.turno === 0 ? undefined : lista.find(turno => turno.n === ui.turno)) ?? lista.at(-1)
}

// Os arquivos da fonte em vista, na ordem em que a árvore os mostra (pastas
// antes dos arquivos, como no VS Code): é a ordem de p e n.
export const arquivosAlterados = (
  ui: LensUi,
  turnos: readonly LensTurno[],
  git: LensGit,
  raiz: string,
): ArquivoAlterado[] =>
  listaEmArvore(arquivosDaFonte(ui, turnos, git), raiz).flatMap(linha =>
    linha.tipo === 'arquivo' ? [linha.arquivo] : [],
  )

const arquivosDaFonte = (
  ui: LensUi,
  turnos: readonly LensTurno[],
  git: LensGit,
): ArquivoAlterado[] => {
  const fonte = fonteDe(ui)

  if (fonte === 'git') {
    return git.arquivos
      .map(arquivo => ({
        caminho: arquivo.caminho,
        letra: arquivo.letra,
        mais: arquivo.mais ?? 0,
        menos: arquivo.menos ?? 0,
        edicoes: [],
      }))
      .sort((a, b) => a.caminho.localeCompare(b.caminho))
  }

  const escolhido = fonte === 'turno' ? turnoEmVista(ui, turnos) : undefined
  const daqui = fonte === 'turno' ? (escolhido === undefined ? [] : [escolhido]) : turnos
  const porCaminho = new Map<string, ArquivoAlterado>()

  for (const turno of daqui) {
    for (const edicao of turno.edicoes) {
      const atual = porCaminho.get(edicao.caminho)

      porCaminho.set(edicao.caminho, {
        caminho: edicao.caminho,
        // Criado pelo Claude na primeira escrita: novo; senão, alterado.
        // A última edição que apagou o arquivo manda: D.
        letra: edicao.isApagado === true ? 'D' : (atual?.letra ?? (edicao.isNovo ? 'A' : 'M')),
        mais: (atual?.mais ?? 0) + edicao.mais,
        menos: (atual?.menos ?? 0) + edicao.menos,
        edicoes: [...(atual?.edicoes ?? []), { edicao, turno: turno.n }],
      })
    }
  }

  return [...porCaminho.values()].sort((a, b) => a.caminho.localeCompare(b.caminho))
}

// O arquivo escolhido, já dentro da lista: o da pessoa, ou o primeiro.
export const arquivoEscolhido = (
  ui: LensUi,
  arquivos: readonly ArquivoAlterado[],
): ArquivoAlterado | undefined =>
  arquivos.find(arquivo => arquivo.caminho === ui.arquivoDoDiff) ?? arquivos[0]

export const arquivoVizinho = (
  ui: LensUi,
  arquivos: readonly ArquivoAlterado[],
  delta: number,
): string | undefined => {
  const atual = arquivoEscolhido(ui, arquivos)
  const indice = atual === undefined ? 0 : arquivos.indexOf(atual)
  const proximo = arquivos[Math.min(arquivos.length - 1, Math.max(0, indice + delta))]

  return proximo?.caminho
}

export type LinhaDaLista =
  | { tipo: 'pasta'; nome: string; nivel: number; caminho: string }
  | { tipo: 'arquivo'; nome: string; nivel: number; arquivo: ArquivoAlterado }

type No = { pastas: Map<string, No>; arquivos: ArquivoAlterado[] }

// A árvore dos arquivos alterados, com as pastas compactas do VS Code: uma
// pasta com uma única subpasta e nenhum arquivo vira "pasta/subpasta".
export const listaEmArvore = (arquivos: readonly ArquivoAlterado[], raiz: string): LinhaDaLista[] => {
  const topo: No = { pastas: new Map(), arquivos: [] }

  for (const arquivo of arquivos) {
    const partes = relativo(arquivo.caminho, raiz).split('/').filter(parte => parte !== '')
    let no = topo

    for (const parte of partes.slice(0, -1)) {
      let filho = no.pastas.get(parte)

      if (filho === undefined) {
        filho = { pastas: new Map(), arquivos: [] }
        no.pastas.set(parte, filho)
      }

      no = filho
    }

    no.arquivos.push(arquivo)
  }

  const linhas: LinhaDaLista[] = []

  const descer = (no: No, nivel: number, caminho: string) => {
    for (const [nome, filho] of [...no.pastas.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      let rotulo = nome
      let atual = filho
      let completo = caminho === '' ? nome : `${caminho}/${nome}`

      while (atual.arquivos.length === 0 && atual.pastas.size === 1) {
        const [[proximo, neto]] = [...atual.pastas.entries()] as [[string, No]]
        rotulo = `${rotulo}/${proximo}`
        completo = `${completo}/${proximo}`
        atual = neto
      }

      linhas.push({ tipo: 'pasta', nome: rotulo, nivel, caminho: completo })
      descer(atual, nivel + 1, completo)
    }

    for (const arquivo of no.arquivos) {
      linhas.push({
        tipo: 'arquivo',
        nome: arquivo.caminho.split('/').at(-1) ?? arquivo.caminho,
        nivel,
        arquivo,
      })
    }
  }

  descer(topo, 0, '')

  return linhas
}

// Refaz o cabeçalho de cada trecho com as linhas que ele tem de fato (depois
// de um corte, as contas do original não batem mais).
const refazerCabecalhos = (linhas: readonly string[]): string[] => {
  const saida: string[] = []
  let i = 0

  while (i < linhas.length) {
    const cabecalho = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/.exec(linhas[i] ?? '')

    if (cabecalho === null) {
      i += 1
      continue
    }

    const corpo: string[] = []
    i += 1

    while (i < linhas.length && !(linhas[i] ?? '').startsWith('@@')) {
      corpo.push(linhas[i] ?? '')
      i += 1
    }

    const antigas = corpo.filter(linha => linha.startsWith(' ') || linha.startsWith('-')).length
    const novas = corpo.filter(linha => linha.startsWith(' ') || linha.startsWith('+')).length

    if (corpo.length > 0) {
      saida.push(`@@ -${cabecalho[1]},${antigas} +${cabecalho[2]},${novas} @@${cabecalho[3] ?? ''}`, ...corpo)
    }
  }

  return saida
}

export type TextoDoDiff = {
  texto: string
  // Linhas que ficaram de fora por causa do tamanho.
  cortadas: number
}

// Linhas de diff (com os cabeçalhos @@) até caberem no Code, recontadas.
const caber = (linhas: readonly string[]): TextoDoDiff => {
  const guardadas: string[] = []
  let tamanho = 0

  for (const linha of linhas) {
    if (tamanho + linha.length + 1 > MAX_CARACTERES) {
      break
    }

    guardadas.push(linha)
    tamanho += linha.length + 1
  }

  return { texto: refazerCabecalhos(guardadas).join('\n'), cortadas: linhas.length - guardadas.length }
}

// O diff de uma edição da sessão, no formato unificado.
export const diffDaEdicao = (linhas: readonly LensLinha[]): TextoDoDiff => {
  const unificado: string[] = []

  for (const linha of linhas) {
    if (linha.t === '@') {
      unificado.push(linha.x)
    } else {
      // O Code só aceita tab e quebra de linha como controle.
      unificado.push(`${linha.t}${linha.x.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')}`)
    }
  }

  // Uma edição sem cabeçalho (não deveria acontecer) ganha um.
  if (unificado.length > 0 && !(unificado[0] ?? '').startsWith('@@')) {
    unificado.unshift('@@ -1 +1 @@')
  }

  return caber(unificado)
}

// A saída de `git diff`: fora o prelúdio (diff --git, index, ---, +++), só os trechos.
export const diffDoGit = (saida: string): TextoDoDiff | undefined => {
  const linhas = saida.replace(/\r\n/g, '\n').split('\n')
  const inicio = linhas.findIndex(linha => linha.startsWith('@@'))

  if (inicio === -1) {
    return undefined
  }

  const trechos = linhas
    .slice(inicio)
    .filter(linha => /^[ +\-@]/.test(linha))
    .map(linha => linha.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ''))

  return caber(trechos)
}

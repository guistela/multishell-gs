// csr-lens: um painel ao lado da conversa, com sete abas, e uma linha de
// resumo acima do prompt. O mod só observa: todo hook de evento chama next(e) com o mesmo `e`
// e devolve o que next devolveu, menos o tool.call de um agente que a pessoa mandou parar
// (veja pararAgente). O que ele registra fica em $.state.

import { atom, read, update } from 'claude-code'
import type {
  EngineInterface,
  Frozen,
  Timer,
  Register,
  SessionContextUsage,
  SessionCost,
  SessionRateLimit,
  ToolCallInput,
  ToolCallResult,
  TurnUsage,
} from 'claude-code'

import type {
  LensAba,
  LensAgente,
  LensUi,
  LensCategoria,
  LensComando,
  LensDetalhe,
  LensEdicao,
  LensEntrada,
  LensFichaDoAgente,
  LensFichaDoComando,
  LensFichaDoTurno,
  LensFoco,
  LensPasso,
  LensRodada,
  LensTokens,
  LensTotais,
} from '../types'
import {
  CONTEXTO_INICIAL,
  FICHAS_DE_COMANDO,
  FICHAS_DE_TURNO,
  GASTOS_INICIAIS,
  UI_INICIAL,
  comAgente,
  comAgentesDoWorkflow,
  comMensagem,
  gruposDeTurnos,
  resumoDaSessao,
  comAtividade,
  comChamadaNaRodada,
  comComando,
  comEdicao,
  comFimDaRodada,
  comFimDoAgente,
  comRetomada,
  comRodadaAberta,
  comRodadaFechada,
  somaDeTokens,
  inicioDaRodada,
  comFimDoComando,
  comFimDoPasso,
  comFalhaNoTurno,
  comCustoVisto,
  comGasto,
  MAX_GASTOS,
  comGastos,
  comInicioDoTurno,
  comListaDaSessao,
  comMedida,
  comMedidaNaRodada,
  comPartes,
  comPasso,
  comInicioNosTotais,
  semCache,
  comRodada,
  naFicha,
  retornoDe,
  resumoDaChamada,
  segmentosDoStatus,
} from './dados'
import type { AchadoDoWorkflow } from './dados'
import {
  GIT_INICIAL,
  IGNORADAS,
  comFimDoToque,
  comPasta,
  comPastaAlternada,
  comToque,
  isAberta,
  linhasDaArvore,
  lerGit,
  montarArvore,
} from './arvore'
import type { NoDaArvore } from './arvore'
import { COR } from './cores'
import { arquivosDoDiff, compararTextos, deRemendos, lerRemendos } from './diff'
import { arquivoEscolhido, arquivoVizinho, arquivosAlterados, diffDoGit, fonteDe } from './diffs-lista'
import { INVENTARIO_INICIAL, lerInventario } from './inventario'
import type { Fontes } from './inventario'
import { ITENS_POR_VEZ, SECOES } from './inventario-tela'
import { arquivosDoComando } from './caminhos-do-bash'
import type { ArquivoDoComando } from './caminhos-do-bash'
import { focoDaVolta } from './caminho'
import { cabeca, cauda, curto, limpo, semMarcas, umaLinha } from './formato'
import { desenharPilulas, pilulasDoStatus } from './pilulas'
import { indiceDosRetratos, lerRetrato, retratoAcertado, retratoQueCabe, VERSAO_DO_RETRATO } from './memoria'
import type { RetratoDaSessao } from './memoria'
import {
  lerExecucao,
  lerJournal,
  modeloDoMeta,
  pedidoDaTranscricao,
  resultadoEmTexto,
  ultimoTextoDaTranscricao,
} from './workflows'
import type { Execucao } from './workflows'
import { ABAS, ESCALAS_DO_GRAFO, agentesDoGrupo, escalaDoGrafo, desenhar, linhaDePilulas, linhaDeResumo, moverTurno, temRelogio, virouMinuto } from './telas'
import type { Acoes, Dados, Elementos, Quadro } from './telas'

const PAINEL = 'csr-lens'
const TITULO = 'Lens'

const ui = atom({ plugin: 'csr-lens', key: 'ui' } as const, UI_INICIAL)
const agentes = atom({ plugin: 'csr-lens', key: 'agentes' } as const, [])
const mensagens = atom({ plugin: 'csr-lens', key: 'mensagens' } as const, [])
const turnos = atom({ plugin: 'csr-lens', key: 'turnos' } as const, [])
const contexto = atom({ plugin: 'csr-lens', key: 'contexto' } as const, CONTEXTO_INICIAL)
const comandos = atom({ plugin: 'csr-lens', key: 'comandos' } as const, [])
const turno = atom({ plugin: 'csr-lens', key: 'turno' } as const, 0)
const rodadas = atom({ plugin: 'csr-lens', key: 'rodadas' } as const, [])
const serie = atom({ plugin: 'csr-lens', key: 'serie' } as const, 0)
// Quantos pedidos a pessoa fez: o número que as abas mostram como "Turno N".
const pedidos = atom({ plugin: 'csr-lens', key: 'pedidos' } as const, 0)
// O custo da sessão repartido pelos subagentes, resposta a resposta.
const gastos = atom({ plugin: 'csr-lens', key: 'gastos' } as const, GASTOS_INICIAIS)

// A aba Árvore: os arquivos tocados (acesos enquanto a ferramenta roda), o que
// o git vê alterado e as pastas listadas na árvore inteira.
const toques = atom({ plugin: 'csr-lens', key: 'toques' } as const, [])
const git = atom({ plugin: 'csr-lens', key: 'git' } as const, GIT_INICIAL)
const pastas = atom({ plugin: 'csr-lens', key: 'pastas' } as const, {})
// A aba Inventário: plugins, skills, comandos, hooks, MCP... lidos do disco e
// das listas da sessão.
const inventario = atom({ plugin: 'csr-lens', key: 'inventario' } as const, INVENTARIO_INICIAL)
// A conversa principal: modelo, esforço e cache da última resposta.
const sessao = atom({ plugin: 'csr-lens', key: 'sessao' } as const, {})
// O tique do relógio do painel (veja o $.clock.every do session.start).
const relogio = atom({ plugin: 'csr-lens', key: 'relogio' } as const, 0)

// O resumo do topo do painel e a leitura das pílulas: recalculados a cada
// segundo (e logo depois do que os muda), gravados só quando mudam.
const resumo = atom({ plugin: 'csr-lens', key: 'resumo' } as const, '')
// A versão compacta está na faixa? (veja ligarFaixa)
const faixaLigada = atom({ plugin: 'csr-lens', key: 'faixaLigada' } as const, false)
const faixa = atom({ plugin: 'csr-lens', key: 'faixa' } as const, {
  rodando: 0,
  contexto: CONTEXTO_INICIAL,
  git: GIT_INICIAL,
  sessao: {},
})

// A aba Diffs na fonte git: o diff do arquivo escolhido.
const diffGit = atom({ plugin: 'csr-lens', key: 'diffGit' } as const, {})

// A versão do painel: o desenho do painel lê só ela (e o instantâneo do
// módulo). Veja refrescarPainel.
const versao = atom({ plugin: 'csr-lens', key: 'versao' } as const, 0)
// Os tokens e o custo da conversa e dos agentes, para a aba Contexto.
const totais = atom({ plugin: 'csr-lens', key: 'totais' } as const, { conversa: 0, subagentes: 0 })

// Os detalhes abertos sob demanda, um membro por item: assim as listas que
// mudam a cada chamada continuam pequenas.
const fichasDeAgentes = { plugin: 'csr-lens', key: 'fichasDeAgentes' } as const
const fichasDeComandos = { plugin: 'csr-lens', key: 'fichasDeComandos' } as const
const fichasDeTurnos = { plugin: 'csr-lens', key: 'fichasDeTurnos' } as const

const fichaDoTurno = (n: number): string => `t${n % FICHAS_DE_TURNO}`

type Chamada = Frozen<ToolCallInput>

const campos = (valor: unknown): Readonly<Record<string, unknown>> =>
  typeof valor === 'object' && valor !== null ? (valor as Readonly<Record<string, unknown>>) : {}

// Um argumento de ferramenta lido sem confiar no formato: os tipos que o motor
// grava ao carregar o mod não trazem os argumentos de cada ferramenta.
const comoTexto = (valor: unknown): string => (typeof valor === 'string' ? valor : '')

// Do módulo, refeitos a cada recarga: nada que precise sobreviver a ela.
let raiz = ''
// Quantos reais vale um dólar (a opção cotacaoDoDolar do plugin.json).
const COTACAO_PADRAO = 5.22
let cotacao = COTACAO_PADRAO
let isRelogioLigado = false
// O último clique num botão do painel: o relógio espera um pouco depois dele,
// para o app não receber um desenho novo entre o clique e o próximo (ele
// recusa o clique feito num desenho que já foi trocado).
let ultimoClique = 0
// O último diff do git pedido: um mais antigo que chega depois é descartado.
let pedidoDeDiff = 0
// O último detalhe pedido (o clique mais recente vence o mais lento).
let pedidoDeFoco = 0
const PAUSA_DEPOIS_DO_CLIQUE_MS = 1500
let gitAgendado: Timer | undefined
// O diagnóstico de cliques (/lens diagnostico): as linhas registradas,
// ou undefined quando está desligado.
let diagnostico: string[] | undefined
let inventarioAgendado: Timer | undefined
// O instantâneo do painel: os dados e a hora em que foram lidos. O desenho do
// painel lê só daqui (e a versão), nunca os valores do estado: ler um valor
// ao desenhar inscreve o desenho nele, e cada chamada de ferramenta de cada
// agente redesenhava o painel. Cada desenho troca os botões no app, e um
// clique que chega depois disso é recusado (o "clicar duas vezes"); os
// gráficos em SVG piscavam a cada desenho. Agora o painel é redesenhado na
// hora depois de um clique, e o resto, no máximo a cada INTERVALO_DE_FUNDO_MS.
let instantaneo: { dados: Dados; agora: number } | undefined
let ultimoRefresco = 0
// Sobe a cada retrato pedido: uma leitura que termina depois de outra mais
// nova é descartada.
let geracao = 0
// O painel está aberto em algum lugar (o vigia só trabalha com ele aberto).
let isPainelAberto = false
const INTERVALO_DE_FUNDO_MS = 2500
// Os agentes de workflow: a pasta da sessão (achada uma vez), a execução de
// cada agente, o nome de cada execução e o modelo de cada agente já lidos.
let pastaDaSessao: string | undefined
let ultimaBuscaDaPasta = 0
const execucaoDoAgente = new Map<string, string>()
// As execuções que já terminaram (o arquivo delas não muda mais), o modelo
// de cada agente e o começo do pedido que a execução guardou.
const execucoesLidas = new Map<string, Execucao>()
// Os workflows que a conversa principal lançou nesta carga do mod: o nome e
// a pasta de cada execução, do resultado da ferramenta Workflow.
const workflowsLancados = new Map<string, { nome: string; pasta: string }>()
const modelosLidos = new Map<string, string>()
const pedidosDoWorkflow = new Map<string, string>()
const TRANSCRICAO_GRANDE = 'A transcrição deste agente passa de 4 MiB, o tamanho que o mod consegue ler.'
let workflowsAgendado: Timer | undefined
// A última gravação das pílulas (a faixa) que só mudou números.
let ultimaFaixa = 0
const INTERVALO_DA_FAIXA_MS = 3000

// Os comandos depois dos quais o inventário pode ter mudado.
const MEXEM_NO_INVENTARIO = new Set([
  'plugin',
  'plugins',
  'reload-plugins',
  'mcp',
  'agents',
  'hooks',
  'skills',
  'output-style',
  'config',
  'memory',
  'init',
])

// O nome de cada aba para `/lens <aba>`, sem acento e em minúsculas.
const ABAS_POR_NOME: Readonly<Record<string, LensAba>> = {
  visao: 0,
  geral: 0,
  inicio: 0,
  agentes: 1,
  diffs: 2,
  diff: 2,
  contexto: 3,
  turnos: 4,
  // A aba Arquivos saiu: os comandos Bash ficam em cada turno, e os arquivos
  // lidos na Árvore.
  arquivos: 4,
  comandos: 4,
  arvore: 5,
  inventario: 6,
}

const abaPeloNome = (texto: string): LensAba | undefined => {
  const nome = texto
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  // O número é a posição na barra, como as teclas 1 a 7 (e não o número
  // interno da aba, que ficou de quando a ordem era outra).
  return /^[1-7]$/.test(nome) ? ABAS[Number(nome) - 1]?.n : ABAS_POR_NOME[nome]
}

// As ferramentas que leem ou escrevem um arquivo, para a aba Árvore.
const LEITORAS = new Set(['Read'])
const ESCRITORAS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

// Os arquivos que uma chamada lê ou escreve, de qualquer agente: as
// ferramentas de arquivo, o Grep num arquivo e os comandos Bash (lidos do
// texto do comando: cat, sed -i, redirecionamentos...).
const arquivosDaChamada = (e: Chamada): ArquivoDoComando[] => {
  if (LEITORAS.has(e.tool) || ESCRITORAS.has(e.tool)) {
    const caminho = caminhoDe(e)

    return caminho === '' ? [] : [{ caminho, acao: LEITORAS.has(e.tool) ? 'lendo' : 'editando' }]
  }

  const entrada = campos(e)

  // O Grep num arquivo só (um caminho com extensão); numa pasta, nada. (Os
  // tipos gravados nesta máquina podem não ter o Grep: compara como texto.)
  const ferramenta: string = e.tool

  if (ferramenta === 'Grep') {
    const caminho = comoTexto(entrada.path)
    const absoluto = caminho === '' || caminho.startsWith('/') || raiz === '' ? caminho : `${raiz}/${caminho}`

    return /\.[A-Za-z0-9]+$/.test(absoluto) && !/[*?[{]/.test(absoluto) ? [{ caminho: absoluto, acao: 'lendo' }] : []
  }

  if (e.tool === 'Bash') {
    return arquivosDoComando(comoTexto(entrada.command), raiz)
  }

  return []
}

const caminhoDe = (e: Chamada): string => {
  const entrada = campos(e)
  const caminho = comoTexto(entrada.file_path) || comoTexto(entrada.notebook_path)

  return caminho === '' || caminho.startsWith('/') || raiz === '' ? caminho : `${raiz}/${caminho}`
}

// O registro nunca derruba o hook: uma falha vai para o log de depuração.
const anotar = async ($: EngineInterface, onde: string, trabalho: () => Promise<unknown>) => {
  try {
    await trabalho()
  } catch (erro) {
    $.ui.log(`csr-lens: ${onde}: ${String(erro)}`, { to: 'debug' })
    // Também no arquivo de erros, para ser lido depois (o log de debug do
    // Desktop fica desligado).
    await registrarErro($, `${onde}: ${erro instanceof Error ? `${erro.message}\n${erro.stack ?? ''}` : String(erro)}`).catch(
      () => undefined,
    )
  }
}

const gravarMedida = async (
  $: EngineInterface,
  medido: SessionContextUsage,
  limites: readonly SessionRateLimit[],
  custo: SessionCost | undefined,
) => {
  const n = await read($, turno)
  const atual = await read($, contexto)
  const medida = comMedida(atual, n, medido, limites, custo)

  // A mesma medida não redesenha o painel.
  if (!isIgual(atual, medida)) {
    await update($, contexto, () => medida)
  }

  await atualizarResumos($)

  return medida
}

// A chamada simples é de graça: os números da status line do próprio app.
const medir = async ($: EngineInterface) => {
  const uso = await $.session.usage()
  await gravarMedida($, uso.context, uso.rateLimits, uso.cost)
}

// De onde a repartição do custo parte: numa sessão retomada, o que já foi
// gasto antes não é de nenhum agente desta vez.
const partirDoCusto = async ($: EngineInterface) => {
  const usd = (await $.session.usage()).cost?.usd
  await update($, gastos, atual => comGasto(atual, usd, undefined, undefined))
}

// Ao fim de uma resposta do modelo: o que o custo da sessão subiu vai para o
// subagente que a fez, com o tamanho do contexto dele nessa resposta.
const somarGasto = async (
  $: EngineInterface,
  agenteId: string | undefined,
  uso: TurnUsage | null,
) => {
  const usd = (await $.session.usage()).cost?.usd
  // O quanto o custo da sessão subiu desde a última resposta, medido dentro da
  // própria gravação: com agentes respondendo ao mesmo tempo, uma leitura feita
  // antes dela via o mesmo `visto` velho em duas respostas, e a subida entrava
  // duas vezes na soma dos agentes (eles chegavam a passar de 100% do custo).
  let subiu = 0
  let jaSomado = 0
  const tamanho =
    uso === null
      ? undefined
      : uso.input_tokens +
        uso.cache_read_input_tokens +
        uso.cache_creation_input_tokens +
        uso.output_tokens
  await update($, gastos, atual => {
    subiu = usd === undefined ? 0 : Math.max(0, usd - atual.visto)
    // Um estado gravado antes deste total começa da soma dos gastos guardados.
    jaSomado = Object.values(atual.agentes).reduce((soma, gasto) => soma + gasto.usd, 0)

    return comGasto(atual, usd, agenteId, tamanho)
  })

  if (agenteId !== undefined && subiu > 0) {
    const atual = await read($, contexto)
    const visto = comCustoVisto(atual, usd)

    if (visto !== atual) {
      await update($, contexto, () => visto)
    }
  }

  if ((tamanho !== undefined && tamanho > 0) || (agenteId !== undefined && subiu > 0)) {
    const somado = tamanho ?? 0
    await update($, totais, atual =>
      agenteId === undefined
        ? {
            ...atual,
            conversa: atual.conversa + somado,
            ...(uso === null ? {} : { partesConversa: comPartes(atual.partesConversa, uso) }),
          }
        : {
            ...atual,
            subagentes: atual.subagentes + somado,
            usdSubagentes: (atual.usdSubagentes ?? jaSomado) + subiu,
            ...(uso === null ? {} : { partesSubagentes: comPartes(atual.partesSubagentes, uso) }),
          },
    )
  }
}

// O detalhamento do contexto por categoria. 'summary' estima localmente, sem
// requisição nenhuma; 'full' conta de verdade, com uma requisição por
// ferramenta e por arquivo de memória. Devolve false quando a sessão não o dá.
const detalharContexto = async (
  $: EngineInterface,
  modo: 'summary' | 'full',
): Promise<boolean> => {
  const uso = await $.session.usage({ breakdown: modo })
  const medido = uso.context.breakdown

  if (medido === undefined) {
    return false
  }

  const n = await read($, pedidos)
  const detalhe: LensDetalhe = {
    categorias: medido.categories.map(
      (categoria): LensCategoria => ({
        nome: categoria.name,
        tokens: categoria.tokens,
        tipo: categoria.kind,
      }),
    ),
    total: medido.totalTokens,
    janela: medido.rawMaxTokens,
    modelo: medido.model,
    turno: n,
    isExato: modo === 'full',
    ...(medido.isAutoCompactEnabled && medido.autoCompactThreshold !== undefined
      ? { compactaEm: medido.autoCompactThreshold }
      : {}),
  }
  const atual = await read($, contexto)
  // Uma contagem exata deste turno não é trocada por uma estimativa; e a
  // mesma estimativa não é gravada de novo.
  const temExataDoTurno = atual.detalhe?.isExato === true && atual.detalhe.turno === n

  if (!(modo === 'summary' && temExataDoTurno) && !isIgual(atual.detalhe, detalhe)) {
    await update($, contexto, agora => ({ ...agora, detalhe }))
  }
  await atualizarResumos($)

  return true
}

// Igual, sem contar o horário da leitura. Uma gravação igual redesenharia o
// painel à toa, e o Desktop perde o clique que chega a um desenho já trocado
// (o "ui_press not handled" do log do app): o que não mudou não é gravado.
const isIgual = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a, (chave, valor: unknown) => (chave === 'lidoEm' ? undefined : valor)) ===
  JSON.stringify(b, (chave, valor: unknown) => (chave === 'lidoEm' ? undefined : valor))

const atualizarResumos = async ($: EngineInterface) => {
  const listaDeAgentes = await read($, agentes)
  const medida = await read($, contexto)
  const novoResumo = resumoDaSessao(listaDeAgentes, await read($, rodadas), medida)

  if (novoResumo !== (await read($, resumo))) {
    await update($, resumo, () => novoResumo)
  }

  const novaFaixa = {
    rodando: listaDeAgentes.filter(agente => agente.estado === 'rodando').length,
    contexto: medida,
    git: await read($, git),
    sessao: await read($, sessao),
  }

  const atual = await read($, faixa)

  // Uma pílula a mais ou a menos (agentes rodando) vai na hora; só números
  // mudando, no máximo a cada INTERVALO_DA_FAIXA_MS: cada desenho da linha de
  // pílulas troca os botões dela no app.
  if (!isIgual(novaFaixa, atual)) {
    const agora = await $.clock.now()

    if (novaFaixa.rodando !== atual.rodando || agora - ultimaFaixa >= INTERVALO_DA_FAIXA_MS) {
      ultimaFaixa = agora
      await update($, faixa, () => novaFaixa)
    }
  }
}

// O git do projeto: o ramo, cada arquivo alterado e as linhas somadas. Sem
// repositório (ou sem git), a árvore mostra só o que a sessão tocou.
const atualizarGit = async ($: EngineInterface) => {
  const rodar = (argv: readonly string[]) => $.process.run(argv, { cwd: raiz, timeoutMs: 10_000 })
  const topo = await rodar(['git', 'rev-parse', '--show-toplevel'])

  if (topo.exitCode !== 0) {
    if (!isIgual(await read($, git), GIT_INICIAL)) {
      await update($, git, () => GIT_INICIAL)
    }


    return
  }

  const status = await rodar(['git', 'status', '--porcelain=v1', '-b', '-z', '--untracked-files=all'])
  // Num repositório sem commits, não há HEAD: ficam só as letras.
  const numstat = await rodar(['git', 'diff', 'HEAD', '--numstat', '-z'])
  const agora = await $.clock.now()
  const lido = lerGit(
    topo.stdout.trim(),
    status.exitCode === 0 ? status.stdout : '',
    numstat.exitCode === 0 ? numstat.stdout : '',
    agora,
  )
  if (!isIgual(await read($, git), lido)) {
    await update($, git, () => lido)
    await atualizarResumos($)
  }

  await acompanharDiffDoGit($)
}

// O diff do arquivo escolhido na aba Diffs, contra o HEAD. Um arquivo não
// rastreado não aparece no `git diff HEAD`: vai contra /dev/null.
const lerDiffDoGit = async ($: EngineInterface, caminho: string) => {
  const lido = await read($, git)
  const topo = lido.topo

  if (!lido.isRepo || topo === undefined) {
    return
  }

  pedidoDeDiff += 1
  const meu = pedidoDeDiff
  const rel = caminho.startsWith(`${topo}/`) ? caminho.slice(topo.length + 1) : caminho
  const rodar = (argv: readonly string[]) => $.process.run(argv, { cwd: topo, timeoutMs: 10_000 })
  let saida = (await rodar(['git', 'diff', 'HEAD', '--no-color', '--no-ext-diff', '--', rel])).stdout

  if (saida.trim() === '') {
    saida = (await rodar(['git', 'diff', '--no-color', '--no-ext-diff', '--no-index', '--', '/dev/null', rel])).stdout
  }

  // Enquanto o git rodava, outro arquivo pode ter sido escolhido: este diff já não vale.
  if (meu !== pedidoDeDiff) {
    return
  }

  const diff = diffDoGit(saida)
  const novo =
    diff === undefined
      ? {
          caminho,
          aviso: saida.includes('Binary files') ? 'Arquivo binário: sem diff de texto.' : 'Sem diferença de texto contra o HEAD.',
        }
      : { caminho, texto: diff.texto, cortadas: diff.cortadas }

  if (!isIgual(await read($, diffGit), novo)) {
    await update($, diffGit, () => novo)
  }
}

// Com a aba Diffs na fonte git, o diff do arquivo escolhido acompanha.
const acompanharDiffDoGit = async ($: EngineInterface, aba?: LensAba) => {
  const lida = await read($, ui)
  const visao = aba === undefined ? lida : { ...lida, aba }

  if (visao.aba !== 2 || fonteDe(visao) !== 'git') {
    return
  }

  const escolhido = arquivoEscolhido(visao, arquivosAlterados(visao, await read($, turnos), await read($, git), raiz))

  if (escolhido !== undefined) {
    await lerDiffDoGit($, escolhido.caminho)
  }
}

// Depois de uma escrita ou de um comando, o git é lido de novo, uma vez só
// quando as chamadas vêm em sequência.
const agendarGit = ($: EngineInterface) => {
  gitAgendado?.cancel()
  gitAgendado = $.clock.after(1500, () => {
    gitAgendado = undefined
    void anotar($, 'git', () => atualizarGit($))
  })
}

// Cada fonte do inventário devolve vazio quando falha: uma parte de fora não
// derruba o resto.
const fontesDoInventario = async ($: EngineInterface): Promise<Fontes> => {
  const casa = (await $.env.get('HOME')) ?? ''
  const configuracao = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${casa}/.claude`

  return {
    casa,
    configuracao,
    lerTexto: caminho => $.fs.read(caminho).catch(() => undefined),
    listar: caminho => $.fs.list(caminho).catch(() => []),
    comandos: () => $.command.list().catch(() => []),
    // Os plugins carregados de pasta (CLAUDE_CODE_PLUGIN_DIRS): não estão no
    // installed_plugins.json, mas rodam na sessão.
    pastasDePlugins: async () =>
      ((await $.env.get('CLAUDE_CODE_PLUGIN_DIRS').catch(() => undefined)) ?? '')
        .split(/[:,]/)
        .map(pasta => pasta.trim())
        .filter(pasta => pasta !== ''),
    ferramentas: () => $.tool.list().catch(() => []),
    // A estimativa local do contexto: sem requisição nenhuma.
    detalhe: async () =>
      (await $.session.usage({ breakdown: 'summary' }).catch(() => undefined))?.context.breakdown,
    configuracoes: fonte =>
      (fonte === undefined ? $.settings.read() : $.settings.read({ source: fonte })).catch(() => ({})),
    agora: () => $.clock.now(),
  }
}

const atualizarInventario = async ($: EngineInterface) => {
  const lido = await lerInventario(await fontesDoInventario($), raiz)
  const atual = await read($, inventario)

  // O horário conta só para o "atualizado agora": sem mudança, ele é
  // regravado no máximo a cada minuto.
  if (!isIgual(atual, lido) || (lido.lidoEm ?? 0) - (atual.lidoEm ?? 0) > 60_000) {
    await update($, inventario, () => lido)
  }
}

// Lido de novo pouco depois de um comando que mexe em plugins, MCP, hooks...
const agendarInventario = ($: EngineInterface, ms = 800) => {
  inventarioAgendado?.cancel()
  inventarioAgendado = $.clock.after(ms, () => {
    inventarioAgendado = undefined
    void anotar($, 'inventário', () => atualizarInventario($))
  })
}

// Uma pasta da árvore inteira, listada quando é aberta.
const listarPasta = async ($: EngineInterface, caminho: string) => {
  const lidas = await $.fs.list(caminho)
  const entradas = lidas
    .filter(entrada => !IGNORADAS.has(entrada.name))
    .map(
      (entrada): LensEntrada => ({
        nome: entrada.name,
        tipo: entrada.kind === 'dir' ? 'pasta' : 'arquivo',
      }),
    )
  const atual = await read($, pastas)

  if (!isIgual(atual[caminho], entradas)) {
    await update($, pastas, lista => comPasta(lista, caminho, entradas))
  }
}

const acertarAgentes = async ($: EngineInterface) => {
  const lista = await $.agent.list()
  const agora = await $.clock.now()
  const atual = await read($, agentes)
  const proxima = comListaDaSessao(atual, lista, agora)

  if (!isIgual(atual, proxima)) {
    await update($, agentes, () => proxima)
  }
}

const autor = async ($: EngineInterface, agentId: string | undefined): Promise<string> => {
  if (agentId === undefined) {
    return 'principal'
  }

  const agente = (await read($, agentes)).find(um => um.id === agentId)

  return agente === undefined || agente.tipo === 'agente'
    ? `agente ${agentId.slice(0, 6)}`
    : agente.tipo
}

const aoIniciar = async ($: EngineInterface, e: Chamada) => {
  const arquivos = arquivosDaChamada(e)

  if (arquivos.length > 0) {
    const quem = await autor($, e.agentId)
    const agora = await $.clock.now()
    await update($, toques, lista =>
      arquivos.reduce((atual, arquivo) => comToque(atual, { ...arquivo, quem, agora }), lista),
    )
  }

  if (e.agentId === undefined && e.tool !== 'Bash') {
    return
  }

  const agora = await $.clock.now()
  const agentId = e.agentId

  if (agentId !== undefined) {
    const argumento = resumoDaChamada(campos(e), raiz)
    const entrada = entradaDaChamada(e)
    const passo: LensPasso = {
      id: e.tool_use_id,
      ferramenta: e.tool,
      argumento,
      estado: 'rodando',
      inicio: agora,
      ...(entrada === '' ? {} : { entrada }),
    }
    // Um agente que já tinha terminado e chama uma ferramenta: um recado o
    // acordou, e a rodada nova dele começa aqui.
    await acordar($, agentId, agora)
    const lista = await update($, agentes, atual => comAtividade(atual, agentId, e.tool, argumento, agora))
    await update($, { ...fichasDeAgentes, id: agentId }, ficha => comPasso(ficha, passo))

    // Um agente sem agent.spawn (de um workflow): o nome dele está no journal.
    const tipo = lista.find(agente => agente.id === agentId)?.tipo

    if (tipo === 'agente' || tipo === 'workflow') {
      agendarWorkflows($)
    }
  }

  if (e.tool === 'Bash') {
    const entrada = campos(e)
    const inteiro = limpo(comoTexto(entrada.command))
    const descricao = limpo(comoTexto(entrada.description))
    // As fichas dos comandos giram em 100 lugares, como a lista.
    const lugar = `c${(await update($, serie, atual => atual + 1)) % FICHAS_DE_COMANDO}`
    const ficha: LensFichaDoComando = {
      id: e.tool_use_id,
      comando: cabeca(inteiro, 4000),
      ...(descricao === '' ? {} : { descricao: curto(umaLinha(descricao), 200) }),
    }
    const comando: LensComando = {
      id: e.tool_use_id,
      comando: curto(umaLinha(inteiro), 400),
      estado: 'rodando',
      inicio: agora,
      quem: await autor($, agentId),
      ficha: lugar,
      ordem: Math.max(1, await read($, pedidos)),
      ...(agentId === undefined ? {} : { agente: agentId }),
    }
    await update($, { ...fichasDeComandos, id: lugar }, () => ficha)
    await update($, comandos, lista => comComando(lista, comando))
  }
}

const fimDoBash = (saida: ToolCallResult, duracaoMs: number) => {
  if (saida.deny !== undefined) {
    return { estado: 'negado' as const, duracaoMs }
  }

  const resultado = campos(saida.result)

  if (saida.isError === true) {
    const texto = saida.text ?? (typeof saida.result === 'string' ? saida.result : '')
    const codigo = /Exit code (\d+)/.exec(texto)?.[1]

    return {
      estado: 'falhou' as const,
      duracaoMs,
      ...(codigo === undefined ? {} : { saida: Number(codigo) }),
      ...(resultado.interrupted === true ? { nota: 'interrompido' } : {}),
    }
  }

  if (typeof resultado.backgroundTaskId === 'string') {
    return { estado: 'fundo' as const }
  }

  const nota = resultado.returnCodeInterpretation

  return {
    estado: 'ok' as const,
    duracaoMs,
    ...(typeof nota === 'string' && nota !== '' ? { nota: curto(umaLinha(nota), 60) } : {}),
  }
}

const edicaoDe = (
  e: Chamada,
  saida: ToolCallResult,
  antes: string | null | undefined,
): LensEdicao | undefined => {
  const resultado = campos(saida.result)
  const entrada = campos(e)
  const caminho = comoTexto(entrada.file_path)

  // Retida para revisão: o arquivo não mudou.
  if (resultado.staged === true) {
    return undefined
  }

  const doMotor = lerRemendos(resultado.structuredPatch)

  if (e.tool === 'Write') {
    const escrito =
      typeof resultado.content === 'string' ? resultado.content : comoTexto(entrada.content)
    const original =
      antes ?? (typeof resultado.originalFile === 'string' ? resultado.originalFile : null)
    // O conteúdo lido antes da escrita manda; sem ele, o trecho do motor.
    const diff =
      typeof antes === 'string' || doMotor.length === 0
        ? compararTextos(original ?? '', escrito)
        : deRemendos(doMotor)

    return {
      id: e.tool_use_id,
      ferramenta: 'Write',
      caminho,
      isNovo: original === null && resultado.type !== 'update',
      ...diff,
    }
  }

  if (e.tool === 'Edit') {
    const diff =
      doMotor.length > 0
        ? deRemendos(doMotor)
        : compararTextos(comoTexto(entrada.old_string), comoTexto(entrada.new_string))

    return {
      id: e.tool_use_id,
      ferramenta: 'Edit',
      caminho,
      isNovo: false,
      ...diff,
    }
  }

  return undefined
}

const aoTerminar = async (
  $: EngineInterface,
  e: Chamada,
  saida: ToolCallResult,
  duracaoMs: number,
  antes: string | null | undefined,
) => {
  const isOk = saida.deny === undefined && saida.isError !== true
  const agentId = e.agentId

  const arquivos = arquivosDaChamada(e)

  if (arquivos.length > 0) {
    const edicao = isOk && ESCRITORAS.has(e.tool) ? edicaoDe(e, saida, antes) : undefined
    const agora = await $.clock.now()
    await update($, toques, lista =>
      arquivos.reduce(
        (atual, arquivo) =>
          comFimDoToque(atual, {
            caminho: arquivo.caminho,
            isOk,
            agora,
            ...(edicao === undefined ? {} : { mais: edicao.mais, menos: edicao.menos, isNovo: edicao.isNovo }),
          }),
        lista,
      ),
    )

    if (ESCRITORAS.has(e.tool)) {
      agendarGit($)
    }
  }

  if (e.tool === 'Bash') {
    agendarGit($)
  }

  if (agentId !== undefined) {
    await update($, { ...fichasDeAgentes, id: agentId }, ficha =>
      comFimDoPasso(ficha, e.tool_use_id, isOk, duracaoMs, saidaDaChamada(saida)),
    )

    // O agente entrega o relatório pela SubagentHandback, não como texto final:
    // o relatório é a resposta dele (o de quem roda em primeiro plano não volta
    // como turno do loop principal).
    const relatorio = e.tool === 'SubagentHandback' && isOk ? limpo(comoTexto(campos(e).message)).trim() : ''

    if (relatorio !== '') {
      const agora = await $.clock.now()
      await update($, { ...fichasDeAgentes, id: agentId }, ficha =>
        naFicha(ficha, { resposta: cabeca(relatorio, 6000), respostaEm: agora }),
      )
      // E o começo dele na lista, para o cartão do agente mostrar a resposta
      // (a mais recente: o mesmo agente pode responder em mais de uma rodada).
      const comeco = curto(umaLinha(relatorio), 400)
      await update($, agentes, lista =>
        lista.map(agente => (agente.id === agentId ? { ...agente, resultado: comeco } : agente)),
      )
    }
  }

  if (e.tool === 'Bash') {
    const fim = fimDoBash(saida, duracaoMs)
    const lista = await update($, comandos, atual => comFimDoComando(atual, e.tool_use_id, fim))
    const lugar = lista.find(comando => comando.id === e.tool_use_id)?.ficha

    if (lugar !== undefined) {
      const resultado = campos(saida.result)
      const fora = limpo(comoTexto(resultado.stdout)).trimEnd()
      const erro = limpo(
        isOk ? comoTexto(resultado.stderr) : (saida.deny ?? maisLongo(saida.text, comoTexto(saida.result))),
      ).trimEnd()
      await update($, { ...fichasDeComandos, id: lugar }, ficha =>
        // O lugar pode já ter girado para outro comando.
        ficha === undefined || ficha.id !== e.tool_use_id
          ? (ficha ?? { id: e.tool_use_id, comando: '' })
          : {
              ...ficha,
              ...(fora === '' ? {} : { saida: cauda(fora, 3000) }),
              ...(erro === '' ? {} : { erro: cauda(erro, 3000) }),
            },
      )
    }

    return
  }

  if (!isOk) {
    return
  }

  if (e.tool === 'Read') {
    return
  }

  // O Edit e o Write de qualquer um, da conversa principal e dos subagentes:
  // o de um subagente leva o nome dele. (O Bash de um subagente não entra: a
  // foto do git de antes e de depois pegaria o que os outros mudaram junto.)
  if (e.tool === 'Edit' || e.tool === 'Write') {
    const edicao = edicaoDe(e, saida, antes)

    if (edicao !== undefined) {
      const n = Math.max(1, await read($, pedidos))
      const agente = e.agentId === undefined ? undefined : (await read($, agentes)).find(um => um.id === e.agentId)
      const quem =
        e.agentId === undefined
          ? undefined
          : agente === undefined || (agente.tipo === 'agente' && agente.descricao === '')
            ? `agente ${e.agentId.slice(0, 6)}`
            : agente.descricao === ''
              ? agente.tipo
              : `${agente.tipo} (${curto(agente.descricao, 40)})`
      await update($, turnos, lista => comEdicao(lista, n, quem === undefined ? edicao : { ...edicao, quem }))
    }
  }
}

// As fotos da árvore de trabalho, para saber o que um comando Bash mudou (um
// sed -i, um script, um gerador): o git guarda o estado de todos os arquivos
// (os novos também; os ignorados, não). Nada vai para o projeto: o índice das
// fotos e as cópias novas ficam numa pasta temporária do sistema (que o
// sistema limpa sozinho), e o git só lê os objetos do repositório. O índice
// do usuário (o que está no stage) fica intacto. Uma foto por vez.
let ambienteDaFoto: Record<string, string> | undefined
let filaDeFotos: Promise<unknown> = Promise.resolve()

const naFila = <T,>(tarefa: () => Promise<T>): Promise<T> => {
  const vez = filaDeFotos.then(tarefa, tarefa)
  filaDeFotos = vez.catch(() => undefined)

  return vez
}

// O ambiente do git das fotos: o índice e os objetos novos na pasta
// temporária, com os do repositório só para leitura.
const prepararFotos = async (
  rodar: (argv: readonly string[], env?: Record<string, string>) => Promise<{ exitCode: number; stdout: string }>,
): Promise<Record<string, string> | undefined> => {
  const pasta = (await rodar(['mktemp', '-d', '-t', 'csr-lens'])).stdout.trim()
  const objetos = (await rodar(['git', 'rev-parse', '--path-format=absolute', '--git-path', 'objects'])).stdout.trim()

  if (pasta === '' || objetos === '') {
    return undefined
  }

  const ambiente = {
    GIT_INDEX_FILE: `${pasta}/index`,
    GIT_OBJECT_DIRECTORY: `${pasta}/objects`,
    GIT_ALTERNATE_OBJECT_DIRECTORIES: objetos,
  }

  await rodar(['mkdir', '-p', `${pasta}/objects`])
  // Parte do índice do usuário: os arquivos que não mudaram não são relidos.
  const real = (await rodar(['git', 'rev-parse', '--path-format=absolute', '--git-path', 'index'])).stdout.trim()

  if (real !== '') {
    await rodar(['cp', real, `${pasta}/index`])
  }

  return ambiente
}

const fotografar = ($: EngineInterface): Promise<string | undefined> =>
  naFila(async () => {
    const lido = await read($, git)
    const topo = lido.topo

    if (!lido.isRepo || topo === undefined) {
      return undefined
    }

    const rodar = (argv: readonly string[], env?: Record<string, string>) =>
      $.process.run(argv, { cwd: topo, timeoutMs: 5000, ...(env === undefined ? {} : { env }) })

    ambienteDaFoto ??= await prepararFotos(rodar)

    if (ambienteDaFoto === undefined) {
      return undefined
    }

    if ((await rodar(['git', 'add', '-A', '--', '.'], ambienteDaFoto)).exitCode !== 0) {
      return undefined
    }

    const arvore = await rodar(['git', 'write-tree'], ambienteDaFoto)

    return arvore.exitCode === 0 && arvore.stdout.trim() !== '' ? arvore.stdout.trim() : undefined
  })

// Um comando que mexe em muitos arquivos guarda os primeiros.
const MAX_ARQUIVOS_POR_COMANDO = 40

// Depois de um Bash: a foto nova contra a de antes; cada arquivo que mudou
// vira uma edição na Sessão, com o comando que a fez.
const registrarBash = async ($: EngineInterface, e: Chamada, antes: string, n: number) => {
  const depois = await fotografar($)
  const topo = (await read($, git)).topo

  if (depois === undefined || depois === antes || topo === undefined) {
    return
  }

  // As duas fotos estão na pasta temporária: o diff lê de lá.
  const saida = await $.process.run(
    ['git', '-c', 'core.quotePath=false', 'diff', '--no-color', '--no-ext-diff', '--no-renames', antes, depois],
    { cwd: topo, timeoutMs: 10_000, ...(ambienteDaFoto === undefined ? {} : { env: ambienteDaFoto }) },
  )

  if (saida.exitCode !== 0) {
    return
  }

  const comando = curto(umaLinha(comoTexto(campos(e).command)), 120)
  const arquivos = arquivosDoDiff(saida.stdout).slice(0, MAX_ARQUIVOS_POR_COMANDO)

  for (const [i, arquivo] of arquivos.entries()) {
    const diff = arquivo.isBinario ? { linhas: [], mais: 0, menos: 0, cortadas: 0 } : deRemendos(arquivo.remendos)
    const edicao: LensEdicao = {
      id: `${e.tool_use_id}:${i}`,
      ferramenta: 'Bash',
      comando,
      caminho: `${topo}/${arquivo.caminho}`,
      isNovo: arquivo.isNovo,
      ...(arquivo.isApagado ? { isApagado: true } : {}),
      ...diff,
    }
    await update($, turnos, lista => comEdicao(lista, n, edicao))
  }

  agendarGit($)
  cutucarPainel($)
}

// O conteúdo de antes de um Write, para o diff ser o real; null: não havia
// arquivo (ou ele não pôde ser lido, ou passa de 4 MiB).
const lerAntes = async ($: EngineInterface, caminho: string): Promise<string | null> => {
  try {
    return await $.fs.read(caminho)
  } catch {
    return null
  }
}

// As últimas mensagens que um subagente escreveu, lidas da transcrição dele.
const lerMensagens = async ($: EngineInterface, agentId: string) => {
  const lidas = await $.session.messages({ agentId }).catch(() => undefined)

  // A sessão não lê a transcrição desse agente: um agente de workflow tem a
  // dele no disco, na pasta da execução.
  if (!Array.isArray(lidas)) {
    await lerTranscricaoDoWorkflow($, agentId)

    return
  }

  const mensagens = lidas
    .filter(mensagem => mensagem.role === 'assistant' && mensagem.text.trim() !== '')
    .slice(-8)
    .map(mensagem => cabeca(limpo(mensagem.text).trim(), 1500))
  await update($, { ...fichasDeAgentes, id: agentId }, ficha => naFicha(ficha, { mensagens }))
}

// A versão compacta na faixa, ligada ou não: no `ui` (o painel a lê) e num
// valor só dela, o único que a faixa lê com ela desligada. Assim um clique no
// painel não redesenha a linha de pílulas.
const ligarFaixa = async ($: EngineInterface, isFaixa: boolean) => {
  await update($, ui, atual => ({ ...atual, isFaixa }))

  // Sem a versão compacta, ninguém lê o tique do relógio.
  if (!isFaixa) {
    isRelogioLigado = false
  }

  if ((await read($, faixaLigada)) !== isFaixa) {
    await update($, faixaLigada, () => isFaixa)
  }
}

// O grafo ampliado e o zoom, guardados entre sessões ($.store, que o
// desenho não lê: guardar não redesenha nada).
const CHAVE_DO_GRAFO = 'grafo'

const guardarGrafo = async ($: EngineInterface, visao: LensUi) => {
  await $.store.set(CHAVE_DO_GRAFO, {
    isGrande: visao.isGrafoGrande === true,
    ...(visao.escalaDoGrafo === undefined ? {} : { escala: visao.escalaDoGrafo }),
  })
}

const lembrarGrafo = async ($: EngineInterface) => {
  const guardado = await $.store.get(CHAVE_DO_GRAFO)

  if (typeof guardado !== 'object' || guardado === null) {
    return
  }

  const { isGrande, escala } = guardado as { isGrande?: unknown; escala?: unknown }
  const isGrafoGrande = isGrande === true
  const guardada = ESCALAS_DO_GRAFO.find(passo => passo === escala)
  const atual = await read($, ui)

  if (atual.isGrafoGrande !== isGrafoGrande || atual.escalaDoGrafo !== guardada) {
    await update($, ui, visao => {
      const { escalaDoGrafo: _antiga, ...resto } = visao

      return { ...resto, isGrafoGrande, ...(guardada === undefined ? {} : { escalaDoGrafo: guardada }) }
    })
  }
}

// O retrato da sessão no $.store (veja memoria.ts): uma chave por sessão e
// a lista das que têm retrato.
const CHAVE_DOS_RETRATOS = 'retratos'
const chaveDoRetrato = (sessaoId: string) => `retrato:${sessaoId}`
// Guardado no máximo a cada 20 s (o fim de um turno e o da sessão guardam na hora).
const INTERVALO_DO_RETRATO_MS = 20_000
let ultimoRetrato = Number.NEGATIVE_INFINITY
// O último retrato gravado (sem a hora): o mesmo de novo não vai ao disco.
let retratoGravado = ''

const guardarSessao = async ($: EngineInterface, isNaHora = false) => {
  const agora = await $.clock.now()

  if (!isNaHora && agora - ultimoRetrato < INTERVALO_DO_RETRATO_MS) {
    return
  }

  ultimoRetrato = agora
  const listaDeAgentes = await read($, agentes)
  const listaDeComandos = await read($, comandos)
  const listaDeRodadas = await read($, rodadas)
  const quantosPedidos = await read($, pedidos)

  // Uma sessão em que nada aconteceu ainda não apaga o retrato de antes.
  if (quantosPedidos === 0 && listaDeAgentes.length === 0 && listaDeRodadas.length === 0) {
    return
  }

  const fichas = async <T,>(ids: readonly string[], ler: (id: string) => Promise<T | undefined>) => {
    const lidas: Record<string, T> = {}

    for (const id of ids) {
      const ficha = await ler(id)

      if (ficha !== undefined) {
        lidas[id] = ficha
      }
    }

    return lidas
  }
  const completo: RetratoDaSessao = {
    versao: VERSAO_DO_RETRATO,
    quando: agora,
    agentes: listaDeAgentes,
    mensagens: await read($, mensagens),
    turnos: await read($, turnos),
    contexto: await read($, contexto),
    comandos: listaDeComandos,
    turno: await read($, turno),
    rodadas: listaDeRodadas,
    serie: await read($, serie),
    pedidos: quantosPedidos,
    gastos: await read($, gastos),
    totais: await read($, totais),
    toques: await read($, toques),
    fichas: {
      agentes: await fichas(
        listaDeAgentes.map(agente => agente.id),
        id => read($, { ...fichasDeAgentes, id }),
      ),
      comandos: await fichas(
        listaDeComandos.flatMap(comando => (comando.ficha === undefined ? [] : [comando.ficha])),
        id => read($, { ...fichasDeComandos, id }),
      ),
      turnos: await fichas(
        [...new Set(listaDeRodadas.map(rodada => fichaDoTurno(rodada.n)))],
        id => read($, { ...fichasDeTurnos, id }),
      ),
    },
  }
  const retrato = retratoQueCabe(completo)

  const sessaoId = await $.session.id()
  const assinatura = retrato === undefined ? '' : `${sessaoId}:${JSON.stringify({ ...retrato, quando: 0 })}`

  if (retrato === undefined || assinatura === retratoGravado) {
    return
  }

  const { fica, sai } = indiceDosRetratos(await $.store.get(CHAVE_DOS_RETRATOS), sessaoId)

  for (const velho of sai) {
    await $.store.delete(chaveDoRetrato(velho))
  }

  try {
    await $.store.set(chaveDoRetrato(sessaoId), retrato)
    await $.store.set(CHAVE_DOS_RETRATOS, fica)
  } catch {
    // O store passaria de 4 MiB: ficam só o desta sessão (e o resto do store).
    for (const outro of fica.filter(id => id !== sessaoId)) {
      await $.store.delete(chaveDoRetrato(outro))
    }

    await $.store.set(chaveDoRetrato(sessaoId), retrato)
    await $.store.set(CHAVE_DOS_RETRATOS, [sessaoId])
  }

  // Só depois de gravado: uma falha tenta de novo na próxima vez.
  retratoGravado = assinatura
}

// Uma sessão retomada (o app fechou e abriu de novo) volta como estava. Só num
// estado vazio: numa recarga do mod, o $.state ainda tem tudo, e mais novo.
const recuperarSessao = async ($: EngineInterface) => {
  const isVazio =
    (await read($, pedidos)) === 0 &&
    (await read($, agentes)).length === 0 &&
    (await read($, rodadas)).length === 0

  if (!isVazio) {
    return
  }

  const lido = lerRetrato(await $.store.get(chaveDoRetrato(await $.session.id())))

  if (lido === undefined) {
    return
  }

  const retrato = retratoAcertado(lido)
  const pedacos: Promise<unknown>[] = [
    ...(retrato.agentes === undefined ? [] : [update($, agentes, () => retrato.agentes ?? [])]),
    ...(retrato.mensagens === undefined ? [] : [update($, mensagens, () => retrato.mensagens ?? [])]),
    ...(retrato.turnos === undefined ? [] : [update($, turnos, () => retrato.turnos ?? [])]),
    ...(retrato.contexto === undefined ? [] : [update($, contexto, () => retrato.contexto ?? CONTEXTO_INICIAL)]),
    ...(retrato.comandos === undefined ? [] : [update($, comandos, () => retrato.comandos ?? [])]),
    ...(retrato.turno === undefined ? [] : [update($, turno, () => retrato.turno ?? 0)]),
    ...(retrato.rodadas === undefined ? [] : [update($, rodadas, () => retrato.rodadas ?? [])]),
    ...(retrato.serie === undefined ? [] : [update($, serie, () => retrato.serie ?? 0)]),
    ...(retrato.pedidos === undefined ? [] : [update($, pedidos, () => retrato.pedidos ?? 0)]),
    ...(retrato.gastos === undefined ? [] : [update($, gastos, () => retrato.gastos ?? GASTOS_INICIAIS)]),
    ...(retrato.totais === undefined ? [] : [update($, totais, () => retrato.totais ?? { conversa: 0, subagentes: 0 })]),
    ...(retrato.toques === undefined ? [] : [update($, toques, () => retrato.toques ?? [])]),
    ...Object.entries(retrato.fichas?.agentes ?? {}).map(([id, ficha]) => update($, { ...fichasDeAgentes, id }, () => ficha)),
    ...Object.entries(retrato.fichas?.comandos ?? {}).map(([id, ficha]) => update($, { ...fichasDeComandos, id }, () => ficha)),
    ...Object.entries(retrato.fichas?.turnos ?? {}).map(([id, ficha]) => update($, { ...fichasDeTurnos, id }, () => ficha)),
  ]
  await Promise.all(pedacos)
  await atualizarResumos($)
}

// O texto da ferramenta às vezes é só o resumo ("Exit code 2") e o resultado
// traz a saída inteira: vale o mais longo dos dois.
const maisLongo = (a: string | undefined, b: string | undefined): string =>
  (a ?? '').length >= (b ?? '').length ? (a ?? '') : (b ?? '')

// Os argumentos de uma chamada, em JSON legível (sem o que é do motor), para o
// detalhe do agente abrir a chamada.
const entradaDaChamada = (e: Chamada): string => {
  const { tool: _tool, tool_use_id: _id, agentId: _agente, ...argumentos } = campos(e) as Record<string, unknown>

  return Object.keys(argumentos).length === 0 ? '' : cabeca(limpo(JSON.stringify(argumentos, null, 2)), 1500)
}

// O que a chamada devolveu: a recusa, o texto do resultado ou, sem texto, o
// resultado em JSON; o fim, que é onde costuma estar o que importa.
const saidaDaChamada = (saida: { deny?: string; text?: string; result?: unknown }): string => {
  const texto =
    saida.deny ??
    maisLongo(saida.text, typeof saida.result === 'string' ? saida.result : undefined) ??
    ''
  const inteiro =
    texto !== '' ? texto : saida.result === undefined ? '' : JSON.stringify(saida.result, null, 2) ?? ''

  return cauda(limpo(inteiro).trimEnd(), 1500)
}

// O que o agente lê quando a pessoa pede para ele parar: no recado e na
// recusa de cada ferramenta que ele tentar depois disso.
const PEDIDO_DE_PARAR =
  'A pessoa pediu, pelo painel do Multishell, para você parar agora. Não chame mais ferramentas de trabalho: entregue já o relatório (a SubagentHandback continua liberada, se você a usa), em poucas linhas, com o que fez até aqui e o que ficou por fazer.'

// Parar um agente: o mod não tem como encerrar o agente à força. Ele recebe
// um recado pedindo para parar, e cada ferramenta que tentar depois é negada
// com o mesmo pedido; sem ferramentas, ele termina na resposta seguinte.
const pararAgente = async ($: EngineInterface, agentId: string) => {
  const lista = await read($, agentes)
  const agente = lista.find(um => um.id === agentId)

  if (agente === undefined || agente.estado !== 'rodando' || agente.isParando === true) {
    return
  }

  await update($, agentes, atual => atual.map(um => (um.id === agentId ? { ...um, isParando: true } : um)))
  await $.session.send({ to: { agentId }, text: PEDIDO_DE_PARAR }).catch(() => undefined)
  await $.ui.toast(`Pedi para ${agente.descricao === '' ? agente.tipo : agente.descricao} parar.`).catch(() => undefined)
}

// Um agente que já tinha terminado volta a trabalhar (um recado o acordou):
// a rodada nova dele começa em `inicio`, com quem o acordou, o recado inteiro
// (o último que chegou depois de ele terminar) e o custo dele até aqui, para
// a rodada saber o que custou. Devolve se foi mesmo uma retomada (um agente
// que roda, ou um de workflow, fica como está).
const acordar = async ($: EngineInterface, agentId: string, inicio: number): Promise<boolean> => {
  const antes = (await read($, agentes)).find(agente => agente.id === agentId)

  if (antes === undefined || antes.estado === 'rodando' || antes.workflow !== undefined || antes.tipo === 'workflow') {
    return false
  }

  await update($, agentes, lista => comRetomada(lista, agentId, inicio))
  const ficha = await read($, { ...fichasDeAgentes, id: agentId })
  const recado = ficha?.ultimoRecado
  const isDaRodada = recado !== undefined && recado.quando >= (antes.fim ?? antes.inicio) - 1000

  // Quem o acordou, também na lista (o turno decide por ela se a rodada é dele).
  if (isDaRodada) {
    await update($, agentes, lista =>
      lista.map(agente => {
        if (agente.id !== agentId) {
          return agente
        }

        const vivos = new Set((agente.inicios ?? []).map(String))
        const antigos = Object.fromEntries(Object.entries(agente.acordadoPor ?? {}).filter(([quando]) => vivos.has(quando)))

        return { ...agente, acordadoPor: { ...antigos, [String(inicio)]: recado.de } }
      }),
    )
  }
  const gasto = (await read($, gastos)).agentes[agentId]?.usd
  await update($, { ...fichasDeAgentes, id: agentId }, atual =>
    comRodadaAberta(atual, {
      inicio,
      ...(isDaRodada ? { quem: recado.de, recado: recado.texto } : {}),
      ...(gasto === undefined ? {} : { gastoNoInicio: gasto }),
    }),
  )

  return true
}

const acoes = ($: EngineInterface): Acoes => ({
  // Trocar de aba fecha o detalhe aberto. O que a aba nova precisa é lido
  // antes e a aba muda por último: um clique, um desenho só (um segundo
  // desenho logo depois deixava o próximo clique no desenho velho, e o app o
  // recusava: o "clicar duas vezes").
  aba: (aba: LensAba) =>
    agir($, 'aba', async () => {
      const antes = (await read($, ui)).aba

      // Abrir o inventário lê tudo de novo: o que mudou desde a última vez aparece.
      if (aba === 6) {
        await atualizarInventario($)
      }

      await acompanharDiffDoGit($, aba)
      const atual = await read($, ui)

      // Outra aba foi escolhida enquanto a leitura corria (a escolha nova
      // fica), ou a aba já está aberta, sem detalhe por cima: nada a gravar.
      // (Um `update` que devolve o mesmo valor grava e redesenha do mesmo jeito.)
      if (atual.aba !== antes || (atual.aba === aba && atual.foco === undefined)) {
        return
      }

      await update($, ui, agora => {
        const { foco: _foco, ...resto } = agora

        return { ...resto, aba }
      })
    }),
  abrir: (foco: LensFoco) =>
    agir($, 'abrir detalhe', async () => {
      pedidoDeFoco += 1
      const meu = pedidoDeFoco

      if (foco.tipo === 'agente' || foco.tipo === 'rodada') {
        await lerMensagens($, foco.id)
      }

      // Outro detalhe foi pedido enquanto as mensagens eram lidas: vale o
      // último. O mesmo detalhe já aberto não é gravado de novo.
      if (meu === pedidoDeFoco && !isIgual((await read($, ui)).foco, foco)) {
        await update($, ui, atual => ({ ...atual, foco }))
      }
    }),
  // Sobe um nível do caminho: o detalhe volta para onde foi aberto (um turno,
  // um agente, uma rodada), que por sua vez volta para onde veio (veja
  // hooks/caminho.ts); sem volta, fecha o detalhe.
  voltar: () =>
    agir($, 'voltar', () =>
      update($, ui, atual => {
        const { foco, ...resto } = atual
        const acima = focoDaVolta(foco?.volta)

        return acima === undefined ? resto : { ...resto, foco: acima }
      }),
    ),
  mensagens: (agentId: string) => agir($, 'mensagens do agente', () => lerMensagens($, agentId)),
  pararAgente: (agentId: string) => agir($, 'parar o agente', () => pararAgente($, agentId)),
  turno: delta =>
    agir($, 'turno', async () => {
      const lista = await read($, turnos)
      await update($, ui, atual => moverTurno(atual, lista, delta))
    }),
  fonteDoDiff: fonte =>
    agir($, 'fonte do diff', async () => {
      await update($, ui, atual => ({ ...atual, fonteDoDiff: fonte }))

      if (fonte === 'git') {
        await atualizarGit($)
      }
    }),
  // Da Visão geral: a aba Diffs, na fonte Sessão, já no arquivo escolhido.
  diffDoArquivo: caminho =>
    agir($, 'diff do arquivo', async () => {
      await update($, ui, atual => {
        const { foco: _foco, ...resto } = atual

        return { ...resto, aba: 2, fonteDoDiff: 'sessao', arquivoDoDiff: caminho }
      })
    }),
  arquivo: caminho =>
    agir($, 'arquivo do diff', async () => {
      await update($, ui, atual => ({ ...atual, arquivoDoDiff: caminho }))
      await acompanharDiffDoGit($)
    }),
  arquivoVizinho: delta =>
    agir($, 'arquivo vizinho', async () => {
      const lista = await read($, turnos)
      const doGit = await read($, git)
      const atual = await read($, ui)
      const alterados = arquivosAlterados(atual, lista, doGit, raiz)
      const proximo = arquivoVizinho(atual, alterados, delta)

      // No fim da lista, nada muda (e nada é gravado).
      if (proximo === undefined || proximo === arquivoEscolhido(atual, alterados)?.caminho) {
        return
      }

      await update($, ui, agora => ({ ...agora, arquivoDoDiff: proximo }))
      await acompanharDiffDoGit($)
    }),
  // A única contagem de tokens extra do mod, e só quando o botão é apertado.
  detalhar: () =>
    agir($, 'contagem exata', async () => {
      await update($, ui, atual => ({ ...atual, isCalculando: true }))
      // O "Contando…" aparece já: a contagem leva alguns segundos.
      await refrescarPainel($)

      try {
        if (!(await detalharContexto($, 'full'))) {
          $.ui.toast('csr-lens: a sessão não devolveu o detalhamento do contexto')
        }
      } finally {
        await update($, ui, atual => ({ ...atual, isCalculando: false }))
      }
    }),
  fechar: () => agir($, 'fechar a faixa', () => ligarFaixa($, false)),
  pasta: (caminho, isAbertaAgora) =>
    agir($, 'pasta', async () => {
      const visao = await update($, ui, atual => comPastaAlternada(atual, caminho, isAbertaAgora))

      // Na árvore inteira, a pasta aberta pela primeira vez é listada.
      if (!isAbertaAgora && visao.isArvoreToda === true && (await read($, pastas))[caminho] === undefined) {
        await listarPasta($, caminho)
      }
    }),
  arvoreToda: () =>
    agir($, 'árvore inteira', async () => {
      const visao = await update($, ui, atual => ({ ...atual, isArvoreToda: atual.isArvoreToda !== true }))

      if (visao.isArvoreToda === true) {
        await listarPasta($, raiz)
      }
    }),
  atualizarArvore: () =>
    agir($, 'atualizar árvore', async () => {
      await atualizarGit($)

      // As pastas já listadas são lidas de novo: arquivos podem ter surgido.
      for (const caminho of Object.keys(await read($, pastas))) {
        await listarPasta($, caminho).catch(() => undefined)
      }
    }),
  // Outra seção (ou outro filtro) começa de novo nos primeiros itens.
  secao: secao =>
    agir($, 'seção', () =>
      update($, ui, atual => {
        const { itensDoInventario: _itens, ...resto } = atual

        return { ...resto, secaoDoInventario: secao }
      }),
    ),
  secaoVizinha: delta =>
    agir($, 'seção vizinha', () =>
      update($, ui, atual => {
        const indice = SECOES.findIndex(uma => uma.id === (atual.secaoDoInventario ?? 'plugin'))
        const proxima = SECOES[(indice + delta + SECOES.length) % SECOES.length]

        const { itensDoInventario: _itens, ...resto } = atual

        return proxima === undefined ? atual : { ...resto, secaoDoInventario: proxima.id }
      }),
    ),
  filtroDoInventario: texto =>
    agir($, 'filtro do inventário', () =>
      update($, ui, atual => {
        const { itensDoInventario: _itens, ...resto } = atual

        return { ...resto, filtroDoInventario: texto }
      }),
    ),
  maisDoInventario: () =>
    agir($, 'mais do inventário', () =>
      update($, ui, atual => ({ ...atual, itensDoInventario: (atual.itensDoInventario ?? ITENS_POR_VEZ) + ITENS_POR_VEZ })),
    ),
  atualizarInventario: () => agir($, 'atualizar inventário', () => atualizarInventario($)),
  alternarSecao: chave =>
    agir($, 'seção aberta ou fechada', () =>
      update($, ui, atual => {
        const fechadas = atual.secoesFechadas ?? []

        return {
          ...atual,
          secoesFechadas: fechadas.includes(chave)
            ? fechadas.filter(uma => uma !== chave)
            : [...fechadas, chave].slice(-100),
        }
      }),
    ),
  grupoDoInventario: chave =>
    agir($, 'grupo do inventário', () =>
      update($, ui, atual => {
        const fechados = atual.gruposFechados ?? []

        return {
          ...atual,
          gruposFechados: fechados.includes(chave)
            ? fechados.filter(um => um !== chave)
            : [...fechados, chave].slice(-200),
        }
      }),
    ),
  recolher: () =>
    agir($, 'recolher', async () => {
      const visao = await read($, ui)
      const arvore = montarArvore({
        raiz,
        toques: await read($, toques),
        git: await read($, git),
        pastas: await read($, pastas),
        isToda: visao.isArvoreToda === true,
        agora: await $.clock.now(),
      })
      const abertas = linhasDaArvore(arvore, visao)
        .filter(linha => linha.no.tipo === 'pasta' && isAberta(linha.no, visao))
        .map(linha => linha.no.caminho)
      await update($, ui, atual => ({
        ...atual,
        pastasAbertas: [],
        pastasFechadas: [...new Set([...(atual.pastasFechadas ?? []), ...abertas])].slice(-200),
      }))
    }),
  // O tamanho e o zoom do grafo valem para as próximas sessões também.
  grafoGrande: () =>
    agir($, 'tamanho do grafo', async () => {
      const visao = await update($, ui, atual => ({ ...atual, isGrafoGrande: atual.isGrafoGrande !== true }))
      await guardarGrafo($, visao)
    }),
  escalaDoGrafo: passo =>
    agir($, 'zoom do grafo', async () => {
      const atual = await read($, ui)
      const posicao = ESCALAS_DO_GRAFO.findIndex(escala => escala >= escalaDoGrafo(atual))
      const indice = Math.max(0, Math.min(ESCALAS_DO_GRAFO.length - 1, (posicao === -1 ? 1 : posicao) + passo))
      const escolhida = ESCALAS_DO_GRAFO[indice] ?? 1

      // No zoom mínimo ou máximo, o botão não muda nada.
      if (escolhida === escalaDoGrafo(atual)) {
        return
      }

      const visao = await update($, ui, agora => ({ ...agora, escalaDoGrafo: escolhida }))
      await guardarGrafo($, visao)
    }),
  filtroDoGrafo: filtro => agir($, 'filtro do grafo', () => update($, ui, atual => ({ ...atual, filtroDoGrafo: filtro }))),
  // Abre todas as pastas que a árvore conhece; na árvore inteira, lista as
  // que ainda não foram lidas (um nível por vez, para não varrer o disco).
  expandir: () =>
    agir($, 'expandir', async () => {
      const visao = await read($, ui)
      const lidas = await read($, pastas)
      const arvore = montarArvore({
        raiz,
        toques: await read($, toques),
        git: await read($, git),
        pastas: lidas,
        isToda: visao.isArvoreToda === true,
        agora: await $.clock.now(),
      })
      const todas: string[] = []
      const visitar = (no: NoDaArvore) => {
        if (no.tipo === 'pasta') {
          todas.push(no.caminho)
          no.filhos.forEach(visitar)
        }
      }
      arvore.filhos.forEach(visitar)
      await update($, ui, atual => ({ ...atual, pastasAbertas: todas.slice(0, 200), pastasFechadas: [] }))

      if (visao.isArvoreToda === true) {
        for (const caminho of todas.filter(uma => lidas[uma] === undefined).slice(0, 40)) {
          await listarPasta($, caminho).catch(() => undefined)
        }
      }
    }),
})

// O que os subagentes custaram: a soma guardada ou, num estado de antes dela,
// a dos gastos por agente.
// A soma dos gastos por agente é a conta exata (a mesma dos cartões); a soma
// guardada à parte só vale quando os gastos mais antigos já saíram da lista.
// (Ela chegou a contar a mesma subida duas vezes com agentes em paralelo.)
const usdDosSubagentes = async ($: EngineInterface, somados: LensTotais) => {
  const porAgente = Object.values((await read($, gastos)).agentes)
  const soma = porAgente.reduce((total, gasto) => total + gasto.usd, 0)

  return porAgente.length < MAX_GASTOS || somados.usdSubagentes === undefined ? soma : somados.usdSubagentes
}

const lerTotalGeral = async ($: EngineInterface): Promise<NonNullable<Dados['totais']>> => {
  const somados = await read($, totais)
  const usdSubagentes = await usdDosSubagentes($, somados)
  const semCacheConversa = semCache(somados.partesConversa)
  const semCacheSubagentes = semCache(somados.partesSubagentes)
  const antes = somados.antes

  return {
    tokensConversa: somados.conversa,
    tokensSubagentes: somados.subagentes,
    usdSubagentes,
    semCacheConversa,
    semCacheSubagentes,
    quantosAgentes: (await read($, agentes)).length,
    ...(antes === undefined
      ? {}
      : {
          ultimo: {
            tokensConversa: somados.conversa - antes.conversa,
            tokensSubagentes: somados.subagentes - antes.subagentes,
            semCacheConversa: semCacheConversa - antes.semCacheConversa,
            semCacheSubagentes: semCacheSubagentes - antes.semCacheSubagentes,
            usdSubagentes: Math.max(0, usdSubagentes - antes.usdSubagentes),
          },
        }),
  }
}

// Só o que a aba em vista usa: ler um valor inscreve o desenho nele, e o
// painel seria redesenhado inteiro a cada chamada de ferramenta, mesmo numa
// aba que não mostra nada dela (o que chegou a travar o painel no Desktop).
const lerDados = async ($: EngineInterface): Promise<Dados> => {
  const lida = await read($, ui)
  // A aba gravada antes de a aba Arquivos sair pode não existir mais.
  const visao = lida.aba > 6 ? { ...lida, aba: 6 as const } : lida
  const aba = visao.aba
  const foco = visao.foco
  // O detalhe de um agente (ou de uma rodada dele) lista os comandos Bash dele.
  const isAgente = foco?.tipo === 'agente' || foco?.tipo === 'rodada'
  const lista = aba === 4 || isAgente || foco?.tipo === 'comando' ? await read($, comandos) : []
  const isTurno = foco?.tipo === 'turno'
  // A Visão geral lê um pouco de cada aba.
  const isVisao = aba === 0
  // O caminho no alto de um detalhe dá nome aos agentes dele.
  const isComAgentes = aba === 1 || aba === 4 || isVisao || foco !== undefined
  const dados: Dados = {
    ui: visao,
    resumo: await read($, resumo),
    // O detalhe de um turno dá nome aos agentes que voltaram nele.
    // O detalhe de um turno mostra os agentes dele (e abre o detalhe de cada
    // um); a lista de turnos, os nomes dos agentes de cada turno.
    agentes: isComAgentes ? comGastos(await read($, agentes), await read($, gastos)) : [],
    // O detalhe de um agente também: os recados que ele mandou e recebeu.
    mensagens: isComAgentes ? await read($, mensagens) : [],
    turnos: aba === 2 || aba === 4 || isVisao ? await read($, turnos) : [],
    contexto: aba === 3 || aba === 4 || isVisao ? await read($, contexto) : CONTEXTO_INICIAL,
    comandos: lista,
    rodadas: aba === 1 || aba === 4 || isVisao ? await read($, rodadas) : [],
    ...(aba === 1 ? { inicioDaSessao: (await read($, sessao)).inicio } : {}),
    arvore: {
      toques: aba === 5 || isVisao ? await read($, toques) : [],
      git: aba === 2 || aba === 5 || isVisao ? await read($, git) : GIT_INICIAL,
      pastas: aba === 5 ? await read($, pastas) : {},
    },
    inventario: aba === 1 || aba === 4 || aba === 6 || isVisao || isTurno || isAgente ? await read($, inventario) : INVENTARIO_INICIAL,
    diffGit: aba === 2 ? await read($, diffGit) : {},
    // O custo e os tokens da conversa e dos agentes, somados.
    ...(aba === 3 ? { totais: await lerTotalGeral($) } : {}),
    fichas: {},
  }

  if (foco !== undefined && isAgente) {
    const ficha = await read($, { ...fichasDeAgentes, id: foco.id })
    // O pedido e a resposta dos agentes que ele criou e dos que trocaram
    // recados com ele (os cartões embaixo do grafo dele), até 16.
    const descendentes = (id: string): string[] =>
      dados.agentes.filter(um => um.pai === id).flatMap(filho => [filho.id, ...descendentes(filho.id)])
    const ligados = new Set([
      ...descendentes(foco.id),
      ...dados.mensagens.flatMap(mensagem => (mensagem.de === foco.id ? [mensagem.para] : mensagem.para === foco.id ? [mensagem.de] : [])),
    ])
    const agentesDoTurno: Record<string, LensFichaDoAgente> = {}

    for (const id of [...ligados].filter(um => um !== foco.id).slice(0, 16)) {
      const dele = await read($, { ...fichasDeAgentes, id })

      if (dele !== undefined) {
        agentesDoTurno[id] = dele
      }
    }

    return { ...dados, fichas: { ...(ficha === undefined ? {} : { agente: ficha }), agentesDoTurno } }
  }

  if (foco?.tipo === 'comando') {
    const lugar = lista.find(comando => comando.id === foco.id)?.ficha
    const ficha =
      lugar === undefined ? undefined : await read($, { ...fichasDeComandos, id: lugar })

    return ficha === undefined || ficha.id !== foco.id
      ? dados
      : { ...dados, fichas: { comando: ficha } }
  }

  if (foco?.tipo === 'turno') {
    // O grupo do pedido: o turno da pessoa e os retornos dos agentes (até 12).
    const membros = dados.rodadas
      .filter(rodada => String(rodada.ordem ?? rodada.n) === foco.id)
      .slice(0, 12)
    const fichas: LensFichaDoTurno[] = []

    for (const rodada of membros) {
      const ficha = await read($, { ...fichasDeTurnos, id: fichaDoTurno(rodada.n) })

      if (ficha !== undefined && ficha.n === rodada.n) {
        fichas.push(ficha)
      }
    }

    // O pedido e a resposta de cada agente criado no turno (até 12).
    const grupo = gruposDeTurnos(dados.rodadas).find(um => String(um.ordem) === foco.id)
    const agentesDoTurno: Record<string, LensFichaDoAgente> = {}

    for (const agente of grupo === undefined ? [] : doTurnoInteiro(dados, grupo).slice(0, 16)) {
      const ficha = await read($, { ...fichasDeAgentes, id: agente.id })

      if (ficha !== undefined) {
        agentesDoTurno[agente.id] = ficha
      }
    }

    return { ...dados, fichas: { turnos: fichas, agentesDoTurno } }
  }

  // A Visão geral mostra o pedido e a resposta inteiros do último turno.
  if (isVisao && foco === undefined) {
    const ultimo = gruposDeTurnos(dados.rodadas).reduce<ReturnType<typeof gruposDeTurnos>[number] | undefined>(
      (maior, grupo) => (maior === undefined || grupo.ordem > maior.ordem ? grupo : maior),
      undefined,
    )
    const n = ultimo?.cabeca?.n
    const ficha = n === undefined ? undefined : await read($, { ...fichasDeTurnos, id: fichaDoTurno(n) })
    // E o pedido e a resposta de cada agente que ele chamou (até 12).
    const agentesDoTurno: Record<string, LensFichaDoAgente> = {}

    for (const agente of ultimo === undefined ? [] : doTurnoInteiro(dados, ultimo).slice(0, 16)) {
      const fichaDoAgente = await read($, { ...fichasDeAgentes, id: agente.id })

      if (fichaDoAgente !== undefined) {
        agentesDoTurno[agente.id] = fichaDoAgente
      }
    }

    return {
      ...dados,
      fichas: { ...(ficha === undefined || ficha.n !== n ? {} : { turnos: [ficha] }), agentesDoTurno },
    }
  }

  // A lista de turnos (e a linha do tempo da aba Agentes) mostra cada rodada
  // de um agente que trabalhou mais de uma vez, com os números dela: as fichas
  // só desses agentes (até 16).
  if ((aba === 1 || aba === 4) && foco === undefined) {
    const agentesDoTurno: Record<string, LensFichaDoAgente> = {}

    for (const agente of dados.agentes.filter(um => (um.retomadas ?? 0) > 0).slice(-16)) {
      const dele = await read($, { ...fichasDeAgentes, id: agente.id })

      if (dele !== undefined) {
        agentesDoTurno[agente.id] = dele
      }
    }

    return Object.keys(agentesDoTurno).length === 0 ? dados : { ...dados, fichas: { agentesDoTurno } }
  }

  return dados
}

// Os agentes de um turno: os que foram chamados nele (as fichas deles são
// lidas para os cartões).
const doTurnoInteiro = (dados: Dados, grupo: ReturnType<typeof gruposDeTurnos>[number]): LensAgente[] =>
  agentesDoGrupo(dados.agentes, grupo)

const esquecerSessao = () => {
  instantaneo = undefined
  telaAnterior = undefined
  pastaDaSessao = undefined
  ultimaBuscaDaPasta = 0
  execucaoDoAgente.clear()
  execucoesLidas.clear()
  workflowsLancados.clear()
  modelosLidos.clear()
  pedidosDoWorkflow.clear()
}

// Refaz o instantâneo do painel e o redesenha (a versão sobe). Depois de um
// clique, na hora; o resto passa pelo vigiarPainel.
// A tela que o painel mostrou por último (a aba e o detalhe aberto): quando
// muda, a rolagem volta ao topo.
let telaAnterior: string | undefined

const refrescarPainel = async ($: EngineInterface) => {
  geracao += 1
  const minha = geracao
  const dados = await lerDados($)

  // Outro retrato começou enquanto este lia: vale o mais novo.
  if (minha !== geracao) {
    return
  }

  const agora = await $.clock.now()
  instantaneo = { dados, agora }
  ultimoRefresco = agora
  await update($, versao, n => (n + 1) % 1_000_000)

  // Trocou de tela (outra aba, ou um detalhe aberto ou fechado): o painel
  // volta ao topo. Sem isso, o detalhe de um agente aberto lá de baixo da
  // Visão geral abria já rolado, no meio.
  const tela = `${dados.ui.aba}|${dados.ui.foco?.tipo ?? ''}:${dados.ui.foco?.id ?? ''}:${dados.ui.foco?.rodada ?? ''}`

  if (telaAnterior !== undefined && tela !== telaAnterior && isPainelAberto) {
    await anotar($, 'rolagem ao topo', () => $.ui.scroll({ in: PAINEL, to: 'start' }))
  }

  telaAnterior = tela
}

// A cada segundo, com o painel aberto: os dados mudaram, ou o tempo que ele
// mostra andou? Então um desenho novo, mas nunca logo depois de um clique nem
// menos de INTERVALO_DE_FUNDO_MS depois do anterior.
const vigiarPainel = async ($: EngineInterface) => {
  if (!isPainelAberto) {
    return
  }

  const agora = await $.clock.now()

  if (agora - ultimoClique < PAUSA_DEPOIS_DO_CLIQUE_MS || agora - ultimoRefresco < INTERVALO_DE_FUNDO_MS) {
    return
  }

  const minha = geracao
  const dados = await lerDados($)

  // Um clique refez o retrato enquanto o vigia lia: o do clique é mais novo
  // (gravar este traria de volta o estado de antes do clique).
  if (minha !== geracao) {
    return
  }

  const isMudou = instantaneo === undefined || !isIgual(dados, instantaneo.dados)
  const relogio = temRelogio(dados, agora)
  // Em segundos, a cada INTERVALO_DE_FUNDO_MS; em minutos, na virada de cada um.
  const isRelogioVenceu =
    relogio !== undefined && (relogio.tipo === 'curto' || virouMinuto(relogio, ultimoRefresco, agora))

  if (isMudou || isRelogioVenceu) {
    instantaneo = { dados, agora }
    ultimoRefresco = agora
    await update($, versao, n => (n + 1) % 1_000_000)
  }
}

// Uma ação do painel (um clique): o trabalho dela e, logo depois, o desenho
// novo, um só.
const agir = ($: EngineInterface, onde: string, trabalho: () => Promise<unknown>) =>
  void anotar($, onde, async () => {
    try {
      await trabalho()
    } finally {
      await refrescarPainel($)
    }
  })

// Depois de um evento que muda os dados: o vigia olha na hora (ele mesmo
// respeita o intervalo entre desenhos e a pausa depois de um clique).
const cutucarPainel = ($: EngineInterface) => void anotar($, 'vigia do painel', () => vigiarPainel($))

// A pasta da sessão: <projetos>/<o projeto>/<id da sessão>. O nome da pasta
// do projeto é o caminho com tudo o que não é letra nem número trocado por
// "-"; se não for, procura em todas. Só existe depois do primeiro subagente.
const acharPastaDaSessao = async ($: EngineInterface): Promise<string | undefined> => {
  if (pastaDaSessao !== undefined) {
    return pastaDaSessao
  }

  const agora = await $.clock.now()

  // Não achada: tenta de novo no máximo a cada 10 s.
  if (agora - ultimaBuscaDaPasta < 10_000) {
    return undefined
  }

  ultimaBuscaDaPasta = agora
  const id = await $.session.id()
  const casa = (await $.env.get('HOME')) ?? ''
  const projetos = `${(await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${casa}/.claude`}/projects`
  // A pasta existe se a de cima a lista (listar uma que não existe pode
  // falhar ou voltar vazio).
  const existe = async (caminho: string) => {
    const corte = caminho.lastIndexOf('/')
    const nome = caminho.slice(corte + 1)
    const lidas = await $.fs.list(caminho.slice(0, corte)).catch(() => [])

    return lidas.some(entrada => entrada.name === nome && entrada.kind === 'dir')
  }
  const provavel = `${projetos}/${raiz.replace(/[^A-Za-z0-9]/g, '-')}/${id}`

  if (await existe(provavel)) {
    pastaDaSessao = provavel

    return provavel
  }

  for (const projeto of await $.fs.list(projetos).catch(() => [])) {
    const candidata = `${projetos}/${projeto.name}/${id}`

    if (projeto.kind === 'dir' && (await existe(candidata))) {
      pastaDaSessao = candidata

      return candidata
    }
  }

  return undefined
}

// Um resumo de uma linha do que o agente de workflow devolveu, para o cartão.
const resumoDoResultado = (resultado: unknown): string | undefined => {
  const texto = resultadoEmTexto(resultado)

  if (texto === undefined) {
    return undefined
  }

  const linha = umaLinha(texto.replace(/```json[\s\S]*$/, '').trim() || texto)

  return linha === '' ? undefined : curto(linha, 200)
}

// Lê os journals das execuções de workflow da sessão e acerta os agentes delas:
// o nome que o script deu, a fase, o modelo e, dos que terminaram, a resposta.
const acertarWorkflows = async ($: EngineInterface) => {
  const sessao = await acharPastaDaSessao($)

  if (sessao === undefined && workflowsLancados.size === 0) {
    return
  }

  const base = `${sessao ?? ''}/subagents/workflows`
  const listadas =
    sessao === undefined ? [] : (await $.fs.list(base).catch(() => [])).filter(entrada => entrada.kind === 'dir')
  // As execuções da pasta da sessão e as que a ferramenta Workflow disse
  // onde ficam (uma sessão que mudou de pasta guarda noutra).
  const pastas = new Map<string, string>(listadas.slice(-20).map(entrada => [entrada.name, `${base}/${entrada.name}`]))

  for (const [run, lancado] of workflowsLancados) {
    pastas.set(run, lancado.pasta)
  }

  const achados: AchadoDoWorkflow[] = []
  const resultados = new Map<string, unknown>()

  for (const [nomeDaExecucao, pastaDaExecucao] of pastas) {
    const execucao = { name: nomeDaExecucao }
    const journal = await $.fs.read(`${pastaDaExecucao}/journal.jsonl`).catch(() => undefined)

    if (journal === undefined) {
      continue
    }

    // O arquivo da execução só existe quando ela termina: lido até aparecer,
    // e guardado depois (não muda mais).
    if (!execucoesLidas.has(execucao.name)) {
      // <sessão>/workflows/<run>.json, ao lado da pasta subagents da execução.
      const sessaoDaExecucao = pastaDaExecucao.replace(/\/subagents\/workflows\/[^/]+$/, '')
      const salvo = await $.fs.read(`${sessaoDaExecucao}/workflows/${execucao.name}.json`).catch(() => undefined)
      const lida = salvo === undefined ? undefined : lerExecucao(salvo)

      if (lida !== undefined) {
        execucoesLidas.set(execucao.name, lida)
      }
    }

    const fim = execucoesLidas.get(execucao.name)
    // O nome: o do arquivo da execução (no fim), o que a ferramenta Workflow
    // devolveu ao lançar, ou o id da execução.
    const nome = fim?.nome ?? workflowsLancados.get(execucao.name)?.nome ?? execucao.name

    for (const agente of lerJournal(journal, nome)) {
      execucaoDoAgente.set(agente.id, pastaDaExecucao)

      // O meta.json pode ainda não ter sido gravado: só a leitura que achou o
      // modelo fica guardada.
      if (modelosLidos.get(agente.id) === undefined) {
        const meta = await $.fs.read(`${pastaDaExecucao}/agent-${agente.id}.meta.json`).catch(() => '')
        const lido = modeloDoMeta(meta)

        if (lido !== undefined) {
          modelosLidos.set(agente.id, lido)
        }
      }

      const modelo = modelosLidos.get(agente.id)
      const daExecucao = fim?.agentes.get(agente.id)

      if (daExecucao?.pedido !== undefined) {
        pedidosDoWorkflow.set(agente.id, daExecucao.pedido)
      }

      // Terminado pelo journal (o resultado) ou pela execução que acabou
      // (cancelada, os que não terminaram ficam como falha).
      const isTerminado = agente.resultado !== undefined || fim !== undefined
      const isFalha =
        agente.resultado === undefined &&
        (daExecucao?.estado === undefined ? fim !== undefined : daExecucao.estado !== 'done')
      achados.push({
        id: agente.id,
        rotulo: agente.rotulo,
        workflow: agente.workflow,
        execucao: execucao.name,
        isTerminado,
        ...(isTerminado && isFalha ? { isFalha: true } : {}),
        ...(daExecucao?.duracaoMs === undefined ? {} : { duracaoMs: daExecucao.duracaoMs }),
        ...(agente.fase === undefined ? {} : { fase: agente.fase }),
        ...(modelo === undefined ? {} : { modelo }),
      })

      if (agente.resultado !== undefined) {
        resultados.set(agente.id, agente.resultado)
      }
    }
  }

  if (achados.length === 0) {
    return
  }

  const agora = await $.clock.now()
  const atual = await read($, agentes)
  let proxima = comAgentesDoWorkflow(atual, achados, agora)

  // O resumo do resultado no cartão de quem terminou sem texto de resposta.
  proxima = proxima.map(agente => {
    const resumo = agente.resultado === undefined ? resumoDoResultado(resultados.get(agente.id)) : undefined

    return resumo === undefined ? agente : { ...agente, resultado: resumo }
  })

  if (!isIgual(atual, proxima)) {
    await update($, agentes, () => proxima)
  }

  // A resposta no detalhe de quem terminou (a saída estruturada não vira texto).
  for (const [id, resultado] of resultados) {
    const texto = resultadoEmTexto(resultado)

    if (texto === undefined || !proxima.some(agente => agente.id === id)) {
      continue
    }

    const ficha = await read($, { ...fichasDeAgentes, id })

    if (ficha?.resposta === undefined || ficha.resposta === '') {
      await update($, { ...fichasDeAgentes, id }, atualFicha => naFicha(atualFicha, { resposta: cabeca(texto, 6000) }))
    }
  }
}

// Os journals são lidos pouco depois de um agente de workflow aparecer ou
// chamar uma ferramenta, no máximo a cada 3 s.
const agendarWorkflows = ($: EngineInterface) => {
  if (workflowsAgendado !== undefined) {
    return
  }

  workflowsAgendado = $.clock.after(2500, () => {
    workflowsAgendado = undefined
    void anotar($, 'workflows', () => acertarWorkflows($))
  })
}

// A conversa principal lançou um workflow: o resultado da ferramenta diz o
// nome dele, o id da execução e a pasta onde os agentes dela gravam.
const anotarWorkflow = async ($: EngineInterface, e: Chamada, saida: ToolCallResult) => {
  const ferramenta: string = e.tool

  if (ferramenta !== 'Workflow' || saida.deny !== undefined) {
    return
  }

  const resultado = campos(saida.result)
  const run = comoTexto(resultado.runId)
  const pasta = comoTexto(resultado.transcriptDir)

  if (run === '' || pasta === '') {
    return
  }

  workflowsLancados.set(run, { nome: comoTexto(resultado.workflowName) || run, pasta })
  agendarWorkflows($)
}

// O pedido e as mensagens de um agente de workflow, da transcrição dele no
// disco (a sessão não a devolve pelo $.session.messages).
const lerTranscricaoDoWorkflow = async ($: EngineInterface, agentId: string): Promise<boolean> => {
  if (!execucaoDoAgente.has(agentId)) {
    await acertarWorkflows($)
  }

  const execucao = execucaoDoAgente.get(agentId)

  if (execucao === undefined) {
    return false
  }

  const conteudo = await $.fs.read(`${execucao}/agent-${agentId}.jsonl`).catch(() => undefined)

  // Grande demais para ler (o $.fs.read para em 4 MiB): o começo do pedido,
  // que o arquivo da execução guarda, e um aviso no lugar das mensagens.
  if (conteudo === undefined) {
    const previa = pedidosDoWorkflow.get(agentId)
    await update($, { ...fichasDeAgentes, id: agentId }, ficha =>
      naFicha(ficha, {
        ...((ficha?.pedido ?? '') !== '' ? {} : { pedido: previa === undefined ? TRANSCRICAO_GRANDE : cabeca(limpo(previa), 4000) }),
        mensagens: [TRANSCRICAO_GRANDE],
      }),
    )

    return false
  }

  const pedido = pedidoDaTranscricao(conteudo)
  const ultimo = ultimoTextoDaTranscricao(conteudo)
  await update($, { ...fichasDeAgentes, id: agentId }, ficha =>
    naFicha(ficha, {
      ...(pedido === undefined || (ficha?.pedido ?? '') !== '' ? {} : { pedido: cabeca(limpo(pedido), 4000) }),
      ...(ultimo === undefined ? {} : { mensagens: [cabeca(limpo(ultimo).trim(), 1500)] }),
    }),
  )

  return true
}

// Uma linha no registro de diagnóstico, gravado inteiro em
// ~/.claude/csr-lens-diagnostico.log a cada evento (as últimas 400).
// Acima disto (o tempo do próprio cálculo, sem as chamadas a `$`), o desenho
// do painel vai para o arquivo de erros.
const DESENHO_LENTO_MS = 250

// Os erros ao desenhar o painel, com o horário, num arquivo (os últimos 50).
let erros: string[] = []

const registrarErro = async ($: EngineInterface, texto: string) => {
  const agora = new Date(await $.clock.now()).toISOString()
  erros = [...erros, `${agora} ${texto}`].slice(-50)
  const casa = (await $.env.get('HOME')) ?? ''
  await $.fs.write(`${casa}/.claude/csr-lens-erros.log`, `${erros.join('\n\n')}\n`)
}

const registrar = async ($: EngineInterface, linha: string) => {
  if (diagnostico === undefined) {
    return
  }

  const agora = new Date(await $.clock.now()).toISOString().slice(11, 23)
  diagnostico = [...diagnostico, `${agora} ${linha}`].slice(-400)
  const casa = (await $.env.get('HOME')) ?? ''
  await $.fs.write(`${casa}/.claude/csr-lens-diagnostico.log`, `${diagnostico.join('\n')}\n`)
}

// Abre o painel (numa aba, se pedida). Sem lugar ao lado, a versão compacta
// sobe para a faixa acima do prompt.
const abrirPainel = async ($: EngineInterface, aba: LensAba | undefined) => {
  const isAberto = (await $.ui.panes()).some(painel => painel.id === PAINEL)

  if (aba !== undefined) {
    await update($, ui, atual => {
      const { foco: _foco, ...resto } = atual

      return { ...resto, aba }
    })

    if (aba === 6) {
      await anotar($, 'inventário', () => atualizarInventario($))
    }
  }

  // Sem aba pedida, o comando alterna: fecha o que está aberto.
  if (isAberto) {
    if (aba === undefined) {
      isPainelAberto = false
      await $.ui.close({ id: PAINEL })
    } else {
      await refrescarPainel($)
    }

    return {}
  }

  if ((await read($, ui)).isFaixa) {
    if (aba === undefined) {
      await ligarFaixa($, false)
    }

    return {}
  }

  // Aberto sem aba pedida, o painel começa sempre na Visão geral (e sem
  // nenhum detalhe aberto da vez anterior).
  if (aba === undefined) {
    await update($, ui, atual => {
      const { foco: _foco, ...resto } = atual

      return { ...resto, aba: 0 }
    })
  }

  // O primeiro desenho já sai do instantâneo.
  await refrescarPainel($)
  const aberto = await $.ui.open({ id: PAINEL, title: TITULO, focus: true, closeOnEscape: true })

  // Sem texto de saída: o painel aberto já é a resposta, e o texto de um
  // comando entra na conversa que o modelo lê.
  if (aberto.isPlaced) {
    isPainelAberto = true

    return {}
  }

  // Sem lugar para o painel: ele sai e a versão compacta sobe para a faixa.
  await $.ui.close({ id: PAINEL })
  await ligarFaixa($, true)

  return {
    text: `Lens: sem lugar para o painel (${aberto.reason}). Versão compacta acima do prompt; /lens fecha.`,
  }
}

export const register: Register = (on, options) => {
  // A cotação do dólar, das opções do plugin (o menu de configuração).
  const lida = (options as Readonly<Record<string, unknown>> | undefined)?.cotacaoDoDolar
  cotacao = typeof lida === 'number' && Number.isFinite(lida) && lida >= 0 ? lida : COTACAO_PADRAO

  on('session.start', async ($, e, next) => {
    const iniciada = next(e)
    iniciada.catch(() => undefined)
    raiz = e.cwd
    // Uma sessão nova (ou o mod recarregado) começa sem instantâneo nem pasta achada.
    esquecerSessao()

    await anotar($, 'comando /lens', () =>
      $.command.register({
        name: 'lens',
        description: 'Abre ou fecha o painel Lens; com o nome de uma aba, abre nela',
        argumentHint: '[agentes|diffs|contexto|turnos|arvore|inventario]',
        immediate: true,
      }),
    )
    await anotar($, 'comando /inventario', () =>
      $.command.register({
        name: 'inventario',
        description: 'Abre o Lens no inventário: plugins, skills, comandos, hooks e MCP, e o que está ativo',
        immediate: true,
      }),
    )
    await anotar($, 'grafo guardado', () => lembrarGrafo($))
    // Antes de tudo que lê o motor: o que for lido de novo fica por cima.
    await anotar($, 'retrato da sessão', () => recuperarSessao($))
    await anotar($, 'agentes da sessão', () => acertarAgentes($))
    await anotar($, 'medição inicial', () => medir($))
    await anotar($, 'custo inicial', () => partirDoCusto($))
    await anotar($, 'estimativa inicial', () => detalharContexto($, 'summary'))
    await anotar($, 'git inicial', () => atualizarGit($))
    await anotar($, 'modelo inicial', async () => {
      const modelo = await $.session.model()
      if ((await read($, sessao)).modelo === undefined) {
        await update($, sessao, atual => ({ ...atual, modelo }))
      }
    })
    // A hora em que a sessão começou: o título da linha do tempo a mostra.
    await anotar($, 'início da sessão', async () => {
      const { startedAt } = await $.session.usage()
      if (startedAt > 0 && (await read($, sessao)).inicio !== startedAt) {
        await update($, sessao, atual => ({ ...atual, inicio: startedAt }))
      }
    })
    // O inventário espera a sessão terminar de carregar (comandos, MCP).
    agendarInventario($, 3000)

    // Com o painel já aberto (o mod recarregou), o primeiro desenho já acha
    // um retrato: sem ele, o desenho leria o estado direto.
    if ((await $.ui.panes().catch(() => [])).some(painel => painel.id === PAINEL)) {
      await anotar($, 'retrato inicial', () => refrescarPainel($))
    }

    // Um tique por segundo, só enquanto a aba em vista mostra tempo decorrido.
    // É um valor do estado que só o painel lê: $.ui.invalidate redesenharia
    // tudo, a linha de pílulas junto, e a dica de uma pílula (que espera o
    // mouse parado por um segundo) nunca chegaria a aparecer.
    $.clock.every(1000, async () => {
      // Logo depois de um clique, nada é redesenhado pelo relógio.
      if ((await $.clock.now()) - ultimoClique < PAUSA_DEPOIS_DO_CLIQUE_MS) {
        return
      }

      if (isRelogioLigado) {
        void update($, relogio, tique => (tique + 1) % 1_000_000)
      }

      void anotar($, 'resumos', () => atualizarResumos($))
      void anotar($, 'vigia do painel', () => vigiarPainel($))
      // O app pode fechar no meio de um turno: um retrato de tempos em tempos.
      void anotar($, 'retrato da sessão', () => guardarSessao($))
    })

    return iniciada
  })

  // Um /clear encerra a sessão e segue com outro id, sem session.start: a
  // pasta da sessão (dos workflows) e o retrato são esquecidos.
  on('session.end', async ($, e, next) => {
    await anotar($, 'retrato da sessão', () => guardarSessao($, true))
    esquecerSessao()

    return next(e)
  })

  on('command.run', { command: 'lens' }, async ($, e) => {
    const pedida = e.args.trim()

    if (pedida === 'diagnostico' || pedida === 'diagnóstico') {
      if (diagnostico === undefined) {
        diagnostico = []
        await registrar($, 'diagnóstico ligado')

        return {
          text: 'Diagnóstico ligado: clique nos botões do painel como de costume (inclusive quando precisar clicar duas vezes) e rode /lens diagnostico de novo para desligar. Registro em ~/.claude/csr-lens-diagnostico.log.',
        }
      }

      await registrar($, 'diagnóstico desligado')
      diagnostico = undefined

      return { text: 'Diagnóstico desligado. O registro está em ~/.claude/csr-lens-diagnostico.log.' }
    }

    const aba = pedida === '' ? undefined : abaPeloNome(pedida)

    if (pedida !== '' && aba === undefined) {
      return { text: `Lens: não conheço a aba "${pedida}". Abas: ${Object.keys(ABAS_POR_NOME).join(', ')}.` }
    }

    return abrirPainel($, aba)
  })

  on('command.run', { command: 'inventario' }, $ => abrirPainel($, 6))

  // Depois de /plugin, /mcp, /hooks... o inventário é lido de novo.
  on('command.run', async ($, e, next) => {
    const feito = await next(e)

    if (MEXEM_NO_INVENTARIO.has(e.command)) {
      agendarInventario($)
    }

    return feito
  })

  // O diagnóstico de cliques: cada clique num botão do Lens, cada mudança
  // do foco e cada desenho do painel. Desligado, só repassa.
  on('ui.press', async ($, e, next) => {
    if (e.plugin === PAINEL) {
      ultimoClique = await $.clock.now()
    }

    if (diagnostico !== undefined && e.plugin === PAINEL) {
      await anotar($, 'diagnóstico', () => registrar($, `clique ${e.component} ${e.element} (${e.surface})`))
    }

    return next(e)
  })

  on('ui.focus', async ($, e, next) => {
    if (diagnostico !== undefined && e.requestId === PAINEL) {
      await anotar($, 'diagnóstico', () =>
        registrar($, `foco ${e.component} → ${e.element ?? '(nenhum)'} (${e.origin.kind ?? ''})`),
      )
    }

    return next(e)
  })

  on('ui.close', { id: PAINEL }, ($, e, next) => {
    isRelogioLigado = false
    isPainelAberto = false

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    // Um agente que a pessoa mandou parar não chama mais nada (o motivo diz a
    // ele para terminar já), menos a SubagentHandback: é por ela que ele
    // entrega o que fez e termina (negada, ele tentava de novo sem parar).
    if (e.agentId !== undefined && e.tool !== 'SubagentHandback') {
      const agentId = e.agentId

      if ((await read($, agentes)).some(agente => agente.id === agentId && agente.isParando === true)) {
        return { deny: PEDIDO_DE_PARAR }
      }
    }

    // O relógio do motor, o mesmo do início do comando e dos turnos.
    const partida = await $.clock.now()
    // Antes de um Write (de qualquer um), o conteúdo antigo: o diff da Sessão é o real.
    const antes = e.tool === 'Write' ? await lerAntes($, comoTexto(campos(e).file_path)) : undefined
    // Antes de um Bash da conversa principal, a foto dos arquivos: depois dele,
    // o que mudou entra na Sessão como edição dele.
    const fotoAntes =
      e.tool === 'Bash' && e.agentId === undefined ? await fotografar($).catch(() => undefined) : undefined
    const correndo = next(e)
    correndo.catch(() => undefined)
    await anotar($, 'tool.call (início)', () => aoIniciar($, e))

    try {
      const saida = await correndo
      const duracaoMs = Math.round((await $.clock.now()) - partida)
      await anotar($, 'tool.call (fim)', () => aoTerminar($, e, saida, duracaoMs, antes))
      await anotar($, 'tool.call (workflow)', async () => anotarWorkflow($, e, saida))

      // O que o Bash mudou, sem atrasar a resposta: a foto de depois corre à parte.
      if (fotoAntes !== undefined) {
        const n = Math.max(1, await read($, pedidos))
        void anotar($, 'tool.call (o que o Bash mudou)', () => registrarBash($, e, fotoAntes, n))
      }

      await anotar($, 'tool.call (turno)', async () => {
        const n = await read($, turno)
        const isFalha = saida.deny !== undefined || saida.isError === true
        await update($, rodadas, lista => comChamadaNaRodada(lista, n, e.tool, isFalha))

        // O que falhou fica na ficha do turno: o detalhe dele diz qual e por quê.
        if (isFalha) {
          const falha = {
            ferramenta: e.tool,
            argumento: resumoDaChamada(campos(e), raiz),
            quem: await autor($, e.agentId),
            erro: curto(umaLinha(saidaDaChamada(saida)), 400) || 'sem mensagem de erro',
          }
          await update($, { ...fichasDeTurnos, id: fichaDoTurno(n) }, ficha => comFalhaNoTurno(ficha, n, falha))
        }
      })
      cutucarPainel($)

      return saida
    } catch (erro) {
      // A chamada foi abandonada (interrupção): o comando não fica "rodando".
      if (e.tool === 'Bash') {
        const duracaoMs = Math.round((await $.clock.now()) - partida)
        await anotar($, 'tool.call (abandono)', () =>
          update($, comandos, lista =>
            comFimDoComando(lista, e.tool_use_id, {
              estado: 'falhou',
              duracaoMs,
              nota: 'interrompido',
            }),
          ),
        )
      }

      // Nem o passo fica "rodando" no detalhe do agente.
      if (e.agentId !== undefined) {
        const agentId = e.agentId
        const duracaoMs = Math.round((await $.clock.now()) - partida)
        await anotar($, 'tool.call (abandono do passo)', () =>
          update($, { ...fichasDeAgentes, id: agentId }, ficha => comFimDoPasso(ficha, e.tool_use_id, false, duracaoMs)),
        )
      }

      // Nem o arquivo fica aceso na árvore como se ainda estivesse sendo lido ou escrito.
      const arquivos = arquivosDaChamada(e)

      if (arquivos.length > 0) {
        await anotar($, 'tool.call (abandono do toque)', async () => {
          const agora = await $.clock.now()
          await update($, toques, lista =>
            arquivos.reduce((atual, arquivo) => comFimDoToque(atual, { caminho: arquivo.caminho, isOk: false, agora }), lista),
          )
        })
      }

      throw erro
    }
  })

  on('agent.spawn', async ($, e, next) => {
    const iniciado = await next(e)

    await anotar($, 'agent.spawn', async () => {
      const id = iniciado.agentId

      if (iniciado.deny !== undefined || id === undefined) {
        return
      }

      const agora = await $.clock.now()
      const novo = {
        id,
        tipo: e.subagentType,
        descricao: e.description,
        modelo: iniciado.model,
        pai: e.parentAgentId,
        nome: e.name,
        plugin: e.provider.plugin === 'engine' ? undefined : e.provider.plugin,
        isFundo: e.background,
        ordem: Math.max(1, await read($, pedidos)),
        tarefa: curto(umaLinha(limpo(e.prompt)), 160),
      }
      const pedido = cabeca(limpo(e.prompt), 4000)
      await update($, agentes, lista => comAgente(lista, novo, agora))
      await atualizarResumos($)
      await update($, { ...fichasDeAgentes, id }, ficha => naFicha(ficha, { pedido }))
    })
    cutucarPainel($)

    return iniciado
  })

  // As mensagens entre a conversa principal e os agentes (e entre agentes),
  // para o grafo da aba Agentes. Só observa: a mensagem segue como veio.
  on('session.send', async ($, e, next) => {
    const enviada = await next(e)

    // Também as que não chegaram (um nome que ninguém carrega, por exemplo):
    // o grafo as mostra em vermelho, com o motivo.
    await anotar($, 'session.send', async () => {
      const agora = await $.clock.now()
      const lista = await read($, agentes)
      const extra = { texto: limpo(e.text), ...(enviada.isDelivered === false ? { falha: enviada.reason } : {}) }
      await update($, mensagens, atual => comMensagem(atual, lista, e.agentId ?? 'principal', e.to, agora, extra))

      // O recado inteiro fica com quem o recebeu: se ele já tinha terminado, é
      // o que acorda a rodada seguinte (a lista guarda só o começo). O pedido
      // de parar do próprio Lens não é um recado de ninguém.
      const alvo = lista.find(agente => agente.id === e.to || agente.nome === e.to)

      if (alvo !== undefined && enviada.isDelivered !== false && e.text !== PEDIDO_DE_PARAR) {
        const recado = { de: e.agentId ?? 'principal', quando: agora, texto: cabeca(limpo(e.text), 4000) }
        await update($, { ...fichasDeAgentes, id: alvo.id }, ficha => naFicha(ficha, { ultimoRecado: recado }))
      }
    })

    return enviada
  })

  on('turn.start', async ($, e, next) => {
    const iniciado = next(e)
    iniciado.catch(() => undefined)

    await anotar($, 'turn.start', async () => {
      const n = await update($, turno, atual => atual + 1)
      const agora = await $.clock.now()
      // O retorno de um agente em segundo plano continua o pedido corrente; um
      // turno sem texto digitado (uma continuação) também.
      const retorno =
        retornoDe(e.text) ??
        (e.text.trim() === '' && (await read($, pedidos)) > 0 ? { agenteId: undefined, relato: undefined } : undefined)
      const ordem =
        retorno === undefined
          ? await update($, pedidos, atual => atual + 1)
          : Math.max(1, await read($, pedidos))
      const agenteId = retorno?.agenteId
      const relato = retorno?.relato
      const rodada: LensRodada = {
        n,
        ordem,
        pedido: retorno === undefined ? curto(umaLinha(semMarcas(e.text)), 80) : '',
        inicio: agora,
        ferramentas: 0,
        falhas: 0,
        ...(retorno === undefined ? {} : { isRetorno: true }),
        ...(agenteId === undefined ? {} : { agenteId }),
      }
      const inteiro = retorno === undefined ? cabeca(limpo(e.text), 6000) : ''
      await update($, rodadas, lista => comRodada(lista, rodada))
      await update($, { ...fichasDeTurnos, id: fichaDoTurno(n) }, () => ({ n, pedido: inteiro }))

      // O que o agente devolveu ao loop principal, quando ele não deixou resposta.
      if (agenteId !== undefined && relato !== undefined) {
        const entregue = cabeca(limpo(relato), 6000)
        await update($, { ...fichasDeAgentes, id: agenteId }, ficha => {
          const comResposta = ficha?.resposta === undefined ? naFicha(ficha, { resposta: entregue }) : ficha
          // E na última rodada, se ela fechou sem texto.
          const ultima = comResposta.rodadas?.at(-1)

          return ultima === undefined || ultima.fim === undefined || ultima.resposta !== undefined
            ? comResposta
            : { ...comResposta, rodadas: [...(comResposta.rodadas ?? []).slice(0, -1), { ...ultima, resposta: entregue }] }
        })
      }
      await anotar($, 'medição do início do turno', () => medir($))

      // O ponto de partida do "último turno" é o pedido da pessoa: o retorno de
      // um agente soma no mesmo turno.
      if (retorno === undefined) {
        await update($, contexto, comInicioDoTurno)
        const usdSubagentes = await usdDosSubagentes($, await read($, totais))
        await update($, totais, atual => comInicioNosTotais(atual, usdSubagentes))
      }
    })
    cutucarPainel($)

    return iniciado
  })

  // Cada resposta do modelo, do loop principal e dos subagentes: passa inteira,
  // e só depois dela vem a conta de quem gastou.
  on('turn.step', async function* ($, e, next) {
    // Um agente que já tinha terminado e responde de novo (um recado o
    // acordou): uma rodada nova dele, que começa agora.
    if (e.agentId !== undefined) {
      const agentId = e.agentId
      await anotar($, 'turn.step (retomada)', async () => {
        await acordar($, agentId, await $.clock.now())
      })
    }

    const resposta = yield* next(e)
    await anotar($, 'turn.step', () => somarGasto($, e.agentId, resposta.usage))

    // Da conversa principal: o modelo e o esforço pedidos e o cache servido.
    if (e.agentId === undefined) {
      await anotar($, 'turn.step (sessão)', async () => {
        const uso = resposta.usage
        const entrada =
          uso === null ? undefined : uso.input_tokens + uso.cache_read_input_tokens + uso.cache_creation_input_tokens

        await update($, sessao, atual => ({
          ...atual,
          modelo: e.model,
          ...(e.effort === undefined ? {} : { esforco: String(e.effort) }),
          ...(uso === null || entrada === undefined || entrada === 0
            ? {}
            : { cacheLido: uso.cache_read_input_tokens, entrada }),
        }))
        await atualizarResumos($)
      })
      // O session.measure só vem no fim do turno: num turno longo (muitas
      // ferramentas), o círculo e o total do contexto ficariam parados no
      // começo dele enquanto os tokens somam. Cada resposta da conversa
      // principal mede de novo (a chamada simples é de graça).
      await anotar($, 'medição da resposta', () => medir($))
      cutucarPainel($)
    }

    return resposta
  })

  on('turn.complete', async ($, e, next) => {
    const terminado = next(e)
    terminado.catch(() => undefined)

    await anotar($, 'turn.complete', async () => {
      const id = e.agentId

      if (id === undefined) {
        // Fim de um turno do loop principal: fecha o turno na aba Turnos e
        // acerta os agentes que morreram sem avisar.
        const n = await read($, turno)
        const resposta = cabeca(limpo(e.answer), 8000)
        await update($, rodadas, lista => comFimDaRodada(lista, n, e.durationMs, e.isAborted))
        // O começo da resposta no próprio turno: o cartão dele e a Visão geral a mostram.
        const comecoDaResposta = curto(umaLinha(limpo(e.answer)), 400)
        if (comecoDaResposta !== '') {
          await update($, rodadas, lista => lista.map(rodada => (rodada.n === n ? { ...rodada, resposta: comecoDaResposta } : rodada)))
        }
        await update($, { ...fichasDeTurnos, id: fichaDoTurno(n) }, ficha =>
          ficha === undefined || ficha.n !== n ? { n, pedido: '', resposta } : { ...ficha, resposta },
        )
        await acertarAgentes($)
        agendarGit($)

        // Os agentes de workflow não estão no $.agent.list(): o journal diz
        // quem terminou (e o resultado de quem não chamou mais nada).
        if ((await read($, agentes)).some(agente => agente.tipo === 'workflow' || agente.tipo === 'agente')) {
          agendarWorkflows($)
        }

        // Com o inventário em vista, ele acompanha os turnos (o modelo pode ter
        // instalado ou configurado algo).
        if ((await read($, ui)).aba === 6) {
          agendarInventario($)
        }
      } else {
        const agora = await $.clock.now()
        const uso = e.usage
        const tokens: LensTokens | undefined =
          uso === undefined
            ? undefined
            : {
                entrada: uso.input_tokens,
                saida: uso.output_tokens,
                cacheLido: uso.cache_read_input_tokens,
                cacheGravado: uso.cache_creation_input_tokens,
                modelo: uso.model,
              }
        const fim = {
          id,
          isOk: e.reason === 'answer',
          duracaoMs: e.durationMs,
          resposta: e.answer,
          motivo: e.reason,
          tokens:
            tokens === undefined
              ? undefined
              : tokens.entrada + tokens.saida + tokens.cacheLido + tokens.cacheGravado,
        }
        const resposta = cabeca(limpo(e.answer), 6000)
        // Um fim que chega com ele já terminado: respondeu ao recado sem chamar
        // ferramenta, numa rodada que ninguém viu começar (começa pela duração).
        const antes = (await read($, agentes)).find(agente => agente.id === id)
        const isRodadaNova = antes !== undefined && antes.estado !== 'rodando' && (await acordar($, id, agora - e.durationMs))
        // O agente como estava rodando, antes de o fim fechá-lo.
        const vivo = isRodadaNova ? (await read($, agentes)).find(agente => agente.id === id) : antes
        const lista = await update($, agentes, atual => comFimDoAgente(atual, fim, agora))
        const fechado = lista.find(agente => agente.id === id)
        // O começo desta rodada (numa retomada, o dela).
        const inicio =
          vivo === undefined || vivo.estado !== 'rodando'
            ? (fechado?.inicioDaRodada ?? fechado?.inicio ?? agora - e.durationMs)
            : inicioDaRodada(vivo)
        // A resposta da rodada: o texto final ou, quando ele vem vazio, o
        // relatório que chegou pela SubagentHandback durante ela.
        const fichaAntes = await read($, { ...fichasDeAgentes, id })
        const daHandback =
          fichaAntes?.respostaEm !== undefined && fichaAntes.respostaEm >= inicio - 1000 ? fichaAntes.resposta : undefined
        const daRodada = resposta !== '' ? resposta : (daHandback ?? '')
        const gastoDele = (await read($, gastos)).agentes[id]
        const gasto = gastoDele?.usd
        // Os tokens da ficha são do agente inteiro: numa retomada, a soma das
        // rodadas (o fim traz só os do turno dele, que é esta rodada).
        const isRetomada = (fechado?.retomadas ?? 0) > 0

        if (['workflow', 'agente'].includes(fechado?.tipo ?? '')) {
          agendarWorkflows($)
        }

        await atualizarResumos($)
        await update($, { ...fichasDeAgentes, id }, ficha =>
          // A rodada que fecha (as 10 últimas ficam): o mesmo agente acordado
          // por um recado tem uma rodada por resposta, com os tokens e o
          // contexto dela.
          comRodadaFechada(
            naFicha(ficha, {
              ...(resposta === '' ? {} : { resposta }),
              ...(tokens === undefined ? {} : { tokens: isRetomada ? somaDeTokens(ficha?.tokens, tokens) : tokens }),
            }),
            {
              inicio,
              fim: agora,
              isOk: fim.isOk,
              ...(antes?.isParando === true ? { isParada: true } : {}),
              ...(daRodada === '' ? {} : { resposta: cabeca(daRodada, 6000) }),
              ...(gasto === undefined ? {} : { custoAgora: gasto }),
              chamadasAgora: fechado?.chamadas ?? 0,
              ...(tokens === undefined ? {} : { tokens }),
              ...(gastoDele?.contexto === undefined ? {} : { contexto: gastoDele.contexto }),
            },
          ),
        )
      }

    })
    // O fim de um turno da conversa principal guarda o retrato na hora; o de um
    // subagente, no ritmo de sempre.
    await anotar($, 'retrato da sessão', () => guardarSessao($, e.agentId === undefined))
    cutucarPainel($)

    return terminado
  })

  on('session.measure', async ($, e, next) => {
    const medido = next(e)
    medido.catch(() => undefined)

    await anotar($, 'session.measure', async () => {
      const medida = await gravarMedida($, e.context, e.rateLimits, e.cost)
      const n = await read($, turno)
      // O que o turno em curso somou ao contexto e custou até aqui.
      const lista = await read($, rodadas)
      const nova = comMedidaNaRodada(lista, n, medida)

      if (!isIgual(lista, nova)) {
        await update($, rodadas, () => nova)
      }
    })
    // A cada medição, o detalhamento estimado acompanha (sem requisição).
    await anotar($, 'estimativa do detalhamento', () => detalharContexto($, 'summary'))
    cutucarPainel($)

    return medido
  })

  on('ui.render', { component: 'Pane', requestId: PAINEL }, async ($, e) => {
    if (diagnostico !== undefined) {
      await anotar($, 'diagnóstico', () => registrar($, `desenho do painel (foco: ${e.props.isFocused ? 'sim' : 'não'})`))
    }

    const tabela = $.ui.resolve(e)
    const el: Elementos = {
      Box: tabela.Box,
      Text: tabela.Text,
      Button: tabela.Button,
      Input: 'Input' in tabela ? tabela.Input : null,
      Markdown: tabela.Markdown,
      Code: tabela.Code,
      // O terminal também tem um Svg na tabela (desenha só o alt): para as
      // telas, desenho em SVG é coisa do app; no terminal, nenhum.
      Svg: 'Svg' in tabela && e.surface !== 'terminal' ? tabela.Svg : null,
    }
    // A versão é o único valor que o painel lê: ele é redesenhado quando o
    // instantâneo muda (veja refrescarPainel e vigiarPainel), e não a cada
    // valor gravado.
    await read($, versao)
    // Desenhado, o painel está aberto (o vigia passa a acompanhá-lo).
    isPainelAberto = true

    // Um erro ao desenhar não deixa o painel em branco: ele aparece no painel
    // e vai para ~/.claude/csr-lens-erros.log, para ser corrigido.
    try {
      const partida = performance.now()
      // Sem instantâneo (o mod acabou de recarregar), lê direto desta vez.
      const visto = instantaneo ?? { dados: await lerDados($), agora: await $.clock.now() }
      const dados = visto.dados
      const quadro: Quadro = {
        largura: e.props.bodyColumns,
        linhas: e.props.scroll.bodyRows,
        agora: visto.agora,
        cotacao,
        raiz,
        // Sentado acima do prompt, e não ao lado: a versão compacta.
        isCompacto: e.props.placement === 'inline',
        isTerminal: e.surface === 'terminal',
        isFaixa: false,
        fechadas: dados.ui.secoesFechadas ?? [],
      }
      const arvore = desenhar(el, dados, quadro, acoes($))
      const gasto = Math.round(performance.now() - partida)

      // Um desenho lento passa do orçamento do hook e o painel fica sem
      // desenho: fica registrado, com a aba, para ser corrigido.
      if (gasto > DESENHO_LENTO_MS) {
        await anotar($, 'registro do desenho lento', () =>
          registrarErro($, `desenho lento: aba ${dados.ui.aba}, ${gasto} ms (${e.surface}, ${quadro.largura} colunas)`),
        )
      }

      return arvore
    } catch (erro) {
      const texto = erro instanceof Error ? `${erro.message}\n${erro.stack ?? ''}` : String(erro)
      await anotar($, 'registro do erro', () => registrarErro($, texto))
      const { Box, Text, Button } = el

      return (
        <Box flexDirection="column" rowGap={1}>
          <Text bold color={COR.vermelho}>O Lens falhou ao desenhar esta aba.</Text>
          <Text dimColor wrap="wrap">{texto.split('\n').slice(0, 8).join('\n')}</Text>
          <Text dimColor wrap="wrap">O erro foi gravado em ~/.claude/csr-lens-erros.log.</Text>
          <Box flexDirection="row">
            <Button key="erro-voltar" label="Ir para Agentes" onPress={() => acoes($).aba(1)} />
          </Box>
        </Box>
      )
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const visao = { isFaixa: await read($, faixaLigada) }

    if (e.props.hasSurvey) {
      return next(e)
    }

    const tabela = $.ui.resolve(e)

    // Sem o painel compacto na faixa, vai a linha de resumo, quando há leitura.
    // No Desktop, as pílulas leem só a leitura resumida (gravada no máximo uma
    // vez por segundo, e só quando muda): cada desenho novo da faixa custa ao app.
    if (!visao.isFaixa && e.surface === 'desktop' && 'Svg' in tabela) {
      const leitura = await read($, faixa)
      const abaixo = await next(e)
      const temLeitura =
        leitura.rodando > 0 ||
        leitura.contexto.percentual !== undefined ||
        leitura.contexto.custo !== undefined ||
        leitura.contexto.limites.length > 0

      if (!temLeitura) {
        return abaixo
      }

      const pilulas = pilulasDoStatus({ ...leitura, isTrabalhando: e.props.isWorking }, await $.clock.now())

      return linhaDePilulas(tabela, desenharPilulas(pilulas, e.props.bodyColumns), abaixo, aba =>
        void anotar($, 'pílula', () => abrirPainel($, aba)),
      )
    }

    if (!visao.isFaixa) {
      const listaDeAgentes = await read($, agentes)
      const medida = await read($, contexto)
      const segmentos = segmentosDoStatus(listaDeAgentes, medida)
      const abaixo = await next(e)

      if (segmentos.length === 0) {
        return abaixo
      }

      return linhaDeResumo(tabela, segmentos, abaixo, e.props.bodyColumns)
    }

    const el: Elementos = {
      Box: tabela.Box,
      Text: tabela.Text,
      Button: tabela.Button,
      Input: 'Input' in tabela ? tabela.Input : null,
      Markdown: tabela.Markdown,
      Code: tabela.Code,
      // O terminal também tem um Svg na tabela (desenha só o alt): para as
      // telas, desenho em SVG é coisa do app; no terminal, nenhum.
      Svg: 'Svg' in tabela && e.surface !== 'terminal' ? tabela.Svg : null,
    }
    // Lido para o painel acompanhar o relógio (só ele lê o tique).
    await read($, relogio)
    const dados = await lerDados($)
    const quadro: Quadro = {
      largura: e.props.bodyColumns,
      agora: await $.clock.now(),
      raiz,
      isCompacto: true,
      isTerminal: e.surface === 'terminal',
      isFaixa: true,
    }
    isRelogioLigado = temRelogio(dados, quadro.agora) !== undefined

    return desenhar(el, dados, quadro, acoes($))
  })
}

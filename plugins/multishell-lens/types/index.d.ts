// Contrato do estado do mod: tudo o que o painel desenha fica em $.state,
// sob estas chaves, e sobrevive ao hot reload. Só dados JSON.

// 0: a Visão geral; as outras guardam o número de antes (a ordem na barra é outra).
export type LensAba = 0 | 1 | 2 | 3 | 4 | 5 | 6

export type LensUi = {
  aba: LensAba
  // A versão compacta acima do prompt, quando o painel não teve lugar.
  isFaixa: boolean
  // Sem uso desde que a aba Arquivos saiu; fica pelo estado já gravado.
  filtro: string
  // O turno em vista na aba Diffs (fonte "turno"); 0 acompanha o mais recente.
  turno: number
  // Sem uso desde a aba Diffs em árvore; fica pelo estado já gravado.
  passo: number
  isCalculando: boolean
  // O item aberto em detalhe (um agente, um comando ou um turno), se houver.
  foco?: LensFoco
  // Aba Árvore: as pastas abertas e fechadas à mão, e se mostra o projeto
  // inteiro ou só o que foi tocado e alterado.
  pastasAbertas?: string[]
  pastasFechadas?: string[]
  isArvoreToda?: boolean
  // Aba Inventário: a seção em vista e o filtro dela.
  secaoDoInventario?: LensSecaoDoInventario
  filtroDoInventario?: string
  // Quantos itens da seção do inventário aparecem (o "Mostrar mais" soma 30).
  itensDoInventario?: number
  // Os grupos do inventário fechados à mão ("seção:origem").
  gruposFechados?: string[]
  // As seções fechadas no ▾ ao lado do título (a chave de cada uma).
  secoesFechadas?: string[]
  // Aba Diffs: de onde vêm os arquivos (as edições da sessão, um turno ou o
  // git) e o arquivo escolhido na lista.
  fonteDoDiff?: 'sessao' | 'turno' | 'git'
  arquivoDoDiff?: string
  // Aba Agentes: o grafo de quem chamou quem ampliado.
  isGrafoGrande?: boolean
  // O zoom do grafo (1 = 100%).
  escalaDoGrafo?: number
  // O filtro do grafo: os outros agentes ficam apagados, no mesmo lugar.
  filtroDoGrafo?: 'todos' | 'rodando' | 'falhou'
}

// O item aberto em detalhe: um agente, uma rodada dele (`id` é o do agente e
// `rodada` o número dela), um comando ou um turno.
export type LensFoco = {
  tipo: 'agente' | 'comando' | 'turno' | 'rodada'
  id: string
  rodada?: number
  // De onde o detalhe foi aberto, encadeado (veja hooks/caminho.ts): o
  // "Voltar" leva de volta a ele, e o caminho no alto mostra cada nível.
  volta?: string
}

export type LensAgente = {
  id: string
  tipo: string
  descricao: string
  modelo?: string
  estado: 'rodando' | 'concluido' | 'falhou'
  inicio: number
  duracaoMs?: number
  ferramenta?: string
  argumento?: string
  chamadas: number
  resultado?: string
  // Total de tokens que o agente consumiu, quando o motor informa.
  tokens?: number
  // Preenchidos na leitura, a partir de `gastos`: o custo atribuído ao agente
  // e o tamanho do contexto dele na última resposta.
  custo?: number
  contexto?: number
  // Quem criou o agente (o id de outro agente; ausente: a conversa principal),
  // o nome pelo qual o SendMessage o chama e o plugin que o fornece.
  pai?: string
  nome?: string
  plugin?: string
  isFundo?: boolean
  // O começo da tarefa que o pai entregou ao criar o agente (a dica do fio).
  tarefa?: string
  // O pedido (o turno da aba Turnos) em que o agente foi criado.
  ordem?: number
  // Quantas vezes o agente chamou cada ferramenta (o gráfico do detalhe dele).
  porFerramenta?: Record<string, number>
  // Um agente de workflow: o rótulo que o script lhe deu (`pesquisa:site`), a
  // fase e o nome do workflow, lidos do journal da execução.
  rotulo?: string
  fase?: string
  workflow?: string
  // O id da execução (o mesmo workflow rodado duas vezes são duas execuções).
  execucao?: string
  // Quando terminou da última vez (o horário de fim nos cartões).
  fim?: number
  // O mesmo agente (o mesmo id) que voltou a trabalhar depois de terminar,
  // acordado por um recado: quantas vezes, e quando começou a rodada atual.
  // `duracaoMs` soma todas as rodadas.
  retomadas?: number
  inicioDaRodada?: number
  // Quando cada rodada depois da primeira começou (o turno em que a conversa
  // principal o acordou mostra ele também).
  inicios?: number[]
  // As rodadas fechadas antes da atual (a linha do tempo desenha um trecho
  // por rodada): quando cada uma começou e terminou, e se terminou bem.
  rodadasAntes?: LensTrechoDaRodada[]
  // Quem acordou cada rodada depois da primeira, pelo começo dela ('principal'
  // ou o id do agente que mandou o recado): um turno só mostra a rodada que a
  // conversa principal acordou nele, ou que um agente do próprio turno acordou.
  acordadoPor?: Record<string, string>
  // A pessoa pediu, pelo painel, para ele parar: as próximas ferramentas dele
  // são negadas até ele terminar; e, terminado assim, `isParado`.
  isParando?: boolean
  isParado?: boolean
}

export type LensTrechoDaRodada = {
  inicio: number
  fim: number
  isOk: boolean
  // O começo da resposta dela (o `resultado` do agente quando ela fechou).
  resumo?: string
}

// O que as pílulas do Desktop leem: quantos agentes rodam, o contexto, o
// git e a sessão.
export type LensFaixa = {
  rodando: number
  contexto: LensContexto
  git: LensGit
  sessao: LensSessao
}

// Uma mensagem entre a conversa principal e um agente, ou entre dois agentes
// (o SendMessage): 'principal' ou o id do agente; `para` pode ser um nome
// que nenhum agente desta sessão carrega. `texto`: o começo do recado; `falha`:
// por que não chegou (ausente: entregue).
export type LensMensagem = {
  de: string
  para: string
  quando: number
  texto?: string
  falha?: string
}

// O que um subagente custou e o tamanho do contexto próprio dele.
export type LensGasto = {
  usd: number
  contexto?: number
}

// `visto` é o custo da sessão na última leitura: o que ele sobe ao fim de cada
// resposta do modelo vai para quem fez a resposta.
export type LensGastos = {
  visto: number
  agentes: Record<string, LensGasto>
}

export type LensLinha = {
  // '+' entrou, '-' saiu, ' ' contexto, '@' cabeçalho do trecho.
  t: '+' | '-' | ' ' | '@'
  n?: number
  x: string
}

export type LensEdicao = {
  id: string
  // Bash: o que um comando mudou, lido do git (as fotos de antes e depois).
  ferramenta: 'Edit' | 'Write' | 'Bash'
  // O comando, numa linha, quando a edição é de um Bash.
  comando?: string
  // Quem editou, quando foi um subagente: "Explore (Mapear o carrinho)".
  // Ausente: a conversa principal.
  quem?: string
  isApagado?: boolean
  caminho: string
  mais: number
  menos: number
  linhas: LensLinha[]
  cortadas: number
  isNovo: boolean
}

export type LensTurno = {
  n: number
  edicoes: LensEdicao[]
}

export type LensPonto = {
  n: number
  tokens: number
}

export type LensLimite = {
  tipo: string
  percentual: number
  renova?: string
}

export type LensCategoria = {
  nome: string
  tokens: number
  tipo: string
}

export type LensDetalhe = {
  categorias: LensCategoria[]
  total: number
  janela: number
  modelo: string
  // O turno em que foi calculado, e se é a contagem exata ou a estimativa local.
  turno?: number
  isExato?: boolean
  // Em quantos tokens o Claude Code compacta a conversa sozinho; ausente
  // quando a compactação automática está desligada.
  compactaEm?: number
}

// O que a linha de resumo mostra sobre a conversa principal: o modelo e o
// esforço da última resposta, e quanto da entrada dela veio do cache.
export type LensSessao = {
  // Quando a sessão começou (numa retomada, o primeiro começo), em ms.
  inicio?: number
  modelo?: string
  esforco?: string
  cacheLido?: number
  entrada?: number
}

// Os tokens de todas as respostas do modelo na sessão (entrada, cache e
// saída), da conversa principal e dos subagentes, somados desde o começo:
// uma compactação não zera a soma.
export type LensTotais = {
  conversa: number
  subagentes: number
  // O que os subagentes custaram, somado resposta a resposta (a lista de
  // gastos por agente guarda só os 150 mais recentes).
  usdSubagentes?: number
  // As mesmas somas repartidas pelo que cada token foi, para separar o
  // contexto relido do cache (ausentes num estado de antes delas).
  partesConversa?: LensPartes
  partesSubagentes?: LensPartes
  // Os totais no início do último pedido da pessoa: o que o pedido somou.
  antes?: LensTotaisAntes
}

// Os tokens de uma resposta do modelo pelo que foram: o contexto relido do
// cache, o gravado no cache, a entrada nova e a saída.
export type LensPartes = {
  lido: number
  gravado: number
  novo: number
  saida: number
}

export type LensTotaisAntes = {
  conversa: number
  subagentes: number
  semCacheConversa: number
  semCacheSubagentes: number
  usdSubagentes: number
}

export type LensContexto = {
  janela: number
  tokens?: number
  percentual?: number
  historico: LensPonto[]
  tokensAntes?: number
  custo?: number
  custoAntes?: number
  limites: LensLimite[]
  detalhe?: LensDetalhe
}

export type LensComando = {
  id: string
  comando: string
  estado: 'rodando' | 'ok' | 'falhou' | 'negado' | 'fundo'
  saida?: number
  nota?: string
  inicio: number
  duracaoMs?: number
  quem: string
  // Onde está o detalhe do comando (o id do membro em fichasDeComandos).
  ficha?: string
  // O pedido (o turno da aba Turnos) em que o comando rodou.
  ordem?: number
  // O id do subagente que rodou o comando (ausente: a conversa principal).
  agente?: string
}

// Um turno do loop principal, para a aba Turnos.
export type LensRodada = {
  n: number
  // O número do pedido da pessoa a que o turno pertence: o turno que ela abriu
  // e os retornos automáticos dos agentes dele levam o mesmo número.
  ordem?: number
  // Turno aberto pelo retorno de um agente em segundo plano, não pela pessoa.
  isRetorno?: boolean
  agenteId?: string
  // O começo do pedido que abriu o turno, numa linha.
  pedido: string
  // O começo da resposta, numa linha (a inteira fica na ficha do turno).
  resposta?: string
  inicio: number
  duracaoMs?: number
  isAbortado?: boolean
  // O contexto ao fim do turno e quanto ele somou.
  tokens?: number
  variacao?: number
  custo?: number
  ferramentas: number
  falhas: number
  // Quantas vezes cada ferramenta foi chamada no turno.
  porFerramenta?: Record<string, number>
}

// Uma chamada de ferramenta de um subagente, para o detalhe dele.
export type LensPasso = {
  id: string
  ferramenta: string
  argumento: string
  estado: 'rodando' | 'ok' | 'falhou'
  duracaoMs?: number
  // Quando começou (as chamadas de cada rodada de um agente que trabalhou mais
  // de uma vez ficam na rodada delas).
  inicio?: number
  // O que a chamada recebeu (os argumentos, em JSON) e o que devolveu (o
  // fim do texto do resultado, ou o erro): o que abre ao clicar na chamada.
  entrada?: string
  saida?: string
}

// Uma chamada de ferramenta que falhou num turno: qual, com o quê, quem e por quê.
export type LensFalha = {
  ferramenta: string
  argumento: string
  quem: string
  erro: string
}

export type LensTokens = {
  entrada: number
  saida: number
  cacheLido: number
  cacheGravado: number
  modelo: string
}

// O detalhe de um subagente: o pedido que recebeu, as últimas chamadas, as
// últimas mensagens que escreveu e, ao terminar, a resposta e os tokens.
export type LensFichaDoAgente = {
  pedido: string
  passos: LensPasso[]
  mensagens?: string[]
  resposta?: string
  // Quando a resposta chegou pela SubagentHandback (a rodada que terminar
  // depois disso fica com ela: o texto final do agente vem vazio).
  respostaEm?: number
  tokens?: LensTokens
  // Cada vez que ele trabalhou (o mesmo agente acordado por um recado volta a
  // trabalhar): a rodada que roda fica aberta (sem `fim`) e as outras,
  // fechadas, com o que respondeu.
  rodadas?: LensRodadaDoAgente[]
  // O último recado (SendMessage) que chegou a ele, inteiro: o que acorda a
  // rodada seguinte (a lista de mensagens guarda só o começo).
  ultimoRecado?: LensRecado
}

export type LensRecado = {
  // 'principal' ou o id do agente que mandou.
  de: string
  quando: number
  texto: string
}

export type LensRodadaDoAgente = {
  inicio: number
  // Ausentes enquanto a rodada roda.
  fim?: number
  isOk?: boolean
  // A pessoa mandou parar no meio dela.
  isParada?: boolean
  resposta?: string
  // Quem o acordou ('principal' ou o id de um agente) e o recado inteiro; na
  // primeira rodada, quem o criou (o pedido é o da ficha).
  quem?: string
  recado?: string
  // O custo do agente quando a rodada começou e o que ela custou; quantas
  // ferramentas chamou.
  gastoNoInicio?: number
  custo?: number
  chamadas?: number
  // Os tokens só desta rodada (o turn.complete do agente traz o uso do turno
  // dele, e cada rodada é um turno) e o tamanho do contexto dele na última
  // resposta dela.
  tokens?: LensTokens
  contexto?: number
}

// O detalhe de um comando Bash: o comando inteiro e o fim da saída.
export type LensFichaDoComando = {
  id: string
  comando: string
  descricao?: string
  saida?: string
  erro?: string
}

// O detalhe de um turno: o pedido e a resposta inteiros.
export type LensFichaDoTurno = {
  n: number
  pedido: string
  resposta?: string
  // As chamadas que falharam no turno (as últimas 20).
  falhas?: LensFalha[]
}

// Um arquivo que a sessão tocou, para a aba Árvore. `agora` existe enquanto
// uma ferramenta lê ou escreve nele.
export type LensToque = {
  caminho: string
  agora?: 'lendo' | 'editando'
  ultimo?: 'lido' | 'editado' | 'criado'
  quando: number
  lido: number
  editado: number
  mais: number
  menos: number
  quem: string[]
  isNovo?: boolean
}

// Um arquivo que o git vê alterado: a letra do status (M, A, ?, D, R, U...)
// e as linhas somadas contra o HEAD.
export type LensGitArquivo = {
  caminho: string
  letra: string
  mais?: number
  menos?: number
}

export type LensGit = {
  isRepo: boolean
  topo?: string
  ramo?: string
  remoto?: string
  frente?: number
  atras?: number
  lidoEm?: number
  arquivos: LensGitArquivo[]
}

// Uma entrada de uma pasta listada na árvore inteira.
export type LensEntrada = {
  nome: string
  tipo: 'pasta' | 'arquivo'
}

export type LensTipoDeItem =
  | 'plugin'
  | 'disponivel'
  | 'skill'
  | 'comando'
  | 'agente'
  | 'hook'
  | 'mcp'
  | 'estilo'
  | 'memoria'
  | 'ferramenta'

export type LensSecaoDoInventario =
  | 'plugin'
  | 'skill'
  | 'comando'
  | 'agente'
  | 'hook'
  | 'mcp'
  | 'outros'
  | 'disponivel'

// Uma peça do Claude Code: um plugin, uma skill, um comando, um hook... e se
// está ativa nesta sessão. `origem` diz de onde vem (um plugin, as suas
// configurações, o projeto, embutida).
export type LensItem = {
  tipo: LensTipoDeItem
  nome: string
  origem: string
  isAtivo: boolean
  plugin?: string
  descricao?: string
  // Versão, matcher de um hook, número de ferramentas de um MCP...
  extra?: string
  // O que um plugin traz, numa linha.
  detalhe?: string
}

// O diff de um arquivo contra o HEAD, lido do git quando ele é escolhido na
// aba Diffs: o texto unificado já pronto para o Code, ou o aviso de por que não há.
export type LensDiffDoGit = {
  caminho?: string
  texto?: string
  cortadas?: number
  aviso?: string
}

export type LensInventario = {
  itens: LensItem[]
  lidoEm?: number
}

declare module 'claude-code' {
  interface PluginState {
    'csr-lens': {
      ui: LensUi
      agentes: LensAgente[]
      mensagens: LensMensagem[]
      turnos: LensTurno[]
      contexto: LensContexto
      comandos: LensComando[]
      turno: number
      rodadas: LensRodada[]
      serie: number
      pedidos: number
      gastos: LensGastos
      fichasDeAgentes: StateFamily<LensFichaDoAgente>
      fichasDeComandos: StateFamily<LensFichaDoComando>
      fichasDeTurnos: StateFamily<LensFichaDoTurno>
      toques: LensToque[]
      git: LensGit
      pastas: Record<string, LensEntrada[]>
      inventario: LensInventario
      diffGit: LensDiffDoGit
      sessao: LensSessao
      // Um tique por segundo enquanto o painel mostra tempo correndo: só o
      // painel o lê, então só ele é redesenhado pelo relógio.
      relogio: number
      // O resumo do topo do painel e o que as pílulas do Desktop mostram,
      // recalculados a cada segundo e gravados só quando mudam: quem os lê
      // não é redesenhado a cada chamada de ferramenta.
      resumo: string
      faixa: LensFaixa
      faixaLigada: boolean
      // A versão do painel: o único valor que o desenho do painel lê. Sobe
      // quando o instantâneo dos dados é refeito (veja refrescarPainel).
      versao: number
      totais: LensTotais
    }
  }
}

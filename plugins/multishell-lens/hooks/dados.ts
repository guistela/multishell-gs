// Transformações puras do estado: cada uma recebe o valor atual e devolve o
// próximo, para o update() do register.tsx aplicar com ifVersion.

import type { AgentInfo, SessionContextUsage, SessionCost, SessionRateLimit } from 'claude-code'

import type {
  LensAgente,
  LensComando,
  LensContexto,
  LensEdicao,
  LensFalha,
  LensFichaDoAgente,
  LensFichaDoTurno,
  LensGastos,
  LensLimite,
  LensMensagem,
  LensPartes,
  LensPasso,
  LensPonto,
  LensRodada,
  LensRodadaDoAgente,
  LensTokens,
  LensTotais,
  LensTrechoDaRodada,
  LensTurno,
  LensUi,
} from '../types'
import {
  curto,
  decimal,
  dolar,
  duracao,
  duracaoViva,
  horaExata,
  modeloCurto,
  nomeCurtoDoLimite,
  plural,
  primeiraLinha,
  relativo,
  semRaiz,
  tokens,
  umaLinha,
} from './formato'

const MAX_AGENTES = 100
const MAX_COMANDOS = 100
const MAX_TURNOS = 10
const MAX_EDICOES = 60
const MAX_PONTOS = 12
const MAX_RODADAS = 60
const MAX_PASSOS = 40

export const FICHAS_DE_COMANDO = 100
export const FICHAS_DE_TURNO = 60

export const UI_INICIAL: LensUi = {
  // O painel abre na Visão geral.
  aba: 0,
  isFaixa: false,
  filtro: '',
  turno: 0,
  passo: 0,
  isCalculando: false,
}

export const CONTEXTO_INICIAL: LensContexto = { janela: 0, historico: [], limites: [] }

const CAMPOS_DO_RESUMO = [
  'command',
  'file_path',
  'notebook_path',
  'pattern',
  'path',
  'url',
  'query',
  'description',
  'skill',
  'prompt',
]

// O argumento que melhor diz o que a chamada faz, numa linha curta.
export const resumoDaChamada = (campos: Readonly<Record<string, unknown>>, raiz: string): string => {
  for (const nome of CAMPOS_DO_RESUMO) {
    const valor = campos[nome]

    if (typeof valor === 'string' && valor !== '') {
      const texto = nome.endsWith('_path') ? relativo(valor, raiz) : semRaiz(valor, raiz)

      return curto(umaLinha(texto), 80)
    }
  }

  return ''
}

// Um agente que já tinha terminado e voltou a trabalhar (um recado o acordou):
// uma rodada nova, que começa agora; a que acabou fica guardada (quando foi, se
// terminou bem e o começo da resposta). O mesmo agente que ainda roda fica igual.
export const retomado = (agente: LensAgente, agora: number): LensAgente => {
  if (agente.estado === 'rodando') {
    return agente
  }

  const { fim: _fim, isParado: _parado, isParando: _parando, ...resto } = agente

  // Um agente de workflow fechado pelo journal que ainda chama ferramentas:
  // volta a rodar, sem ganhar uma rodada que não houve.
  if (agente.workflow !== undefined || agente.tipo === 'workflow') {
    return { ...resto, estado: 'rodando' }
  }

  const feita: LensTrechoDaRodada = {
    inicio: inicioDaRodada(agente),
    fim: agente.fim ?? agora,
    isOk: agente.estado === 'concluido',
    ...(agente.resultado === undefined ? {} : { resumo: agente.resultado }),
  }

  return {
    ...resto,
    estado: 'rodando',
    retomadas: (agente.retomadas ?? 0) + 1,
    inicioDaRodada: agora,
    inicios: [...(agente.inicios ?? []), agora].slice(-20),
    rodadasAntes: [...(agente.rodadasAntes ?? []), feita].slice(-20),
  }
}

export const comRetomada = (lista: readonly LensAgente[], id: string, agora: number): LensAgente[] =>
  lista.some(agente => agente.id === id && agente.estado !== 'rodando')
    ? lista.map(agente => (agente.id === id ? retomado(agente, agora) : agente))
    : [...lista]

// O começo da rodada que roda (ou da última): numa retomada, o dela.
export const inicioDaRodada = (agente: LensAgente): number => agente.inicioDaRodada ?? agente.inicio

// Quando o agente rodou: "14:02:10 → 14:05:33", ou "14:02:10 → agora"
// enquanto roda. Numa retomada, do começo da primeira rodada ao fim da última.
export const periodoDoAgente = (agente: LensAgente): string => {
  const fim =
    agente.estado === 'rodando'
      ? 'agora'
      : agente.fim !== undefined
        ? horaExata(agente.fim)
        : agente.duracaoMs !== undefined && (agente.retomadas ?? 0) === 0
          ? horaExata(agente.inicio + agente.duracaoMs)
          : undefined

  return fim === undefined ? `desde ${horaExata(agente.inicio)}` : `${horaExata(agente.inicio)} → ${fim}`
}

// Quanto o agente trabalhou: rodando, o que as rodadas de antes somaram mais
// o tempo da atual; pronto, a soma de todas.
export const tempoDoAgente = (agente: LensAgente, agora: number): string => {
  if (agente.estado === 'rodando') {
    const antes = (agente.retomadas ?? 0) > 0 ? (agente.duracaoMs ?? 0) : 0

    return duracaoViva(antes + Math.max(0, agora - inicioDaRodada(agente)))
  }

  return agente.duracaoMs === undefined ? 'duração n/d' : duracao(agente.duracaoMs)
}

// Quantas vezes o mesmo agente trabalhou (1 + as vezes que um recado o acordou).
export const rodadasDoAgente = (agente: LensAgente): number => 1 + (agente.retomadas ?? 0)

// Quando o agente terminou (ausente enquanto roda): o fim guardado ou, num
// estado de antes dele, o começo mais a duração.
export const fimDoAgente = (agente: LensAgente): number | undefined =>
  agente.estado === 'rodando'
    ? undefined
    : (agente.fim ?? (agente.duracaoMs === undefined ? undefined : agente.inicio + agente.duracaoMs))

export const comAtividade = (
  lista: readonly LensAgente[],
  id: string,
  ferramenta: string,
  argumento: string,
  agora: number,
): LensAgente[] => {
  if (!lista.some(agente => agente.id === id)) {
    // Chamada de um agente cujo agent.spawn ainda não foi registrado.
    const novo: LensAgente = {
      id,
      tipo: 'agente',
      descricao: '',
      estado: 'rodando',
      inicio: agora,
      ferramenta,
      argumento,
      chamadas: 1,
      porFerramenta: { [ferramenta]: 1 },
    }

    return [...lista, novo].slice(-MAX_AGENTES)
  }

  return lista.map(agente =>
    agente.id === id
      ? {
          ...retomado(agente, agora),
          estado: 'rodando',
          ferramenta,
          argumento,
          chamadas: agente.chamadas + 1,
          porFerramenta: { ...agente.porFerramenta, [ferramenta]: (agente.porFerramenta?.[ferramenta] ?? 0) + 1 },
        }
      : agente,
  )
}

export const comAgente = (
  lista: readonly LensAgente[],
  novo: {
    id: string
    tipo: string
    descricao: string
    modelo: string | undefined
    pai?: string | undefined
    nome?: string | undefined
    plugin?: string | undefined
    isFundo?: boolean
    ordem?: number
    tarefa?: string
  },
  agora: number,
): LensAgente[] => {
  const modelo = novo.modelo === undefined ? {} : { modelo: modeloCurto(novo.modelo) }
  const dados = {
    tipo: novo.tipo,
    descricao: novo.descricao,
    ...modelo,
    ...(novo.pai === undefined ? {} : { pai: novo.pai }),
    ...(novo.nome === undefined ? {} : { nome: novo.nome }),
    ...(novo.plugin === undefined ? {} : { plugin: novo.plugin }),
    ...(novo.isFundo === true ? { isFundo: true } : {}),
    ...(novo.ordem === undefined ? {} : { ordem: novo.ordem }),
    ...(novo.tarefa === undefined || novo.tarefa === '' ? {} : { tarefa: novo.tarefa }),
  }

  if (lista.some(agente => agente.id === novo.id)) {
    return lista.map(agente => (agente.id === novo.id ? { ...agente, ...dados } : agente))
  }

  const agente: LensAgente = {
    id: novo.id,
    estado: 'rodando',
    inicio: agora,
    chamadas: 0,
    ...dados,
  }

  return [...lista, agente].slice(-MAX_AGENTES)
}

export const comFimDoAgente = (
  lista: readonly LensAgente[],
  fim: {
    id: string
    isOk: boolean
    duracaoMs: number
    resposta: string
    motivo: string
    tokens: number | undefined
  },
  agora: number,
): LensAgente[] => {
  const resultado = curto(primeiraLinha(fim.resposta), 200) || (fim.isOk ? '' : `terminou por ${fim.motivo}`)
  const fecho = {
    estado: fim.isOk ? ('concluido' as const) : ('falhou' as const),
    duracaoMs: fim.duracaoMs,
    fim: agora,
    ...(resultado === '' ? {} : { resultado }),
    ...(fim.tokens === undefined ? {} : { tokens: fim.tokens }),
  }

  if (!lista.some(agente => agente.id === fim.id)) {
    const novo: LensAgente = {
      id: fim.id,
      tipo: 'agente',
      descricao: '',
      inicio: agora - fim.duracaoMs,
      chamadas: 0,
      ...fecho,
    }

    return [...lista, novo].slice(-MAX_AGENTES)
  }

  return lista.map(agente => {
    if (agente.id !== fim.id) {
      return agente
    }

    // Um fim que chega com ele já terminado: uma rodada nova que ninguém viu
    // começar (respondeu ao recado sem chamar ferramenta).
    const atual = agente.estado === 'rodando' ? agente : retomado(agente, agora - fim.duracaoMs)
    // Numa retomada, a duração soma a das rodadas de antes; a desta, pelo
    // relógio (não se sabe se o motor conta a vida inteira do agente).
    const isRetomada = (atual.retomadas ?? 0) > 0
    const antes = isRetomada ? (agente.duracaoMs ?? 0) : 0
    const desta = isRetomada ? Math.max(0, agora - inicioDaRodada(atual)) : fim.duracaoMs
    const { isParando: _parando, ...resto } = atual
    // Os tokens do agente inteiro: numa retomada, os das rodadas de antes mais
    // os desta (o fim traz só os do turno dele, que é esta rodada).
    const tokens = fim.tokens === undefined ? undefined : isRetomada ? (agente.tokens ?? 0) + fim.tokens : fim.tokens

    return {
      ...resto,
      ...fecho,
      duracaoMs: antes + desta,
      ...(tokens === undefined ? {} : { tokens }),
      ...(atual.isParando === true ? { isParado: true } : {}),
    }
  })
}

// Os agentes de um workflow, como o journal da execução os conhece: o nome
// que o script deu, a fase, o workflow e a execução.
export type AchadoDoWorkflow = {
  id: string
  rotulo: string
  fase?: string
  workflow: string
  execucao: string
  // Terminou (o journal tem o resultado, ou a execução acabou): com falha,
  // quando o agente ou a execução não terminaram bem; e quanto durou, se o
  // arquivo da execução disser.
  isTerminado: boolean
  isFalha?: boolean
  duracaoMs?: number
  modelo?: string
}

export const comAgentesDoWorkflow = (
  lista: readonly LensAgente[],
  achados: readonly AchadoDoWorkflow[],
  agora: number,
): LensAgente[] => {
  const proxima = lista.map(agente => {
    const achado = achados.find(um => um.id === agente.id)

    if (achado === undefined) {
      return agente
    }

    // O fim pelo journal ou pela execução: um agente de workflow não tem
    // turn.complete garantido, e uma execução cancelada não fecha os seus.
    const fecho =
      achado.isTerminado && agente.estado === 'rodando'
        ? {
            estado: achado.isFalha === true ? ('falhou' as const) : ('concluido' as const),
            duracaoMs: achado.duracaoMs ?? Math.max(0, agora - agente.inicio),
          }
        : {}

    return {
      ...agente,
      ...fecho,
      tipo: agente.tipo === 'agente' ? 'workflow' : agente.tipo,
      descricao: agente.descricao === '' ? achado.rotulo : agente.descricao,
      rotulo: achado.rotulo,
      workflow: achado.workflow,
      execucao: achado.execucao,
      ...(achado.fase === undefined ? {} : { fase: achado.fase }),
      ...(agente.modelo === undefined && achado.modelo !== undefined ? { modelo: modeloCurto(achado.modelo) } : {}),
    }
  })

  // Os que o Lens ainda não viu entram já: os que rodam, e os que
  // terminaram sem chamar nenhuma ferramenta que ele visse (com a duração do
  // arquivo da execução, quando há).
  for (const achado of achados) {
    if (!proxima.some(agente => agente.id === achado.id)) {
      const fim = achado.isTerminado
        ? {
            estado: achado.isFalha === true ? ('falhou' as const) : ('concluido' as const),
            ...(achado.duracaoMs === undefined ? {} : { duracaoMs: achado.duracaoMs }),
          }
        : { estado: 'rodando' as const }
      proxima.push({
        id: achado.id,
        tipo: 'workflow',
        descricao: achado.rotulo,
        rotulo: achado.rotulo,
        workflow: achado.workflow,
        execucao: achado.execucao,
        ...(achado.fase === undefined ? {} : { fase: achado.fase }),
        ...(achado.modelo === undefined ? {} : { modelo: modeloCurto(achado.modelo) }),
        ...fim,
        inicio: agora - (achado.duracaoMs ?? 0),
        chamadas: 0,
      })
    }
  }

  return proxima.slice(-MAX_AGENTES)
}

const TERMINADOS = ['completed', 'failed', 'killed']

// Acerta a lista com $.agent.list(): tipo dos agentes ainda sem agent.spawn
// registrado e o fim dos que terminaram sem turn.complete (mortos).
export const comListaDaSessao = (
  lista: readonly LensAgente[],
  infos: readonly AgentInfo[],
  agora: number,
): LensAgente[] => {
  const proxima = lista.map(agente => {
    const info = infos.find(um => um.id === agente.id)

    if (info === undefined) {
      return agente
    }

    const tipo = agente.tipo === 'agente' ? info.type : agente.tipo
    const descricao = agente.descricao === '' ? info.description : agente.descricao
    const acabou = agente.estado === 'rodando' && TERMINADOS.includes(info.status)

    if (!acabou) {
      return { ...agente, tipo, descricao }
    }

    const { isParando: _parando, ...resto } = agente
    const fechado: LensAgente = {
      ...resto,
      tipo,
      descricao,
      estado: info.status === 'completed' ? 'concluido' : 'falhou',
      // Numa retomada, a rodada que acabou soma às de antes.
      duracaoMs:
        (agente.retomadas ?? 0) > 0
          ? (agente.duracaoMs ?? 0) + Math.max(0, agora - inicioDaRodada(agente))
          : (agente.duracaoMs ?? agora - agente.inicio),
      fim: agora,
      ...(agente.isParando === true || info.status === 'killed' ? { isParado: true } : {}),
    }

    return info.status === 'completed'
      ? fechado
      : { ...fechado, resultado: info.status === 'killed' ? 'parado antes de terminar' : `terminou como ${info.status}` }
  })

  for (const info of infos) {
    if (!proxima.some(agente => agente.id === info.id)) {
      const isRodando = !TERMINADOS.includes(info.status)
      proxima.push({
        id: info.id,
        tipo: info.type,
        descricao: info.description,
        estado: isRodando ? 'rodando' : info.status === 'completed' ? 'concluido' : 'falhou',
        inicio: agora,
        chamadas: 0,
      })
    }
  }

  return proxima.slice(-MAX_AGENTES)
}

const comPonto = (
  historico: readonly LensPonto[],
  n: number,
  valor: number,
): LensPonto[] =>
  [...historico.filter(ponto => ponto.n !== n), { n, tokens: valor }].slice(-MAX_PONTOS)

// Grava uma medição ($.session.usage ou session.measure) no contexto.
export const comMedida = (
  atual: LensContexto,
  turno: number,
  contexto: SessionContextUsage,
  limites: readonly SessionRateLimit[],
  custo: SessionCost | undefined,
): LensContexto => {
  const proximo: LensContexto = {
    janela: contexto.window,
    historico: atual.historico,
    limites: limites.map((limite): LensLimite =>
      limite.resetsAt === undefined
        ? { tipo: limite.kind, percentual: limite.percentUsed }
        : { tipo: limite.kind, percentual: limite.percentUsed, renova: limite.resetsAt },
    ),
  }

  // Sem leitura (sessão nova ou recém-compactada), o preenchimento fica vazio.
  if (contexto.tokens !== undefined) {
    proximo.tokens = contexto.tokens
    proximo.percentual =
      contexto.percent ?? Math.round((contexto.tokens / Math.max(1, contexto.window)) * 100)

    // A leitura de antes do primeiro turno não é um ponto do gráfico.
    if (turno > 0) {
      proximo.historico = comPonto(atual.historico, turno, contexto.tokens)
    }
  }

  const usd = custo?.usd ?? atual.custo

  if (usd !== undefined) {
    proximo.custo = usd
  }

  if (atual.tokensAntes !== undefined) {
    proximo.tokensAntes = atual.tokensAntes
  }

  if (atual.custoAntes !== undefined) {
    proximo.custoAntes = atual.custoAntes
  }

  if (atual.detalhe !== undefined) {
    proximo.detalhe = atual.detalhe
  }

  return proximo
}

// O custo da sessão lido fora da medida (ao fim de cada resposta de um
// subagente): a medida só vem com os passos da conversa principal, e com
// agentes em segundo plano o total ficava parado enquanto a parte deles subia
// (os agentes passavam de 100% do custo). Só sobe, e só a partir de um centavo,
// para não redesenhar a cada resposta.
export const comCustoVisto = (atual: LensContexto, usd: number | undefined): LensContexto =>
  usd === undefined || (atual.custo !== undefined && usd - atual.custo < 0.01) ? atual : { ...atual, custo: usd }

// No início de um turno: guarda de onde o turno parte, para o que ele somou.
export const comInicioDoTurno = (atual: LensContexto): LensContexto => {
  const { tokensAntes: _tokens, custoAntes: _custo, ...resto } = atual

  return {
    ...resto,
    ...(atual.tokens === undefined ? {} : { tokensAntes: atual.tokens }),
    ...(atual.custo === undefined ? {} : { custoAntes: atual.custo }),
  }
}

export const comComando = (
  lista: readonly LensComando[],
  comando: LensComando,
): LensComando[] => [...lista, comando].slice(-MAX_COMANDOS)

export const comFimDoComando = (
  lista: readonly LensComando[],
  id: string,
  fim: Pick<LensComando, 'estado' | 'duracaoMs' | 'saida' | 'nota'>,
): LensComando[] =>
  lista.map(comando => {
    if (comando.id !== id) {
      return comando
    }

    const fechado: LensComando = { ...comando, estado: fim.estado }

    if (fim.duracaoMs !== undefined) {
      fechado.duracaoMs = fim.duracaoMs
    }

    if (fim.saida !== undefined) {
      fechado.saida = fim.saida
    }

    if (fim.nota !== undefined) {
      fechado.nota = fim.nota
    }

    return fechado
  })

export const comEdicao = (
  turnos: readonly LensTurno[],
  n: number,
  edicao: LensEdicao,
): LensTurno[] => {
  const atual = turnos.find(turno => turno.n === n)
  const proximo: LensTurno = {
    n,
    edicoes: [...(atual?.edicoes ?? []), edicao].slice(-MAX_EDICOES),
  }

  return [...turnos.filter(turno => turno.n !== n), proximo]
    .sort((a, b) => a.n - b.n)
    .slice(-MAX_TURNOS)
}

export const custoDoUltimoTurno = (contexto: LensContexto): number | undefined =>
  contexto.custo === undefined || contexto.custoAntes === undefined
    ? undefined
    : Math.max(0, contexto.custo - contexto.custoAntes)

// O que o último pedido somou ao contexto, do início dele até agora.
export const variacaoDoUltimoTurno = (contexto: LensContexto): number | undefined =>
  contexto.tokens === undefined || contexto.tokensAntes === undefined
    ? undefined
    : contexto.tokens - contexto.tokensAntes

export const tokensSomados = (contexto: LensContexto): string | undefined => {
  const delta = variacaoDoUltimoTurno(contexto)

  return delta === undefined || Math.round(delta) === 0
    ? undefined
    : `${delta > 0 ? '+' : '−'}${tokens(delta)}`
}

export const custoSomado = (contexto: LensContexto): string | undefined => {
  const delta = custoDoUltimoTurno(contexto)

  return delta === undefined || delta < 0.005 ? undefined : `+${decimal(delta, 2)}`
}

// Uma parte da linha de resumo, desenhada como um selo de duas cores: o
// rótulo à esquerda e o valor à direita. `extra` é o que o último turno somou;
// `nivel`, um percentual que dá a cor (contexto e limite).
export type Segmento = {
  chave: 'contexto' | 'custo' | 'limite' | 'agentes'
  rotulo: string
  valor: string
  // Depois do valor, mais leve: os tokens no selo do contexto.
  complemento?: string
  extra?: string
  nivel?: number
  // Agentes: quantos estão rodando agora (o selo acende).
  rodando?: number
}

// A linha de resumo: só o que já tem leitura, cada parte com o seu nome. Sem
// nada para dizer (sessão recém-aberta), não há linha.
export const segmentosDoStatus = (
  agentes: readonly LensAgente[],
  contexto: LensContexto,
): Segmento[] => {
  const rodando = agentes.filter(agente => agente.estado === 'rodando').length
  const prontos = agentes.length - rodando
  const partes: Segmento[] = []
  const com = (extra: string | undefined) => (extra === undefined ? {} : { extra })

  if (contexto.percentual !== undefined) {
    // Os tokens vão no mesmo selo do percentual: são a mesma medida.
    partes.push({
      chave: 'contexto',
      rotulo: 'contexto',
      valor: `${contexto.percentual}%`,
      nivel: contexto.percentual,
      ...(contexto.tokens === undefined ? {} : { complemento: tokens(contexto.tokens) }),
      ...com(tokensSomados(contexto)),
    })

    if (contexto.custo !== undefined) {
      partes.push({
        chave: 'custo',
        rotulo: 'custo',
        valor: dolar(contexto.custo),
        ...com(custoSomado(contexto)),
      })
    }
  }

  if (contexto.limites.length > 0) {
    const limites = contexto.limites.map(
      limite => `${nomeCurtoDoLimite(limite.tipo)} ${limite.percentual}%`,
    )
    partes.push({
      chave: 'limite',
      rotulo: 'limite',
      valor: limites.join(' · '),
      nivel: Math.max(...contexto.limites.map(limite => limite.percentual)),
    })
  }

  if (agentes.length > 0) {
    const grupos = [
      rodando > 0 ? `${rodando} rodando` : undefined,
      prontos > 0 ? plural(prontos, 'concluído', 'concluídos') : undefined,
    ].filter((grupo): grupo is string => grupo !== undefined)
    partes.push({ chave: 'agentes', rotulo: 'agentes', valor: grupos.join(' · '), rodando })
  }

  return partes
}

export const GASTOS_INICIAIS: LensGastos = { visto: 0, agentes: {} }

export const MAX_GASTOS = 150

// O motor só dá o custo da sessão inteira. Ao fim de cada resposta do modelo,
// o que esse custo subiu desde a última leitura vai para quem fez a resposta:
// um subagente (`agenteId`) ou o loop principal (ninguém). `contexto` é o
// tamanho do contexto do agente nessa resposta.
export const comGasto = (
  atual: LensGastos,
  usd: number | undefined,
  agenteId: string | undefined,
  contexto: number | undefined,
): LensGastos => {
  const subiu = usd === undefined ? 0 : Math.max(0, usd - atual.visto)
  const visto = usd === undefined ? atual.visto : Math.max(atual.visto, usd)

  if (agenteId === undefined) {
    return { ...atual, visto }
  }

  const antes = atual.agentes[agenteId]
  const tamanho = contexto ?? antes?.contexto
  const agentes = {
    ...atual.agentes,
    [agenteId]: {
      usd: (antes?.usd ?? 0) + subiu,
      ...(tamanho === undefined ? {} : { contexto: tamanho }),
    },
  }
  const sobra = Object.keys(agentes).length - MAX_GASTOS

  return {
    visto,
    agentes:
      sobra > 0 ? Object.fromEntries(Object.entries(agentes).slice(sobra)) : agentes,
  }
}

// A lista de agentes com o custo e o contexto de cada um, para as telas.
// As partes de uma resposta somadas às de antes.
export const comPartes = (
  atual: LensPartes | undefined,
  uso: { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number },
): LensPartes => ({
  lido: (atual?.lido ?? 0) + uso.cache_read_input_tokens,
  gravado: (atual?.gravado ?? 0) + uso.cache_creation_input_tokens,
  novo: (atual?.novo ?? 0) + uso.input_tokens,
  saida: (atual?.saida ?? 0) + uso.output_tokens,
})

// Os tokens sem o contexto relido do cache: o que o modelo processou pela
// primeira vez (a entrada nova e o gravado no cache) e o que escreveu.
export const semCache = (partes: LensPartes | undefined): number =>
  partes === undefined ? 0 : partes.gravado + partes.novo + partes.saida

// No início de um pedido da pessoa: guarda de onde os totais partem.
export const comInicioNosTotais = (atual: LensTotais, usdSubagentes: number): LensTotais => ({
  ...atual,
  antes: {
    conversa: atual.conversa,
    subagentes: atual.subagentes,
    semCacheConversa: semCache(atual.partesConversa),
    semCacheSubagentes: semCache(atual.partesSubagentes),
    usdSubagentes,
  },
})

export const comGastos = (
  lista: readonly LensAgente[],
  gastos: LensGastos,
): LensAgente[] =>
  lista.map(agente => {
    const gasto = gastos.agentes[agente.id]

    return gasto === undefined
      ? agente
      : {
          ...agente,
          custo: gasto.usd,
          ...(gasto.contexto === undefined ? {} : { contexto: gasto.contexto }),
        }
  })

export const comRodada = (
  lista: readonly LensRodada[],
  nova: LensRodada,
): LensRodada[] => [...lista.filter(rodada => rodada.n !== nova.n), nova].slice(-MAX_RODADAS)

// O relatório de um hand-back vem numa moldura de avisos do Claude Code, com
// cada linha recuada dois espaços: fica só o relatório, sem o recuo.
export const semMoldura = (texto: string): string => {
  const moldura = /^\[Subagent hand-back\](?:[\s\S]*?The report follows:[ \t]*\n)?/.exec(texto)

  if (moldura === null) {
    return texto
  }

  return texto
    .slice(moldura[0].length)
    .split('\n')
    .map(linha => linha.replace(/^ {2}/, ''))
    .join('\n')
    .trim()
}

// Um turno que o Claude Code abre sozinho quando um agente em segundo plano
// devolve o resultado: o texto vem embrulhado e traz o id do agente.
export const retornoDe = (
  texto: string,
): { agenteId: string | undefined; relato: string | undefined } | undefined => {
  const inicio = texto.trimStart()

  if (inicio.startsWith('<task-notification')) {
    return {
      agenteId: /<task-id>([^<]+)<\/task-id>/.exec(inicio)?.[1],
      relato: /<result>([\s\S]*?)<\/result>/.exec(inicio)?.[1]?.trim(),
    }
  }

  if (inicio.startsWith('<agent-message')) {
    const relato = semMoldura(
      inicio
        .replace(/^<agent-message[^>]*>/, '')
        .replace(/<\/agent-message>\s*$/, '')
        .trim(),
    )

    return {
      agenteId: /^<agent-message[^>]*\bfrom="([^"]+)"/.exec(inicio)?.[1],
      relato: relato === '' ? undefined : relato,
    }
  }

  return undefined
}

// Os turnos agrupados pelo pedido da pessoa: o turno que ela abriu e os
// retornos dos agentes dele, com os números somados. O mais recente primeiro.
export type Grupo = {
  ordem: number
  cabeca: LensRodada | undefined
  retornos: LensRodada[]
  inicio: number
  isAndando: boolean
  isAbortado: boolean
  duracaoMs: number
  variacao: number | undefined
  custo: number | undefined
  ferramentas: number
  falhas: number
  porFerramenta: Record<string, number>
}

export const gruposDeTurnos = (rodadas: readonly LensRodada[]): Grupo[] => {
  const grupos = new Map<number, LensRodada[]>()

  for (const rodada of rodadas) {
    const ordem = rodada.ordem ?? rodada.n
    grupos.set(ordem, [...(grupos.get(ordem) ?? []), rodada])
  }

  return [...grupos.entries()]
    .map(([ordem, membros]): Grupo => {
      const lidos = (ler: (rodada: LensRodada) => number | undefined): number[] =>
        [...membros]
          .sort((a, b) => a.n - b.n)
          .map(ler)
          .filter((valor): valor is number => valor !== undefined)
      const somar = (ler: (rodada: LensRodada) => number | undefined): number | undefined => {
        const valores = lidos(ler)

        return valores.length === 0 ? undefined : valores.reduce((a, b) => a + b, 0)
      }
      // Contexto e custo já vêm contados desde o começo do pedido: vale a última leitura.
      const ultimo = (ler: (rodada: LensRodada) => number | undefined): number | undefined =>
        lidos(ler).at(-1)
      const porFerramenta: Record<string, number> = {}

      for (const rodada of membros) {
        for (const [nome, vezes] of Object.entries(rodada.porFerramenta ?? {})) {
          porFerramenta[nome] = (porFerramenta[nome] ?? 0) + vezes
        }
      }

      return {
        ordem,
        cabeca: membros.find(rodada => rodada.isRetorno !== true),
        retornos: membros.filter(rodada => rodada.isRetorno === true),
        inicio: Math.min(...membros.map(rodada => rodada.inicio)),
        isAndando: membros.some(rodada => rodada.duracaoMs === undefined),
        isAbortado: membros.some(rodada => rodada.isAbortado === true),
        duracaoMs: somar(rodada => rodada.duracaoMs) ?? 0,
        variacao: ultimo(rodada => rodada.variacao),
        custo: ultimo(rodada => rodada.custo),
        ferramentas: somar(rodada => rodada.ferramentas) ?? 0,
        falhas: somar(rodada => rodada.falhas) ?? 0,
        porFerramenta,
      }
    })
    .sort((a, b) => b.ordem - a.ordem)
}

const naRodada = (
  lista: readonly LensRodada[],
  n: number,
  muda: (rodada: LensRodada) => LensRodada,
): LensRodada[] => lista.map(rodada => (rodada.n === n ? muda(rodada) : rodada))

export const comChamadaNaRodada = (
  lista: readonly LensRodada[],
  n: number,
  ferramenta: string,
  isFalha: boolean,
): LensRodada[] =>
  naRodada(lista, n, rodada => ({
    ...rodada,
    ferramentas: rodada.ferramentas + 1,
    falhas: rodada.falhas + (isFalha ? 1 : 0),
    porFerramenta: {
      ...rodada.porFerramenta,
      [ferramenta]: (rodada.porFerramenta?.[ferramenta] ?? 0) + 1,
    },
  }))

const FICHA_VAZIA: LensFichaDoAgente = { pedido: '', passos: [] }

// Uma chamada do subagente entra na ficha dele (as últimas 40).
export const comPasso = (
  ficha: LensFichaDoAgente | undefined,
  passo: LensPasso,
): LensFichaDoAgente => {
  const atual = ficha ?? FICHA_VAZIA

  return {
    ...atual,
    passos: [...atual.passos.filter(um => um.id !== passo.id), passo].slice(-MAX_PASSOS),
  }
}

export const comFimDoPasso = (
  ficha: LensFichaDoAgente | undefined,
  id: string,
  isOk: boolean,
  duracaoMs: number,
  saida?: string,
): LensFichaDoAgente => {
  const atual = ficha ?? FICHA_VAZIA

  return {
    ...atual,
    passos: atual.passos.map(passo =>
      passo.id === id
        ? { ...passo, estado: isOk ? 'ok' : 'falhou', duracaoMs, ...(saida === undefined || saida === '' ? {} : { saida }) }
        : passo,
    ),
  }
}

const MAX_FALHAS_DO_TURNO = 20

// Uma chamada que falhou, na ficha do turno em que ela rodou.
export const comFalhaNoTurno = (
  ficha: LensFichaDoTurno | undefined,
  n: number,
  falha: LensFalha,
): LensFichaDoTurno => {
  const atual = ficha ?? { n, pedido: '' }

  return { ...atual, falhas: [...(atual.falhas ?? []), falha].slice(-MAX_FALHAS_DO_TURNO) }
}

export const naFicha = (
  ficha: LensFichaDoAgente | undefined,
  muda: Partial<LensFichaDoAgente>,
): LensFichaDoAgente => ({ ...(ficha ?? FICHA_VAZIA), ...muda })

// A ficha guarda as últimas rodadas do agente.
const MAX_RODADAS_DA_FICHA = 10

// Uma rodada nova começa (um recado acordou o agente): entra aberta, com quem
// o acordou e o custo dele até aqui. Uma que ficou aberta (o fim não chegou)
// fecha onde esta começa, sem se saber como terminou.
export const comRodadaAberta = (
  ficha: LensFichaDoAgente | undefined,
  aberta: LensRodadaDoAgente,
): LensFichaDoAgente => {
  const atual = ficha ?? FICHA_VAZIA
  const fechadas = (atual.rodadas ?? []).map(rodada => (rodada.fim === undefined ? { ...rodada, fim: aberta.inicio } : rodada))

  return { ...atual, rodadas: [...fechadas, aberta].slice(-MAX_RODADAS_DA_FICHA) }
}

// O agente terminou: a rodada aberta fecha (ou, sem uma aberta, a rodada entra
// já fechada), com a resposta, o que custou (o custo dele agora menos o do
// começo dela) e quantas ferramentas chamou (as dele agora menos as das
// rodadas de antes, quando todas as têm).
export const comRodadaFechada = (
  ficha: LensFichaDoAgente | undefined,
  fecho: {
    inicio: number
    fim: number
    isOk: boolean
    isParada?: boolean
    resposta?: string
    custoAgora?: number
    chamadasAgora?: number
    // Os tokens do turno do agente (só desta rodada) e o contexto dele agora.
    tokens?: LensTokens
    contexto?: number
  },
): LensFichaDoAgente => {
  const atual = ficha ?? FICHA_VAZIA
  const rodadas = atual.rodadas ?? []
  const ultima = rodadas.at(-1)
  const isAberta = ultima !== undefined && ultima.fim === undefined
  const base: LensRodadaDoAgente = isAberta ? ultima : { inicio: fecho.inicio }
  const antes = isAberta ? rodadas.slice(0, -1) : rodadas
  const custo = fecho.custoAgora === undefined ? undefined : Math.max(0, fecho.custoAgora - (base.gastoNoInicio ?? 0))
  const chamadasAntes = antes.every(rodada => rodada.chamadas !== undefined)
    ? antes.reduce((soma, rodada) => soma + (rodada.chamadas ?? 0), 0)
    : undefined
  const chamadas =
    fecho.chamadasAgora === undefined || chamadasAntes === undefined ? undefined : Math.max(0, fecho.chamadasAgora - chamadasAntes)
  const fechada: LensRodadaDoAgente = {
    ...base,
    fim: fecho.fim,
    isOk: fecho.isOk,
    ...(fecho.isParada === true ? { isParada: true } : {}),
    ...(fecho.resposta === undefined || fecho.resposta === '' ? {} : { resposta: fecho.resposta }),
    ...(custo === undefined ? {} : { custo }),
    ...(chamadas === undefined ? {} : { chamadas }),
    ...(fecho.tokens === undefined ? {} : { tokens: fecho.tokens }),
    ...(fecho.contexto === undefined ? {} : { contexto: fecho.contexto }),
  }

  return { ...atual, rodadas: [...antes, fechada].slice(-MAX_RODADAS_DA_FICHA) }
}

// Os tokens de duas respostas somados (o modelo é o da mais recente).
export const somaDeTokens = (antes: LensTokens | undefined, agora: LensTokens): LensTokens =>
  antes === undefined
    ? agora
    : {
        entrada: antes.entrada + agora.entrada,
        saida: antes.saida + agora.saida,
        cacheLido: antes.cacheLido + agora.cacheLido,
        cacheGravado: antes.cacheGravado + agora.cacheGravado,
        modelo: agora.modelo,
      }

export const comFimDaRodada = (
  lista: readonly LensRodada[],
  n: number,
  duracaoMs: number,
  isAbortado: boolean,
): LensRodada[] =>
  naRodada(lista, n, rodada =>
    isAbortado ? { ...rodada, duracaoMs, isAbortado: true } : { ...rodada, duracaoMs },
  )

// O que o turno somou ao contexto e quanto custou, pela medição mais recente.
export const comMedidaNaRodada = (
  lista: readonly LensRodada[],
  n: number,
  contexto: LensContexto,
): LensRodada[] =>
  naRodada(lista, n, rodada => {
    const proxima: LensRodada = { ...rodada }
    const custo = custoDoUltimoTurno(contexto)

    if (contexto.tokens !== undefined) {
      proxima.tokens = contexto.tokens

      if (contexto.tokensAntes !== undefined) {
        proxima.variacao = contexto.tokens - contexto.tokensAntes
      }
    }

    if (custo !== undefined) {
      proxima.custo = custo
    }

    return proxima
  })

const MAX_MENSAGENS = 200

// Uma mensagem a mais, entregue ou não (`falha`, o motivo); o destinatário,
// quando é o nome de um agente desta sessão, vira o id dele.
export const comMensagem = (
  lista: readonly LensMensagem[],
  agentes: readonly LensAgente[],
  de: string,
  para: string,
  quando: number,
  extra: { texto?: string; falha?: string } = {},
): LensMensagem[] => {
  const alvo = agentes.find(agente => agente.id === para || agente.nome === para)
  const texto = curto(umaLinha(extra.texto ?? ''), 160)
  const falha = curto(umaLinha(extra.falha ?? ''), 160)

  return [
    ...lista,
    { de, para: alvo?.id ?? para, quando, ...(texto === '' ? {} : { texto }), ...(falha === '' ? {} : { falha }) },
  ].slice(-MAX_MENSAGENS)
}

// O resumo do topo do painel: contexto, turnos, agentes rodando e custo.
export const resumoDaSessao = (
  agentes: readonly LensAgente[],
  rodadas: readonly LensRodada[],
  contexto: LensContexto,
): string => {
  const rodando = agentes.filter(agente => agente.estado === 'rodando').length
  const pedidos = new Set(rodadas.map(rodada => rodada.ordem ?? rodada.n)).size
  const partes = [
    contexto.percentual === undefined ? undefined : `contexto ${contexto.percentual}%`,
    pedidos > 0 ? plural(pedidos, 'turno', 'turnos') : undefined,
    rodando > 0 ? plural(rodando, 'agente rodando', 'agentes rodando') : undefined,
    contexto.custo === undefined ? undefined : dolar(contexto.custo),
  ].filter((parte): parte is string => parte !== undefined)

  return partes.join(' · ')
}

// O retrato da sessão: o que o painel juntou ouvindo os hooks (turnos, recados,
// diffs, a árvore, a divisão do custo) vive no $.state, que some quando o app
// fecha. O retrato vai para o $.store, uma chave por sessão, e volta quando a
// mesma sessão é retomada. O que o motor sabe responder de novo (custo total,
// contexto, limites, git, inventário) não entra: é lido outra vez.

import type {
  LensAgente,
  LensComando,
  LensContexto,
  LensFichaDoAgente,
  LensFichaDoComando,
  LensFichaDoTurno,
  LensGastos,
  LensMensagem,
  LensRodada,
  LensToque,
  LensTotais,
  LensTurno,
} from '../types'

export const VERSAO_DO_RETRATO = 1

export type RetratoDaSessao = {
  versao: typeof VERSAO_DO_RETRATO
  // Quando foi guardado: o que estava rodando nessa hora é dado como interrompido.
  quando: number
  agentes?: LensAgente[]
  mensagens?: LensMensagem[]
  turnos?: LensTurno[]
  contexto?: LensContexto
  comandos?: LensComando[]
  turno?: number
  rodadas?: LensRodada[]
  serie?: number
  pedidos?: number
  gastos?: LensGastos
  totais?: LensTotais
  toques?: LensToque[]
  fichas?: {
    agentes?: Record<string, LensFichaDoAgente>
    comandos?: Record<string, LensFichaDoComando>
    turnos?: Record<string, LensFichaDoTurno>
  }
}

// O $.store inteiro do plugin cabe em 4 MiB de JSON: um retrato fica abaixo de
// 1 MB, e só os das últimas sessões ficam.
export const ORCAMENTO_DO_RETRATO = 1_000_000
export const MAX_RETRATOS = 3

const tamanho = (valor: unknown): number => JSON.stringify(valor).length

// O retrato que cabe no orçamento: inteiro; sem as fichas (os detalhes
// abertos sob demanda); sem os diffs dos turnos e os comandos; ou só o
// essencial (turnos, agentes, recados, custo). Nada, se nem isso couber.
export const retratoQueCabe = (
  retrato: RetratoDaSessao,
  orcamento: number = ORCAMENTO_DO_RETRATO,
): RetratoDaSessao | undefined => {
  const { fichas: _fichas, ...semFichas } = retrato
  const { turnos: _turnos, comandos: _comandos, ...essencial } = semFichas

  return [retrato, semFichas, essencial].find(tentativa => tamanho(tentativa) <= orcamento)
}

// O que veio do $.store, se for um retrato desta versão.
export const lerRetrato = (valor: unknown): RetratoDaSessao | undefined => {
  if (typeof valor !== 'object' || valor === null) {
    return undefined
  }

  const retrato = valor as Partial<RetratoDaSessao>

  return retrato.versao === VERSAO_DO_RETRATO && typeof retrato.quando === 'number'
    ? (retrato as RetratoDaSessao)
    : undefined
}

// O retrato posto de pé: o app fechou com coisas em andamento, e nada delas
// vai terminar (os agentes e comandos morreram com o processo). Fica como
// interrompido, com a duração até a hora em que foi guardado.
export const retratoAcertado = (retrato: RetratoDaSessao): RetratoDaSessao => {
  const ate = retrato.quando

  return {
    ...retrato,
    ...(retrato.agentes === undefined
      ? {}
      : {
          agentes: retrato.agentes.map(agente =>
            agente.estado === 'rodando'
              ? {
                  ...agente,
                  estado: 'falhou' as const,
                  // Numa retomada, as rodadas de antes já estão somadas.
                  duracaoMs:
                    (agente.retomadas ?? 0) > 0
                      ? (agente.duracaoMs ?? 0) + Math.max(0, ate - (agente.inicioDaRodada ?? agente.inicio))
                      : Math.max(0, ate - agente.inicio),
                  // Quando parou: a rodada que ficou aberta na ficha fecha aqui.
                  fim: ate,
                  resultado: 'interrompido: o app fechou com o agente rodando',
                }
              : agente,
          ),
        }),
    ...(retrato.comandos === undefined
      ? {}
      : {
          comandos: retrato.comandos.map(comando =>
            comando.estado === 'rodando'
              ? { ...comando, estado: 'falhou' as const, duracaoMs: Math.max(0, ate - comando.inicio), nota: 'interrompido' }
              : comando,
          ),
        }),
    ...(retrato.rodadas === undefined
      ? {}
      : {
          rodadas: retrato.rodadas.map(rodada =>
            rodada.duracaoMs === undefined
              ? { ...rodada, duracaoMs: Math.max(0, ate - rodada.inicio), isAbortado: true }
              : rodada,
          ),
        }),
    ...(retrato.toques === undefined
      ? {}
      : { toques: retrato.toques.map(({ agora: _agora, ...toque }) => toque) }),
  }
}

// A lista das sessões com retrato, a mais recente por último: esta entra (ou
// sobe para o fim) e as que passam de MAX_RETRATOS saem.
export const indiceDosRetratos = (
  guardado: unknown,
  sessao: string,
): { fica: string[]; sai: string[] } => {
  const antes = Array.isArray(guardado) ? guardado.filter((id): id is string => typeof id === 'string') : []
  const todos = [...antes.filter(id => id !== sessao), sessao]

  return { fica: todos.slice(-MAX_RETRATOS), sai: todos.slice(0, -MAX_RETRATOS) }
}

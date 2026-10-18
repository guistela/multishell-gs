// As rodadas de um agente que trabalhou mais de uma vez (o mesmo id, acordado
// por um recado depois de terminar), postas de pé para as telas: a lista do
// detalhe dele, a tela de cada rodada, os trechos da linha do tempo e quais
// rodadas aconteceram num turno ou dentro de outro agente. Nada aqui chama `$`.

import type { LensAgente, LensFichaDoAgente, LensMensagem, LensPasso, LensRodadaDoAgente, LensTokens } from '../types'
import { inicioDaRodada, rodadasDoAgente } from './dados'
import type { Grupo } from './dados'
import { plural } from './formato'

export type EstadoDaRodada = 'rodando' | 'parando' | 'ok' | 'falhou' | 'parada' | 'interrompida'

// Uma rodada como as telas a veem.
export type RodadaVista = {
  // O número dela (1 é a primeira) e quantas o agente tem.
  n: number
  total: number
  inicio: number
  // Ausente enquanto ela roda.
  fim?: number
  estado: EstadoDaRodada
  // Quem a abriu: 'principal', o id de um agente, ou nada (não se sabe).
  quem?: string
  // O pedido (a primeira) ou o recado que a acordou (as outras).
  pedido?: string
  resposta?: string
  // As chamadas dela, pela hora em que começaram. `isSemHora`: as chamadas
  // guardadas sem horário (de antes) não se repartem entre as rodadas.
  passos: LensPasso[]
  isSemHora: boolean
  custo?: number
  chamadas?: number
  // Os tokens só dela e o contexto do agente na última resposta dela (na
  // última rodada, o contexto do agente agora).
  tokens?: LensTokens
  contexto?: number
}

// Quanto um recado pode chegar depois de a rodada começar e ainda ser o que a acordou.
const JANELA_DO_RECADO_MS = 3000

// O modelo da rodada: o que o uso dela informou (o fim de cada rodada traz o
// modelo que respondeu) ou, sem ele, o do agente.
export const modeloDaRodada = (rodada: Pick<RodadaVista, 'tokens'>, agente: Pick<LensAgente, 'modelo'>): string | undefined =>
  rodada.tokens?.modelo || agente.modelo

export const duracaoDaRodada = (rodada: Pick<RodadaVista, 'inicio' | 'fim'>, agora: number): number =>
  Math.max(0, (rodada.fim ?? agora) - rodada.inicio)

// O último recado entregue ao agente até pouco depois de a rodada começar.
const recadoAntes = (mensagens: readonly LensMensagem[], id: string, inicio: number): LensMensagem | undefined =>
  mensagens.filter(mensagem => mensagem.para === id && mensagem.falha === undefined && mensagem.quando <= inicio + JANELA_DO_RECADO_MS).at(-1)

// O fecho de um agente que não roda, para a rodada dele que a ficha não tem.
const fechoDoAgente = (agente: LensAgente, isUnica: boolean): Partial<LensRodadaDoAgente> => {
  const fim = agente.fim ?? (isUnica && agente.duracaoMs !== undefined ? agente.inicio + agente.duracaoMs : undefined)

  return {
    ...(fim === undefined ? {} : { fim }),
    isOk: agente.estado === 'concluido',
    ...(agente.isParado === true ? { isParada: true } : {}),
    ...(agente.resultado === undefined ? {} : { resposta: agente.resultado }),
  }
}

// As rodadas cruas: as da ficha, completadas pelo que o agente sabe; sem a
// ficha (uma lista, ou um estado de antes delas), as rodadas de antes que o
// agente guarda e a atual.
const rodadasCruas = (agente: LensAgente, ficha: LensFichaDoAgente | undefined): LensRodadaDoAgente[] => {
  // Um agente de workflow não tem rodadas (o journal fecha e reabre ele).
  const daFicha = agente.workflow === undefined ? (ficha?.rodadas ?? []) : []
  const isRodando = agente.estado === 'rodando'

  if (daFicha.length > 0) {
    const ultima = daFicha[daFicha.length - 1]
    // A rodada atual sem estar na ficha: rodando de novo sem a rodada aberta
    // (gravada antes de elas serem abertas no começo), ou uma que o agente
    // conta e a ficha não viu (um estado de antes). Entra, aberta ou fechada
    // como o agente terminou.
    const isSemAtual =
      ultima?.fim !== undefined &&
      (isRodando || (rodadasDoAgente(agente) > daFicha.length && inicioDaRodada(agente) > ultima.fim - 1000))

    return isSemAtual ? [...daFicha, { inicio: inicioDaRodada(agente), ...(isRodando ? {} : fechoDoAgente(agente, false)) }] : daFicha
  }

  const antes = (agente.rodadasAntes ?? []).map(
    (trecho): LensRodadaDoAgente => ({
      inicio: trecho.inicio,
      fim: trecho.fim,
      isOk: trecho.isOk,
      ...(trecho.resumo === undefined ? {} : { resposta: trecho.resumo }),
    }),
  )
  const isUnica = antes.length === 0 && (agente.retomadas ?? 0) === 0
  const atual: LensRodadaDoAgente = {
    inicio: isUnica ? agente.inicio : inicioDaRodada(agente),
    ...(isRodando ? {} : fechoDoAgente(agente, isUnica)),
  }

  return [...antes, atual]
}

// As rodadas do agente, da primeira à atual. `mensagens`: os recados da
// sessão, para dizer quem acordou uma rodada gravada sem isso.
export const rodadasVistas = (
  agente: LensAgente,
  ficha: LensFichaDoAgente | undefined,
  mensagens: readonly LensMensagem[],
  agora: number,
): RodadaVista[] => comCustoQueFalta(rodadasBrutas(agente, ficha, mensagens, agora), agente)

// Numa rodada guardada sem o custo (de antes de ele ir para as rodadas): se
// só ela não tem, é o que sobra do custo do agente depois das outras.
const comCustoQueFalta = (rodadas: RodadaVista[], agente: LensAgente): RodadaVista[] => {
  const semCusto = rodadas.filter(rodada => rodada.custo === undefined)
  const doAgente = agente.custo

  if (rodadas.length <= 1 || semCusto.length !== 1 || doAgente === undefined || semCusto[0]?.fim === undefined) {
    return rodadas
  }

  const outras = rodadas.reduce((soma, rodada) => soma + (rodada.custo ?? 0), 0)

  return rodadas.map(rodada => (rodada.custo === undefined ? { ...rodada, custo: Math.max(0, doAgente - outras) } : rodada))
}

const rodadasBrutas = (
  agente: LensAgente,
  ficha: LensFichaDoAgente | undefined,
  mensagens: readonly LensMensagem[],
  agora: number,
): RodadaVista[] => {
  const cruas = rodadasCruas(agente, ficha)
  // A ficha guarda só as últimas: as que saíram contam no número.
  const total = Math.max(rodadasDoAgente(agente), cruas.length)
  const primeira = total - cruas.length + 1
  const passos = ficha?.passos ?? []
  const isSemHora = passos.some(passo => passo.inicio === undefined)
  const isRodando = agente.estado === 'rodando'

  return cruas.map((crua, i): RodadaVista => {
    const n = primeira + i
    const isUltima = i === cruas.length - 1
    const seguinte = cruas[i + 1]?.inicio
    // Uma rodada aberta de um agente que não roda mais: o app fechou (ou ele
    // foi morto) com ela andando; uma aberta no meio terminou sem aviso.
    const fim =
      crua.fim !== undefined
        ? crua.fim
        : isUltima && isRodando
          ? undefined
          : (isUltima ? agente.fim : seguinte) ?? agora
    const estado: EstadoDaRodada =
      fim === undefined
        ? agente.isParando === true
          ? 'parando'
          : 'rodando'
        : crua.isParada === true
          ? 'parada'
          : crua.isOk === undefined
            ? 'interrompida'
            : crua.isOk
              ? 'ok'
              : 'falhou'
    const dele =
      cruas.length === 1
        ? passos
        : isSemHora
          ? []
          : passos.filter(
              passo =>
                passo.inicio !== undefined &&
                (n === 1 || passo.inicio >= crua.inicio - 1000) &&
                (seguinte === undefined || passo.inicio < seguinte - 1000),
            )
    const recado = n === 1 ? undefined : recadoAntes(mensagens, agente.id, crua.inicio)
    const quem = n === 1 ? (crua.quem ?? agente.pai ?? 'principal') : (crua.quem ?? recado?.de)
    const pedido = n === 1 ? ficha?.pedido || agente.tarefa || crua.recado : (crua.recado ?? recado?.texto)
    // Uma rodada gravada antes de a resposta da SubagentHandback entrar nela:
    // a última fica com a resposta da ficha (também enquanto roda, se o
    // relatório desta rodada já chegou).
    const isRespostaDesta = isUltima && (fim !== undefined || (ficha?.respostaEm ?? -1) >= crua.inicio - 1000)
    const daFicha = isRespostaDesta ? ficha?.resposta : undefined
    // Uma rodada que veio do agente (sem a ficha) tem só o começo da resposta:
    // a inteira da ficha vale mais.
    const resposta = (ficha?.rodadas ?? []).length > 0 ? (crua.resposta ?? daFicha) : (daFicha ?? crua.resposta)
    const custo =
      crua.custo ??
      (total === 1
        ? agente.custo
        : fim === undefined && crua.gastoNoInicio !== undefined && agente.custo !== undefined
          ? Math.max(0, agente.custo - crua.gastoNoInicio)
          : undefined)
    const deAntes = cruas.slice(0, i)
    const chamadasAntes = deAntes.every(outra => outra.chamadas !== undefined)
      ? deAntes.reduce((soma, outra) => soma + (outra.chamadas ?? 0), 0)
      : undefined
    const chamadas =
      crua.chamadas ??
      (total === 1
        ? agente.chamadas
        : fim === undefined && chamadasAntes !== undefined
          ? Math.max(0, agente.chamadas - chamadasAntes)
          : ficha !== undefined && !isSemHora && cruas.length > 1
            ? dele.length
            : undefined)
    // Com uma rodada só, os tokens da ficha são os dela; com várias, só os
    // guardados na rodada (os de antes de serem guardados ficam de fora).
    const tokens = crua.tokens ?? (total === 1 ? ficha?.tokens : undefined)
    const contexto = crua.contexto ?? (isUltima ? agente.contexto : undefined)

    return {
      n,
      total,
      inicio: crua.inicio,
      ...(fim === undefined ? {} : { fim }),
      estado,
      ...(quem === undefined ? {} : { quem }),
      ...(pedido === undefined || pedido === '' ? {} : { pedido }),
      ...(resposta === undefined || resposta === '' ? {} : { resposta }),
      passos: dele,
      isSemHora: isSemHora && cruas.length > 1,
      ...(custo === undefined ? {} : { custo }),
      ...(chamadas === undefined ? {} : { chamadas }),
      ...(tokens === undefined ? {} : { tokens }),
      ...(contexto === undefined ? {} : { contexto }),
    }
  })
}

// Os tokens de todas as rodadas somados: os das rodadas fechadas, quando cada
// uma tem os seus (a que roda ainda não tem). Com uma rodada só, os da ficha.
// Sem os de alguma rodada fechada (guardada antes de os tokens irem para as
// rodadas), nada: os da ficha seriam só os da última, e o total mentiria.
export const tokensDasRodadas = (rodadas: readonly RodadaVista[], ficha: LensFichaDoAgente | undefined): LensTokens | undefined => {
  if (rodadas.length <= 1) {
    return rodadas[0]?.tokens ?? ficha?.tokens
  }

  const fechadas = rodadas.filter(rodada => rodada.fim !== undefined)

  if (fechadas.length === 0 || fechadas.some(rodada => rodada.tokens === undefined)) {
    return undefined
  }

  return fechadas.reduce<LensTokens | undefined>(
    (soma, rodada) =>
      soma === undefined || rodada.tokens === undefined
        ? rodada.tokens
        : {
            entrada: soma.entrada + rodada.tokens.entrada,
            saida: soma.saida + rodada.tokens.saida,
            cacheLido: soma.cacheLido + rodada.tokens.cacheLido,
            cacheGravado: soma.cacheGravado + rodada.tokens.cacheGravado,
            modelo: rodada.tokens.modelo,
          },
    undefined,
  )
}

// A janela de tempo de uma rodada: o que aconteceu nela (os agentes que ela
// criou, os recados que trocou). O recado que a acordou chega pouco antes de
// ela começar: a janela abre um pouco antes.
export const janelaDaRodada = (rodada: Pick<RodadaVista, 'inicio' | 'fim'>, agora: number): { inicio: number; fim: number } => ({
  inicio: rodada.inicio - JANELA_DO_RECADO_MS,
  fim: rodada.fim ?? agora,
})

export const isNaJanela = (quando: number, janela: { inicio: number; fim: number }): boolean =>
  quando >= janela.inicio && quando <= janela.fim

// Um trecho da linha do tempo: cada rodada é um, com o número dela (a lista
// guarda só as últimas rodadas: o número conta a partir do fim).
export type TrechoDaLinha = { n: number; inicio: number; fim: number; estado: 'rodando' | 'ok' | 'falhou' }

export const trechosDoAgente = (agente: LensAgente, fimDaAtual: number): TrechoDaLinha[] => {
  const estado = agente.estado === 'concluido' ? 'ok' : agente.estado
  const antes = agente.rodadasAntes ?? []
  const total = rodadasDoAgente(agente)

  // Sem as rodadas de antes guardadas (um estado de antes delas), uma barra só.
  if (antes.length === 0) {
    return [{ n: total, inicio: agente.inicio, fim: fimDaAtual, estado }]
  }

  return [
    ...antes.map((trecho, i): TrechoDaLinha => ({ n: total - antes.length + i, inicio: trecho.inicio, fim: trecho.fim, estado: trecho.isOk ? 'ok' : 'falhou' })),
    { n: total, inicio: inicioDaRodada(agente), fim: fimDaAtual, estado },
  ]
}

// Os números das rodadas do agente que são de um turno: a primeira, no turno
// em que ele foi criado; as outras, as que começaram nele acordadas pela
// conversa principal ou por um agente que também trabalhou no turno. A rodada
// que um agente de outro turno acordou (dois agentes antigos trocando recados
// enquanto a pessoa faz outro pedido) não é do turno: ela aparece dentro do
// agente que a acordou. Sem saber quem acordou (dados antigos), vale o horário.
export const rodadasNoTurno = (
  agente: LensAgente,
  grupo: Grupo,
  agentes: readonly LensAgente[] = [],
  vistos: ReadonlySet<string> = new Set(),
): number[] => {
  // O fim de um turno é o começo do seguinte: o instante da divisa é do
  // seguinte (senão a rodada que começa ali entraria nos dois).
  const isNoTurno = (quando: number) => quando >= grupo.inicio && (grupo.isAndando || quando < grupo.inicio + grupo.duracaoMs)
  const isCriado = agente.ordem === undefined ? isNoTurno(agente.inicio) : agente.ordem === grupo.ordem
  const total = rodadasDoAgente(agente)
  // Num agente retomado antes de os começos serem guardados, só o da última.
  const inicios = agente.inicios ?? (agente.inicioDaRodada === undefined || total === 1 ? [] : [agente.inicioDaRodada])
  const comEle = new Set([...vistos, agente.id])
  const isDoTurno = (inicio: number): boolean => {
    if (!isNoTurno(inicio)) {
      return false
    }

    const quem = agente.acordadoPor?.[String(inicio)]

    if (quem === undefined || quem === 'principal') {
      return true
    }

    // Acordada por outro agente: só se ele também é deste turno (sem voltar
    // num ciclo de recados).
    const outro = agentes.find(um => um.id === quem)

    return outro !== undefined && !comEle.has(quem) && rodadasNoTurno(outro, grupo, agentes, comEle).length > 0
  }
  // O número pela posição a partir do fim: a lista guarda só os últimos começos.
  const depois = inicios.flatMap((inicio, k) => (isDoTurno(inicio) ? [total - (inicios.length - 1 - k)] : []))

  return [...(isCriado ? [1] : []), ...depois.filter(n => n > 1)]
}

// Os números das rodadas que outro agente abriu: a primeira, se foi ele que o
// criou; as outras, as acordadas por um recado dele.
export const rodadasAbertasPor = (
  agente: LensAgente,
  ficha: LensFichaDoAgente | undefined,
  pai: string,
  mensagens: readonly LensMensagem[],
  agora: number,
): number[] => rodadasVistas(agente, ficha, mensagens, agora).filter(rodada => rodada.quem === pai).map(rodada => rodada.n)

// "rodadas 2 e 3" / "rodada 2".
export const nomeDasRodadas = (numeros: readonly number[]): string => {
  const lista = numeros.length <= 1 ? numeros.join('') : `${numeros.slice(0, -1).join(', ')} e ${numeros.at(-1)}`

  return `${numeros.length === 1 ? 'rodada' : 'rodadas'} ${lista}`
}

// A contagem de uma lista de agentes em que cada rodada é uma linha: "· 2"
// ou, com mais rodadas que agentes, "· 2 · 3 rodadas".
export const contagemDaLista = (lista: { agentes: number; rodadas: number }): string =>
  lista.rodadas > lista.agentes ? `· ${lista.agentes} · ${plural(lista.rodadas, 'rodada', 'rodadas')}` : `· ${lista.agentes}`

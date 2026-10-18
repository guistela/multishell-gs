// O retrato da sessão: o que o painel juntou volta quando o app fecha e a
// mesma sessão é retomada.

import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code/testing'
import { MAX_RETRATOS, indiceDosRetratos, retratoQueCabe } from '../hooks/memoria'
import type { RetratoDaSessao } from '../hooks/memoria'
import { INICIO, SESSAO, fimDoTurno, ligar, subagente } from './motor'

// Um $.store de mentira, num Map, para o teste ver e preparar o que fica no disco.
const lojaFalsa = (on: On) => {
  const loja = new Map<string, unknown>()
  on('store.get', (_, e) => ({ value: loja.get(e.key) }))
  on('store.set', (_, e) => {
    loja.set(e.key, JSON.parse(JSON.stringify(e.value)))

    return { value: undefined }
  })
  on('store.delete', (_, e) => {
    loja.delete(e.key)

    return { value: undefined }
  })
  on('store.keys', () => ({ value: [...loja.keys()] }))
  on('session.end', () => ({ sessionId: SESSAO }))

  return loja
}

// O $ do teste não lê o $.state do plugin: o fim da sessão grava um retrato
// novo, e ele mostra o estado de agora.
const estadoAgora = async ($: { session: { end: (e: { reason: 'other' }) => Promise<unknown> } }, loja: Map<string, unknown>) => {
  await $.session.end({ reason: 'other' })

  return loja.get(`retrato:${SESSAO}`) as RetratoDaSessao
}

test('retrato: o fim de um turno guarda o que o painel juntou, na chave da sessão', async ($, on) => {
  ligar(on)
  const loja = lojaFalsa(on)
  await $.session.start(INICIO)
  await $.turn.start({ text: 'revise o plano', turnId: 't1' })
  const revisor = await $.agent.spawn(subagente('r1', 'code-reviewer', 'Revisar o plano'))
  await $.session.send({ to: String(revisor.agentId), text: 'capriche', origin: { kind: 'model' } })
  await $.turn.complete(fimDoTurno('t1', 'feito', 1000))

  const retrato = loja.get(`retrato:${SESSAO}`) as RetratoDaSessao
  expect(retrato.versao).toBe(1)
  expect(retrato.pedidos).toBe(1)
  expect(retrato.rodadas?.length).toBe(1)
  expect(retrato.agentes?.map(agente => agente.descricao)).toEqual(['Revisar o plano'])
  expect(retrato.mensagens?.map(mensagem => mensagem.texto)).toEqual(['capriche'])
  // O pedido inteiro que o revisor recebeu vai junto, na ficha dele.
  expect(retrato.fichas?.agentes?.[String(revisor.agentId)]?.pedido).toBe('Tarefa de code-reviewer')
  expect(loja.get('retratos')).toEqual([SESSAO])
})

test('retrato: a sessão retomada volta como estava, e o que rodava fica interrompido', async ($, on) => {
  ligar(on)
  const loja = lojaFalsa(on)
  const retrato: RetratoDaSessao = {
    versao: 1,
    quando: 50_000,
    pedidos: 7,
    turno: 7,
    rodadas: [
      { n: 6, pedido: 'antigo', inicio: 1000, duracaoMs: 500, ferramentas: 2, falhas: 0 },
      { n: 7, pedido: 'o último', inicio: 40_000, ferramentas: 1, falhas: 0 },
    ],
    agentes: [
      { id: 'ag-1', tipo: 'Explore', descricao: 'Procurar', estado: 'concluido', inicio: 1000, duracaoMs: 300, chamadas: 3 },
      { id: 'ag-2', tipo: 'Plan', descricao: 'Planejar', estado: 'rodando', inicio: 45_000, chamadas: 1 },
    ],
    mensagens: [{ de: 'principal', para: 'ag-1', quando: 2000, texto: 'oi' }],
    fichas: { agentes: { 'ag-1': { pedido: 'procure os testes', passos: [] } } },
  }
  loja.set(`retrato:${SESSAO}`, retrato)
  await $.session.start(INICIO)

  const agora = await estadoAgora($, loja)
  expect(agora.pedidos).toBe(7)
  expect(agora.mensagens).toEqual([{ de: 'principal', para: 'ag-1', quando: 2000, texto: 'oi' }])
  const agentes = agora.agentes ?? []
  expect(agentes.map(agente => agente.estado)).toEqual(['concluido', 'falhou'])
  expect(agentes[1]?.duracaoMs).toBe(5000)
  expect(agentes[1]?.resultado).toMatch(/interrompido/)
  // O turno que estava aberto fecha como interrompido.
  expect(agora.rodadas?.[1]).toMatchObject({ duracaoMs: 10_000, isAbortado: true })
  expect(agora.fichas?.agentes?.['ag-1']?.pedido).toBe('procure os testes')
})

test('retrato: numa recarga do mod (o estado ainda cheio), o retrato não volta por cima', async ($, on) => {
  ligar(on)
  const loja = lojaFalsa(on)
  await $.session.start(INICIO)
  await $.turn.start({ text: 'novo pedido', turnId: 't1' })
  loja.set(`retrato:${SESSAO}`, { versao: 1, quando: 1, pedidos: 99, agentes: [] })
  await $.session.start(INICIO)

  expect((await estadoAgora($, loja)).pedidos).toBe(1)
})

test('retrato: grande demais, perde primeiro as fichas, depois os diffs e os comandos', () => {
  const base: RetratoDaSessao = { versao: 1, quando: 0, pedidos: 1 }
  const fichas = { agentes: { a: { pedido: 'x'.repeat(2000), passos: [] } } }
  const comandos = [{ id: 'c', comando: 'y'.repeat(2000), estado: 'ok' as const, inicio: 0, quem: 'principal' }]

  expect(retratoQueCabe({ ...base, fichas, comandos }, 10_000)).toEqual({ ...base, fichas, comandos })
  expect(retratoQueCabe({ ...base, fichas, comandos }, 3000)).toEqual({ ...base, comandos })
  expect(retratoQueCabe({ ...base, fichas, comandos }, 500)).toEqual(base)
  expect(retratoQueCabe({ ...base, fichas, comandos }, 10)).toBeUndefined()
})

test('retrato: só os das últimas sessões ficam no store', () => {
  const ids = Array.from({ length: MAX_RETRATOS }, (_, i) => `s${i}`)

  expect(indiceDosRetratos(ids, 'nova')).toEqual({ fica: [...ids.slice(1), 'nova'], sai: ['s0'] })
  // A mesma sessão de novo só sobe para o fim.
  expect(indiceDosRetratos(ids, 's0')).toEqual({ fica: [...ids.slice(1), 's0'], sai: [] })
  expect(indiceDosRetratos('lixo', 'nova')).toEqual({ fica: ['nova'], sai: [] })
})

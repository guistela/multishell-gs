// O mesmo agente que trabalha mais de uma vez (o mesmo id, acordado por um
// recado depois de terminar): as rodadas no detalhe dele, a tela de cada
// rodada, o caminho no alto, os cartões por rodada nos turnos e dentro de
// outro agente, o botão de parar e os horários.

import { expect, test } from 'claude-code/testing'

import type { On } from 'claude-code/testing'

import type { RetratoDaSessao } from '../hooks/memoria'
import { INICIO, SESSAO, doAgente, entrada, fimDoTurno, ligar, painel, subagente } from './motor'
import { noDesenho } from './achados'
import type { Achados } from './achados'

const PAINEL = { plugin: 'csr-lens', component: 'Pane', requestId: 'csr-lens' } as const

// (Um erro com o texto procurado: a mensagem do expect não sai no relatório.)
const mostra = async (ui: Achados, texto: string | RegExp) => {
  if (!(await noDesenho(ui, texto))) {
    throw new Error(`falta no desenho: ${String(texto)}`)
  }
}

const naoMostra = async (ui: Achados, texto: string | RegExp) => {
  if (await noDesenho(ui, texto)) {
    throw new Error(`sobrou no desenho: ${String(texto)}`)
  }
}

// O que o motor de testes devolve de cada elemento (a chave fica fora das props).
type Achado = { key?: unknown; text?: string; props: Record<string, unknown> }

// O elemento com a chave dada, no desenho inteiro, e o texto dentro dele.
const comChave = (no: unknown, chave: string): unknown => {
  if (Array.isArray(no)) {
    for (const filho of no) {
      const achado = comChave(filho, chave)

      if (achado !== undefined) {
        return achado
      }
    }

    return undefined
  }

  if (typeof no !== 'object' || no === null) {
    return undefined
  }

  const objeto = no as Record<string, unknown>
  const props = (objeto.props ?? {}) as Record<string, unknown>

  return props.key === chave ? objeto : comChave(objeto.children, chave)
}

const textoDe = (no: unknown): string =>
  typeof no === 'string'
    ? no
    : Array.isArray(no)
      ? no.map(textoDe).join('')
      : typeof no === 'object' && no !== null
        ? textoDe((no as Record<string, unknown>).children)
        : ''

type ComDesenho = Achados & { drawn: () => Promise<unknown> }

// O caminho no alto do painel, como a pessoa o lê: "Agentes › Revisar › Rodada 2"
// (a aba vem com o ícone dela, "◈ Agentes"; aqui fica só o nome).
const caminho = async (ui: Achados): Promise<string> => {
  const botoes = (await ui.findAll({ type: 'Button' })) as Achado[]
  const partes = botoes.filter(botao => String(botao.key ?? '').startsWith('caminho-')).map(botao => String(botao.props.label))
  const atual = comChave(await (ui as ComDesenho).drawn(), 'caminho-atual')

  return [...partes, textoDe(atual)]
    .filter(parte => parte !== '')
    .map(parte => parte.replace(/^[◉◈◷◧▤◔▦] /, ''))
    .join(' › ')
}

const chaves = async (ui: Achados, prefixo: string): Promise<string[]> =>
  ((await ui.findAll({ type: 'Button' })) as Achado[]).map(botao => String(botao.key ?? '')).filter(chave => chave.startsWith(prefixo))

// Duas rodadas do mesmo agente: a primeira criada no turno 1, a segunda
// acordada por um recado da conversa principal no turno 2 (respondida só pela
// SubagentHandback, com o texto final vazio).
const duasRodadas = async ($: Parameters<Parameters<typeof test>[1]>[0], on: Parameters<Parameters<typeof test>[1]>[1]) => {
  const motor = ligar(on)
  await $.session.start(INICIO)
  await $.turn.start({ text: 'revise o plano', turnId: 't1' })
  const revisor = await $.agent.spawn(subagente('r1', 'general-purpose', 'Revisar o plano'))
  const id = String(revisor.agentId)
  await $.tool.call(doAgente({ tool: 'Read', file_path: '/proj/plano.md' }, id))
  await motor.relogio.advance(2000)
  await $.turn.complete(fimDoTurno('s1', 'Primeira revisão: tudo certo.', 2000, id))
  await $.turn.complete(fimDoTurno('t1', 'feito', 2500))
  await motor.relogio.advance(5000)

  await $.turn.start({ text: 'peça outra revisão', turnId: 't2' })
  await $.session.send({ to: id, text: 'revise de novo o passo 2', origin: { kind: 'model' } })
  await $.tool.call(doAgente({ tool: 'Bash', command: 'cat passo2.md' }, id))
  await motor.relogio.advance(3000)
  await $.tool.call(doAgente({ tool: 'SubagentHandback', message: 'Segunda revisão: o passo 2 mudou.' }, id))
  await $.turn.complete(fimDoTurno('s2', '', 3000, id))
  await $.turn.complete(fimDoTurno('t2', 'feito', 3500))

  return { motor, id }
}

test('duas rodadas: o cartão lista as rodadas, o detalhe também, e cada rodada abre a sua tela, com o caminho no alto', async ($, on) => {
  const { id } = await duasRodadas($, on)

  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop', props: painel('dock', 110) })
  expect(await caminho(ui)).toBe('Visão geral')
  await ui.press({ key: 'aba-1' })
  expect(await caminho(ui)).toBe('Agentes')
  // Um cartão só (é o mesmo agente), com as duas rodadas e o tempo somado; no
  // lugar do pedido e da resposta (que misturariam rodadas), uma linha por
  // rodada, e os botões invisíveis só nas três linhas de cima.
  await mostra(ui, /↻ 2 rodadas/)
  await mostra(ui, /⏱ 5,0s/)
  expect(await chaves(ui, `rodada-${id}-`)).toEqual([`rodada-${id}-1`, `rodada-${id}-2`])
  expect(await ui.find({ type: 'Text', text: 'Pedido  ' })).toBeUndefined()
  expect((await chaves(ui, `linha-agente-${id}-abrir-`)).length).toBe(3)
  // A linha do tempo: uma linha por rodada, cada uma com a barra no horário
  // dela; o nome abre a rodada.
  const barras = (await ui.findAll({ type: 'Svg' })).map(svg => String(svg.props.alt))
  expect(barras).toContain('general-purpose · rodada 1: 2,0s')
  expect(barras).toContain('general-purpose · rodada 2: 3,0s')
  expect((await ui.find({ key: `tempo-rodada-${id}-2` }))?.props.label).toBe('Revisar o plano · rodada 2')
  expect(await ui.find({ key: `tempo-agente-${id}` })).toBeUndefined()

  // O detalhe do agente: a lista das rodadas; o que é de cada uma fica na tela dela.
  await ui.press({ key: `ver-agente-${id}` })
  expect(await caminho(ui)).toBe('Agentes › Revisar o plano')
  await mostra(ui, /Rodadas · 2/)
  expect(await chaves(ui, `ver-rodada-${id}-`)).toEqual([`ver-rodada-${id}-1`, `ver-rodada-${id}-2`])
  await mostra(ui, /criada pela conversa principal/)
  await mostra(ui, /acordada pela conversa principal/)
  await naoMostra(ui, /Últimas chamadas/)
  await naoMostra(ui, /Pedido que o agente recebeu/)
  await naoMostra(ui, /^▾ Ferramentas/)
  expect(await ui.find({ type: 'Markdown' })).toBeUndefined()
  // Os totais são do agente inteiro, e dizem isso.
  const cabecalho = String((await ui.findAll({ type: 'Svg' })).find(svg => String(svg.props.alt).startsWith('Revisar o plano'))?.props.alt)
  expect(cabecalho).toContain('Duração total 5,0s')
  expect(cabecalho).toContain('Chamadas total 3')
  expect(cabecalho).toContain('Rodadas 2')

  // A tela da rodada 2: o recado inteiro, as chamadas dela, a resposta dela
  // (a da SubagentHandback) e a navegação para a anterior.
  await ui.press({ key: `ver-rodada-${id}-2` })
  expect(await caminho(ui)).toBe('Agentes › Revisar o plano › Rodada 2')
  const rodada2 = String((await ui.findAll({ type: 'Svg' })).find(svg => String(svg.props.alt).startsWith('Rodada 2 de 2'))?.props.alt)
  expect(rodada2).toContain('concluída')
  expect(rodada2).toContain('acordada pela conversa principal')
  expect(rodada2).toContain('Duração 3,0s')
  expect(rodada2).toContain('Chamadas 2')
  await mostra(ui, /Recado que o acordou/)
  expect(await ui.find({ type: 'Markdown', text: 'revise de novo o passo 2' })).toBeDefined()
  await mostra(ui, /Chamadas · 2/)
  expect((await ui.findAll({ type: 'Button' })).some(botao => botao.props.label === 'Bash cat passo2.md')).toBe(true)
  expect(await ui.find({ type: 'Markdown', text: 'Segunda revisão: o passo 2 mudou.' })).toBeDefined()
  expect(await ui.find({ type: 'Markdown', text: 'Primeira revisão: tudo certo.' })).toBeUndefined()
  expect((await ui.find({ key: 'rodada-anterior' }))?.props.label).toBe('‹ Rodada 1')
  expect(await ui.find({ key: 'rodada-seguinte' })).toBeUndefined()

  // A rodada 1: o pedido da criação, a chamada dela e a resposta dela.
  await ui.press({ key: 'rodada-anterior' })
  expect(await caminho(ui)).toBe('Agentes › Revisar o plano › Rodada 1')
  await mostra(ui, /Pedido que o agente recebeu/)
  expect(await ui.find({ type: 'Markdown', text: 'Tarefa de general-purpose' })).toBeDefined()
  expect((await ui.findAll({ type: 'Button' })).some(botao => botao.props.label === 'Read plano.md')).toBe(true)
  expect(await ui.find({ type: 'Markdown', text: 'Primeira revisão: tudo certo.' })).toBeDefined()
  expect((await ui.find({ key: 'rodada-seguinte' }))?.props.label).toBe('Rodada 2 ›')
  expect(await ui.find({ key: 'rodada-anterior' })).toBeUndefined()

  // O caminho leva a cada nível: o agente, e a aba.
  await ui.press({ key: 'caminho-0' })
  expect(await caminho(ui)).toBe('Agentes › Revisar o plano')
  await ui.press({ key: 'caminho-aba' })
  expect(await caminho(ui)).toBe('Agentes')
  expect(await ui.find({ key: 'voltar' })).toBeUndefined()
  await ui.unmount()
})

test('rodadas em turnos diferentes: cada turno mostra só a rodada que foi nele, e o detalhe aberto do turno fica no recorte dele', async ($, on) => {
  const { id } = await duasRodadas($, on)

  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop', props: painel('dock', 110) })
  await ui.press({ key: 'aba-4' })
  // Ele aparece nos dois turnos: no 1, onde nasceu, e no 2, onde a conversa
  // principal o acordou, cada um com a linha da rodada que foi ali (e não a
  // do agente inteiro), que abre direto a rodada.
  expect(await chaves(ui, `curta-abrir-${id}`)).toHaveLength(0)
  expect(await chaves(ui, `rodada-${id}-`)).toEqual([`rodada-${id}-2`, `rodada-${id}-1`])
  expect((await ui.find({ key: `rodada-${id}-2` }))?.props.label).toBe('Revisar o plano · rodada 2')
  await mostra(ui, /^Agentes · 1$/)
  await ui.press({ key: `rodada-${id}-2` })
  expect(await caminho(ui)).toBe('Turnos › Turno 2 › Revisar o plano › Rodada 2')
  await ui.press({ key: 'caminho-aba' })

  // O detalhe do turno 2: um cartão da rodada 2 (e não da 1), que abre a rodada.
  await ui.press({ key: 'ver-turno-2' })
  await mostra(ui, /Subagentes · 1/)
  expect(await chaves(ui, `cartao-rodada-${id}-`)).toContain(`cartao-rodada-${id}-2-abrir-0`)
  expect((await chaves(ui, `cartao-rodada-${id}-1`)).length).toBe(0)
  await mostra(ui, /rodada 2 de 2/)
  // Os botões invisíveis do cartão cobrem as três linhas de cima, o recado e a resposta.
  expect((await chaves(ui, `cartao-rodada-${id}-2-abrir-`)).length).toBe(5)
  expect(await ui.find({ type: 'Text', text: 'revise de novo o passo 2' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Segunda revisão: o passo 2 mudou.' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Primeira revisão: tudo certo.' })).toBeUndefined()
  await ui.press({ key: `ver-rodada-${id}-2` })
  expect(await caminho(ui)).toBe('Turnos › Turno 2 › Revisar o plano › Rodada 2')

  // O Voltar leva ao agente, no recorte do turno 2: os totais do agente
  // inteiro no alto, a lista só com a rodada 2 e o aviso das outras (o que é
  // da rodada fica na tela dela); o "ver todas" abre o agente inteiro e
  // ajusta o caminho.
  await ui.press({ key: 'voltar' })
  expect(await caminho(ui)).toBe('Turnos › Turno 2 › Revisar o plano')
  await mostra(ui, /Rodadas deste turno: 1 de 2/)
  await mostra(ui, /as outras foi fora deste turno/)
  expect(await chaves(ui, `ver-rodada-${id}-`)).toEqual([`ver-rodada-${id}-2`])
  expect(await ui.find({ type: 'Markdown' })).toBeUndefined()
  await naoMostra(ui, /Recado que o acordou/)
  const recorte = String((await ui.findAll({ type: 'Svg' })).find(svg => String(svg.props.alt).startsWith('Revisar o plano'))?.props.alt)
  expect(recorte).toContain('Rodadas 2')
  expect(recorte).toContain('Duração total 5,0s')
  expect(recorte).toContain('Chamadas total 3')
  await ui.press({ key: 'ver-todas-rodadas' })
  expect(await caminho(ui)).toBe('Turnos › Revisar o plano')
  await mostra(ui, /Rodadas · 2/)
  await naoMostra(ui, /Rodadas deste turno/)

  // O turno 1: só a rodada 1, criada nele.
  await ui.press({ key: 'caminho-aba' })
  await ui.press({ key: 'ver-turno-1' })
  expect(await chaves(ui, `cartao-rodada-${id}-`)).toContain(`cartao-rodada-${id}-1-abrir-0`)
  expect((await chaves(ui, `cartao-rodada-${id}-2`)).length).toBe(0)
  await mostra(ui, /rodada 1 de 2/)
  await ui.press({ key: `ver-rodada-${id}-1` })
  expect(await caminho(ui)).toBe('Turnos › Turno 1 › Revisar o plano › Rodada 1')
  await ui.press({ key: 'caminho-1' })
  await mostra(ui, /Rodadas deste turno: 1 de 2/)
  expect(await chaves(ui, `ver-rodada-${id}-`)).toEqual([`ver-rodada-${id}-1`])
  await ui.unmount()

  // Da Visão geral, o último turno também está no contexto dele: a linha da
  // rodada 2 abre a rodada, com o caminho pelo turno; e o agente no caminho
  // abre o detalhe no recorte do turno.
  const visao = await $.ui.mount({ ...PAINEL, surface: 'desktop', props: painel('dock', 110) })
  await visao.press({ key: 'aba-0' })
  expect(await chaves(visao, `rodada-${id}-`)).toEqual([`rodada-${id}-2`])
  expect(await visao.find({ key: `curta-abrir-${id}` })).toBeUndefined()
  await mostra(visao, /Agentes que ele chamou · 1$/)
  await visao.press({ key: `rodada-${id}-2` })
  expect(await caminho(visao)).toBe('Visão geral › Turno 2 › Revisar o plano › Rodada 2')
  await visao.press({ key: 'caminho-1' })
  expect(await caminho(visao)).toBe('Visão geral › Turno 2 › Revisar o plano')
  await mostra(visao, /Rodadas deste turno: 1 de 2/)
  await visao.unmount()
})

test('três rodadas, duas no turno 2: dois cartões no turno 2, um no turno 1, e a navegação entre as três', async ($, on) => {
  const motor = ligar(on)
  await $.session.start(INICIO)
  await $.turn.start({ text: 'conte os arquivos', turnId: 't1' })
  const contador = await $.agent.spawn(subagente('c1', 'Explore', 'Contar'))
  const id = String(contador.agentId)
  await $.tool.call(doAgente({ tool: 'Read', file_path: '/proj/a.ts' }, id))
  await motor.relogio.advance(1000)
  await $.turn.complete(fimDoTurno('s1', 'Um arquivo.', 1000, id))
  await $.turn.complete(fimDoTurno('t1', 'feito', 1500))
  await motor.relogio.advance(4000)

  await $.turn.start({ text: 'conte de novo, duas vezes', turnId: 't2' })
  await $.session.send({ to: id, text: 'conte a pasta b', origin: { kind: 'model' } })
  await $.tool.call(doAgente({ tool: 'Read', file_path: '/proj/b/x.ts' }, id))
  await motor.relogio.advance(2000)
  await $.turn.complete(fimDoTurno('s2', 'Dois arquivos em b.', 2000, id))
  await motor.relogio.advance(1000)
  await $.session.send({ to: id, text: 'conte a pasta c', origin: { kind: 'model' } })
  await $.tool.call(doAgente({ tool: 'Read', file_path: '/proj/c/y.ts' }, id))
  await motor.relogio.advance(3000)
  await $.turn.complete(fimDoTurno('s3', 'Três arquivos em c.', 3000, id))
  await $.turn.complete(fimDoTurno('t2', 'feito', 9000))

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PAINEL, surface, props: painel('dock', 110) })
    await ui.press({ key: 'aba-4' })
    // No cartão do turno 2, as duas rodadas que foram nele; no do turno 1, a primeira.
    await mostra(ui, /rodadas/)
    expect(await chaves(ui, `rodada-${id}-`)).toEqual([`rodada-${id}-2`, `rodada-${id}-3`, `rodada-${id}-1`])
    await ui.press({ key: 'ver-turno-2' })
    await mostra(ui, /Subagentes · 1 \(2 rodadas\)/)
    expect((await chaves(ui, `ver-rodada-${id}-`)).sort()).toEqual([`ver-rodada-${id}-2`, `ver-rodada-${id}-3`])
    await mostra(ui, /rodada 2 de 3/)
    await mostra(ui, /rodada 3 de 3/)
    // O agente, aberto do turno 2: o recorte com as duas rodadas dele.
    await ui.press({ key: `ver-rodada-${id}-3` })
    expect(await caminho(ui)).toBe('Turnos › Turno 2 › Contar › Rodada 3')
    expect((await ui.find({ key: 'rodada-anterior' }))?.props.label).toBe('‹ Rodada 2')
    await ui.press({ key: 'rodada-anterior' })
    expect((await ui.find({ key: 'rodada-anterior' }))?.props.label).toBe('‹ Rodada 1')
    expect((await ui.find({ key: 'rodada-seguinte' }))?.props.label).toBe('Rodada 3 ›')
    await ui.press({ key: 'voltar' })
    expect(await caminho(ui)).toBe('Turnos › Turno 2 › Contar')
    await mostra(ui, /Rodadas deste turno: 2 de 3/)
    expect((await chaves(ui, `ver-rodada-${id}-`)).sort()).toEqual([`ver-rodada-${id}-2`, `ver-rodada-${id}-3`])
    // Do turno 1: só a primeira. Da aba Agentes: as três.
    await ui.press({ key: 'caminho-aba' })
    await ui.press({ key: 'ver-turno-1' })
    expect(await chaves(ui, `ver-rodada-${id}-`)).toEqual([`ver-rodada-${id}-1`])
    await ui.press({ key: `curta-abrir-${id}` }).catch(() => undefined)
    await ui.press({ key: 'caminho-aba' })
    await ui.press({ key: 'aba-1' })
    await ui.press({ key: `ver-agente-${id}` })
    await mostra(ui, /Rodadas · 3/)
    expect(await chaves(ui, `ver-rodada-${id}-`)).toEqual([`ver-rodada-${id}-1`, `ver-rodada-${id}-2`, `ver-rodada-${id}-3`])
    await naoMostra(ui, /Rodadas deste turno/)
    await ui.press({ key: 'voltar' })
    await ui.unmount()
  }
})

test('acordado por outro agente: a rodada é dele, e aparece dentro do detalhe dele (e só ela)', async ($, on) => {
  const motor = ligar(on)
  await $.session.start(INICIO)
  await $.turn.start({ text: 'coordene', turnId: 't1' })
  const coordenador = await $.agent.spawn(subagente('k1', 'general-purpose', 'Coordenar'))
  const procurador = await $.agent.spawn(subagente('p1', 'Explore', 'Procurar tudo'))
  const pai = String(coordenador.agentId)
  const id = String(procurador.agentId)
  await $.tool.call(doAgente({ tool: 'Read', file_path: '/proj/a.ts' }, id))
  await motor.relogio.advance(1000)
  await $.turn.complete(fimDoTurno('s1', 'Achei a.ts.', 1000, id))
  await motor.relogio.advance(2000)
  // O coordenador manda o recado; o procurador acorda e responde.
  await $.session.send({ to: id, text: 'procure também em b', origin: { kind: 'model' }, agentId: pai })
  await $.tool.call(doAgente({ tool: 'Grep', pattern: 'x', path: '/proj/b' }, id))
  await motor.relogio.advance(2000)
  await $.turn.complete(fimDoTurno('s2', 'Em b não há nada.', 2000, id))
  await $.turn.complete(fimDoTurno('k1', 'Coordenado.', 6000, pai))
  await $.turn.complete(fimDoTurno('t1', 'feito', 7000))

  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop', props: painel('dock', 110) })
  await ui.press({ key: 'aba-1' })
  await ui.press({ key: `ver-agente-${pai}` })
  // Dentro do coordenador: só a rodada 2 do procurador, a que ele acordou.
  await mostra(ui, /Com quem ele conversou/)
  expect(await chaves(ui, `ver-rodada-${id}-`)).toEqual([`ver-rodada-${id}-2`])
  await mostra(ui, /acordada por Coordenar/)
  await ui.press({ key: `ver-rodada-${id}-2` })
  expect(await caminho(ui)).toBe('Agentes › Coordenar › Procurar tudo › Rodada 2')
  await mostra(ui, /Recado que o acordou/)
  expect(await ui.find({ type: 'Markdown', text: 'procure também em b' })).toBeDefined()
  expect(await ui.find({ type: 'Markdown', text: 'Em b não há nada.' })).toBeDefined()
  // O Voltar leva ao procurador, no recorte do coordenador.
  await ui.press({ key: 'voltar' })
  expect(await caminho(ui)).toBe('Agentes › Coordenar › Procurar tudo')
  await mostra(ui, /Rodadas abertas por Coordenar: 1 de 2/)
  await ui.unmount()
})

test('turno: a rodada que um agente de outro turno acordou não entra nele; a que a conversa principal acordou, sim', async ($, on) => {
  const motor = ligar(on)
  await $.session.start(INICIO)
  // Turno 1: dois agentes em segundo plano, que terminam.
  await $.turn.start({ text: 'rode dois', turnId: 't1' })
  const redator = await $.agent.spawn(subagente('r1', 'general-purpose', 'Redigir as notas'))
  const mapa = await $.agent.spawn(subagente('m1', 'Explore', 'Mapear a cobertura'))
  const r = String(redator.agentId)
  const m = String(mapa.agentId)
  await $.turn.complete(fimDoTurno('sr', 'Notas prontas.', 1000, r))
  await $.turn.complete(fimDoTurno('sm', 'Mapa pronto.', 1000, m))
  await $.turn.complete(fimDoTurno('t1', 'feito', 1500))
  await motor.relogio.advance(5000)

  // Turno 2: a pessoa pede outra coisa; enquanto isso, o redator (do turno 1)
  // acorda o mapa com um recado. Não é deste turno.
  await $.turn.start({ text: 'edite um arquivo', turnId: 't2' })
  await $.session.send({ to: m, text: 'quais têm teste?', origin: { kind: 'model' }, agentId: r })
  await $.tool.call(doAgente({ tool: 'Grep', pattern: 'test', path: '/proj' }, m))
  await motor.relogio.advance(1000)
  await $.turn.complete(fimDoTurno('sm2', 'Três têm teste.', 1000, m))
  await $.turn.complete(fimDoTurno('t2', 'editado', 2000))
  await motor.relogio.advance(5000)

  // Turno 3: a conversa principal acorda o mapa. Esta rodada é do turno 3.
  await $.turn.start({ text: 'pergunte ao mapa', turnId: 't3' })
  await $.session.send({ to: m, text: 'e quais não têm?', origin: { kind: 'model' } })
  await $.tool.call(doAgente({ tool: 'Grep', pattern: 'x', path: '/proj' }, m))
  await motor.relogio.advance(1000)
  await $.turn.complete(fimDoTurno('sm3', 'Dois não têm.', 1000, m))
  await $.turn.complete(fimDoTurno('t3', 'pronto', 2000))

  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop', props: painel('dock', 110) })
  await ui.press({ key: 'aba-4' })
  await ui.press({ key: 'ver-turno-2' })
  // No turno 2, nenhum agente: a rodada 2 do mapa foi o redator que acordou.
  expect(await noDesenho(ui, /Subagentes/)).toBe(false)
  await ui.press({ key: 'voltar' })
  await ui.press({ key: 'ver-turno-3' })
  expect(await chaves(ui, `ver-rodada-${m}-`)).toEqual([`ver-rodada-${m}-3`])
  await ui.unmount()
})

test('custo por rodada: cada rodada mostra o que ela custou, e o agente inteiro a soma', async ($, on) => {
  const motor = ligar(on)
  await $.session.start(INICIO)
  // Uma resposta do modelo do agente, depois da qual a sessão custa `usd`.
  const responder = async (usd: number, agentId: string) => {
    motor.uso = { ...motor.uso, cost: { usd } }
    const fluxo = $.turn.step({ turnId: 's', index: 0, model: 'claude-haiku-4-5-20251001', messageCount: 3, agentId })
    let pedaco = await fluxo.next()

    while (pedaco.done !== true) {
      pedaco = await fluxo.next()
    }
  }
  await $.turn.start({ text: 'revise', turnId: 't1' })
  const revisor = await $.agent.spawn(subagente('r1', 'general-purpose', 'Revisar o plano'))
  const id = String(revisor.agentId)
  // Rodada 1: a sessão vai de US$ 1,00 a US$ 1,30.
  await responder(1.3, id)
  await motor.relogio.advance(1000)
  await $.turn.complete(fimDoTurno('s1', 'Primeira.', 1000, id))
  await $.turn.complete(fimDoTurno('t1', 'feito', 1500))
  await motor.relogio.advance(5000)
  // Rodada 2, acordada pela conversa principal: de US$ 1,30 a US$ 1,50.
  await $.turn.start({ text: 'de novo', turnId: 't2' })
  await $.session.send({ to: id, text: 'revise de novo', origin: { kind: 'model' } })
  await responder(1.5, id)
  await motor.relogio.advance(1000)
  await $.turn.complete(fimDoTurno('s2', 'Segunda.', 1000, id))
  await $.turn.complete(fimDoTurno('t2', 'feito', 1500))

  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop', props: painel('dock', 110) })
  await ui.press({ key: 'aba-1' })
  await ui.press({ key: `ver-agente-${id}` })
  const inteiro = String((await ui.findAll({ type: 'Svg' })).find(svg => String(svg.props.alt).startsWith('Revisar o plano'))?.props.alt)
  expect(inteiro).toContain('Custo total US$ 0,50')
  await ui.press({ key: `ver-rodada-${id}-1` })
  const um = String((await ui.findAll({ type: 'Svg' })).find(svg => String(svg.props.alt).startsWith('Rodada 1 de 2'))?.props.alt)
  expect(um).toContain('Custo US$ 0,30')
  await ui.press({ key: 'rodada-seguinte' })
  const dois = String((await ui.findAll({ type: 'Svg' })).find(svg => String(svg.props.alt).startsWith('Rodada 2 de 2'))?.props.alt)
  expect(dois).toContain('Custo US$ 0,20')
  await ui.unmount()
})

test('sem chamar ferramenta: o fim chega com o agente já terminado, e vira uma rodada nova com a resposta', async ($, on) => {
  const motor = ligar(on)
  await $.session.start(INICIO)
  await $.turn.start({ text: 'mapeie', turnId: 't1' })
  const explore = await $.agent.spawn(subagente('e1', 'Explore', 'Mapear o carrinho'))
  const id = String(explore.agentId)
  await $.tool.call(doAgente({ tool: 'Read', file_path: '/proj/a.ts' }, id))
  await motor.relogio.advance(1000)
  await $.turn.complete(fimDoTurno('s1', 'O carrinho fica em src/carrinho.', 1000, id))
  await motor.relogio.advance(4000)
  await $.session.send({ to: id, text: 'e o frete?', origin: { kind: 'model' } })
  await motor.relogio.advance(2000)
  await $.turn.complete(fimDoTurno('s2', 'O frete fica em src/frete.', 2000, id))

  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop', props: painel('dock', 110) })
  await ui.press({ key: 'aba-1' })
  await mostra(ui, /↻ 2 rodadas/)
  await mostra(ui, /⏱ 3,0s/)
  await ui.press({ key: `rodada-${id}-2` })
  expect(await caminho(ui)).toBe('Agentes › Mapear o carrinho › Rodada 2')
  const cabecalho = String((await ui.findAll({ type: 'Svg' })).find(svg => String(svg.props.alt).startsWith('Rodada 2 de 2'))?.props.alt)
  expect(cabecalho).toContain('Duração 2,0s')
  expect(cabecalho).toContain('Chamadas 0')
  expect(await ui.find({ type: 'Markdown', text: 'e o frete?' })).toBeDefined()
  expect(await ui.find({ type: 'Markdown', text: 'O frete fica em src/frete.' })).toBeDefined()
  await mostra(ui, /Nenhuma chamada de ferramenta nesta rodada/)
  await ui.unmount()
})

test('parar na rodada 2, e uma rodada 2 que falha: cada rodada tem o seu estado', async ($, on) => {
  const motor = ligar(on)
  await $.session.start(INICIO)
  await $.turn.start({ text: 'procure', turnId: 't1' })
  const um = await $.agent.spawn(subagente('e1', 'Explore', 'Procurar tudo'))
  const dois = await $.agent.spawn(subagente('e2', 'Plan', 'Planejar'))
  const parado = String(um.agentId)
  const falho = String(dois.agentId)

  for (const id of [parado, falho]) {
    await $.tool.call(doAgente({ tool: 'Read', file_path: '/proj/a.ts' }, id))
    await $.turn.complete(fimDoTurno(`s-${id}`, 'Pronto.', 1000, id))
    await $.session.send({ to: id, text: 'de novo', origin: { kind: 'model' } })
    await $.tool.call(doAgente({ tool: 'Read', file_path: '/proj/b.ts' }, id))
  }

  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop', props: painel('dock', 110) })
  await ui.press({ key: 'aba-1' })
  await ui.press({ key: `ver-agente-${parado}` })
  // Rodando a rodada 2: ela aparece aberta, e o botão de parar está no detalhe.
  await mostra(ui, /Rodadas · 2/)
  expect((await ui.find({ key: 'parar-agente' }))?.props.label).toBe('■ Parar agente')
  await ui.press({ key: 'parar-agente' })
  await mostra(ui, /Pedi para ele parar/)
  const negada = await $.tool.call(doAgente({ tool: 'Read', file_path: '/proj/c.ts' }, parado))
  expect(negada.deny).toContain('parar agora')
  await $.turn.complete(fimDoTurno('s-parado-2', 'Parei.', 500, parado))
  await $.turn.complete(fimDoTurno('s-falho-2', '', 500, falho, 'error'))
  await motor.relogio.advance(3000)

  // A rodada 2 do primeiro parou a pedido; a do segundo falhou; as primeiras
  // de cada um terminaram bem.
  await ui.press({ key: `ver-rodada-${parado}-2` })
  await mostra(ui, /parada a seu pedido/)
  expect(await ui.find({ key: 'parar-agente' })).toBeUndefined()
  await ui.press({ key: 'caminho-aba' })
  await mostra(ui, /parado antes de terminar/)
  await ui.press({ key: `ver-agente-${falho}` })
  const cartoes = (await ui.findAll({ type: 'Text' })).map(texto => String(texto.text ?? ''))
  expect(cartoes).toContain('falhou')
  await ui.press({ key: `ver-rodada-${falho}-2` })
  const rodada2 = String((await ui.findAll({ type: 'Svg' })).find(svg => String(svg.props.alt).startsWith('Rodada 2 de 2'))?.props.alt)
  expect(rodada2).toContain('✗ falhou')
  await ui.press({ key: 'rodada-anterior' })
  const rodada1 = String((await ui.findAll({ type: 'Svg' })).find(svg => String(svg.props.alt).startsWith('Rodada 1 de 2'))?.props.alt)
  expect(rodada1).toContain('✓ concluída')
  await ui.unmount()
})

test('parar um agente: o botão manda o pedido, e as ferramentas dele passam a ser negadas', async ($, on) => {
  const motor = ligar(on)
  await $.session.start(INICIO)
  await $.turn.start({ text: 'procure tudo', turnId: 't1' })
  const explore = await $.agent.spawn(subagente('e1', 'Explore', 'Procurar tudo'))
  const id = String(explore.agentId)
  await $.tool.call(doAgente({ tool: 'Read', file_path: '/proj/a.ts' }, id))

  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop', props: painel('dock', 110) })
  await ui.press({ key: 'aba-1' })
  await ui.press({ key: `ver-agente-${id}` })
  expect((await ui.find({ key: 'parar-agente' }))?.props.label).toBe('■ Parar agente')
  await ui.press({ key: 'parar-agente' })
  expect((await ui.find({ key: 'parar-agente' }))?.props.label).toBe('Parando…')
  expect(await noDesenho(ui, /Pedi para ele parar/), `falta: ${String(/Pedi para ele parar/)}`).toBe(true)

  // A próxima ferramenta dele não roda: o motivo diz para ele terminar já.
  const antes = motor.visto.chamadas.length
  const negada = await $.tool.call(doAgente({ tool: 'Read', file_path: '/proj/b.ts' }, id))
  expect(negada.deny).toContain('parar agora')
  expect(motor.visto.chamadas.length).toBe(antes)
  // As da conversa principal seguem normais.
  await $.tool.call({ tool: 'Read', file_path: '/proj/c.ts' })
  expect(motor.visto.chamadas.length).toBe(antes + 1)
  // A entrega do relatório passa: é por ela que ele termina.
  const entrega = await $.tool.call(doAgente({ tool: 'SubagentHandback', message: 'Parei: li só a.ts.' }, id))
  expect(entrega.deny).toBeUndefined()
  expect(motor.visto.chamadas.length).toBe(antes + 2)

  await $.turn.complete(fimDoTurno('s1', 'Parei: li só a.ts.', 1000, id))
  // Terminado, o cartão diz que ele parou antes de terminar, e o detalhe não
  // tem mais o botão.
  await ui.press({ key: 'voltar' })
  expect(await noDesenho(ui, /parado antes de terminar/), `falta: ${String(/parado antes de terminar/)}`).toBe(true)
  await ui.press({ key: `ver-agente-${id}` })
  expect(await ui.find({ key: 'parar-agente' })).toBeUndefined()
  await ui.unmount()
})

test('turnos: cada cartão lista os agentes que o turno chamou, e cada nome abre o agente', async ($, on) => {
  ligar(on)
  await $.session.start(INICIO)
  await $.turn.start({ text: 'rode dois agentes', turnId: 't1' })
  const um = await $.agent.spawn(subagente('a1', 'Explore', 'Mapear o carrinho'))
  await $.agent.spawn(subagente('a2', 'Plan', 'Planejar o frete'))
  await $.turn.complete(fimDoTurno('t1', 'feito', 1000))

  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop', props: painel('dock', 110) })
  await ui.press({ key: 'aba-4' })
  expect(await noDesenho(ui, /^Agentes · 2$/), `falta: ${String(/^Agentes · 2$/)}`).toBe(true)
  // Com uma rodada só, nada de rodadas no cartão.
  expect(await chaves(ui, 'rodada-')).toEqual([])
  await ui.press({ key: `curta-abrir-${String(um.agentId)}` })
  expect(await noDesenho(ui, /Mapear o carrinho/), `falta: ${String(/Mapear o carrinho/)}`).toBe(true)
  expect(await caminho(ui)).toBe('Turnos › Turno 1 › Mapear o carrinho')
  // Com uma rodada só, o detalhe é o de sempre: pedido, chamadas e resposta.
  await mostra(ui, /Pedido que o agente recebeu/)
  await mostra(ui, /Últimas chamadas/)
  // O Voltar leva ao turno de onde ele foi aberto.
  await ui.press({ key: 'voltar' })
  expect((await ui.findAll({ type: 'Svg' })).some(svg => String(svg.props.alt).startsWith('Turno 1 · '))).toBe(true)
  expect(await caminho(ui)).toBe('Turnos › Turno 1')
  await ui.unmount()
})

test('no terminal e na versão compacta, as rodadas, a tela da rodada e o caminho desenham sem desenhos', async ($, on) => {
  const { id } = await duasRodadas($, on)

  const terminal = await $.ui.mount({ ...PAINEL, surface: 'terminal', props: painel('dock', 100) })
  await terminal.press({ key: 'aba-1' })
  expect(await chaves(terminal, `rodada-${id}-`)).toEqual([`rodada-${id}-1`, `rodada-${id}-2`])
  await terminal.press({ key: `ver-agente-${id}` })
  expect(await caminho(terminal)).toBe('Agentes › Revisar o plano')
  await mostra(terminal, /Rodadas · 2/)
  await mostra(terminal, /⏱ 5,0s total/)
  await terminal.press({ key: `ver-rodada-${id}-2` })
  expect(await caminho(terminal)).toBe('Agentes › Revisar o plano › Rodada 2')
  await mostra(terminal, /^Rodada 2 de 2$/)
  await mostra(terminal, /concluída/)
  expect(await terminal.find({ type: 'Markdown', text: 'Segunda revisão: o passo 2 mudou.' })).toBeDefined()
  await terminal.unmount()

  // Acima do prompt, a versão compacta (o painel volta onde estava: a rodada
  // 2): o caminho só com um detalhe aberto, e o Voltar sobe cada nível.
  const compacto = await $.ui.mount({ ...PAINEL, surface: 'terminal', props: painel('inline', 100) })
  expect(await caminho(compacto)).toBe('Agentes › Revisar o plano › Rodada 2')
  await mostra(compacto, /Rodada 2 de 2/)
  await compacto.press({ key: 'voltar' })
  expect(await caminho(compacto)).toBe('Agentes › Revisar o plano')
  await mostra(compacto, /Rodadas · 2/)
  await compacto.press({ key: 'voltar' })
  expect(await ui_caminho(compacto)).toBe('')
  await compacto.unmount()
})

// O caminho de uma tela sem detalhe, na versão compacta: nada.
const ui_caminho = async (ui: Achados): Promise<string> =>
  comChave(await (ui as ComDesenho).drawn(), 'caminho-atual') === undefined ? '' : 'tem'

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

test('sessão retomada: as rodadas vão no retrato e voltam; a que rodava fica interrompida', async ($, on) => {
  const loja = lojaFalsa(on)
  const { motor, id } = await duasRodadas($, on)
  // Uma terceira rodada, rodando quando o app fecha.
  await $.turn.start({ text: 'mais uma', turnId: 't3' })
  await $.session.send({ to: id, text: 'revise o passo 3', origin: { kind: 'model' } })
  await $.tool.call(doAgente({ tool: 'Read', file_path: '/proj/passo3.md' }, id))
  await motor.relogio.advance(2000)
  await $.session.end({ reason: 'other' })

  const retrato = loja.get(`retrato:${SESSAO}`) as RetratoDaSessao
  const agente = retrato.agentes?.find(um => um.id === id)
  expect(agente?.retomadas).toBe(2)
  expect(agente?.rodadasAntes?.map(trecho => trecho.isOk)).toEqual([true, true])
  expect(agente?.rodadasAntes?.[0]?.resumo).toBe('Primeira revisão: tudo certo.')
  const rodadas = retrato.fichas?.agentes?.[id]?.rodadas ?? []
  expect(rodadas.map(rodada => rodada.fim === undefined)).toEqual([false, false, true])
  expect(rodadas[1]?.quem).toBe('principal')
  expect(rodadas[1]?.recado).toBe('revise de novo o passo 2')
  expect(rodadas[2]?.recado).toBe('revise o passo 3')

  // A mesma sessão retomada noutro processo: o estado vazio volta do retrato.
  await $.session.end({ reason: 'other' })
  loja.set(`retrato:${SESSAO}`, retrato)
  motor.relogio.advance(60_000)
  const retomada = await $.ui.mount({ ...PAINEL, surface: 'desktop', props: painel('dock', 110) })
  await retomada.press({ key: 'aba-1' })
  // (O estado deste $ ainda está cheio: as mesmas rodadas, agora com a
  // terceira fechada pelo motor como de sempre.)
  await retomada.press({ key: `ver-agente-${id}` })
  await mostra(retomada, /Rodadas · 3/)
  await retomada.unmount()
})

test('sessão retomada de um retrato: a rodada aberta fica interrompida, com o fim na hora do retrato', async ($, on) => {
  ligar(on)
  const loja = lojaFalsa(on)
  const retrato: RetratoDaSessao = {
    versao: 1,
    quando: 50_000,
    pedidos: 2,
    turno: 2,
    rodadas: [
      { n: 1, ordem: 1, pedido: 'revise', inicio: 1000, duracaoMs: 5000, ferramentas: 1, falhas: 0 },
      { n: 2, ordem: 2, pedido: 'de novo', inicio: 20_000, ferramentas: 1, falhas: 0 },
    ],
    agentes: [
      {
        id: 'ag-1',
        tipo: 'general-purpose',
        descricao: 'Revisar o plano',
        estado: 'rodando',
        inicio: 2000,
        duracaoMs: 3000,
        chamadas: 2,
        ordem: 1,
        retomadas: 1,
        inicioDaRodada: 21_000,
        inicios: [21_000],
        rodadasAntes: [{ inicio: 2000, fim: 5000, isOk: true, resumo: 'Tudo certo.' }],
      },
    ],
    mensagens: [{ de: 'principal', para: 'ag-1', quando: 20_500, texto: 'de novo' }],
    fichas: {
      agentes: {
        'ag-1': {
          pedido: 'revise o plano',
          passos: [
            { id: 'p1', ferramenta: 'Read', argumento: 'plano.md', estado: 'ok', duracaoMs: 100, inicio: 2500 },
            { id: 'p2', ferramenta: 'Read', argumento: 'passo2.md', estado: 'ok', duracaoMs: 100, inicio: 21_500 },
          ],
          resposta: 'Tudo certo.',
          rodadas: [
            { inicio: 2000, fim: 5000, isOk: true, resposta: 'Tudo certo.', quem: 'principal', chamadas: 1 },
            { inicio: 21_000, quem: 'principal', recado: 'de novo', gastoNoInicio: 0.1 },
          ],
        },
      },
    },
  }
  loja.set(`retrato:${SESSAO}`, retrato)
  await $.session.start(INICIO)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PAINEL, surface, props: painel('dock', 110) })
    if ((await ui.find({ key: 'aba-1' })) !== undefined) {
      await ui.press({ key: 'aba-1' })
    }
    await mostra(ui, /↻ 2 rodadas/)
    await ui.press({ key: 'ver-agente-ag-1' })
    await mostra(ui, /Rodadas · 2/)
    await mostra(ui, /interrompida/)
    await ui.press({ key: 'ver-rodada-ag-1-2' })
    await mostra(ui, /Rodada 2 de 2/)
    await mostra(ui, /interrompida/)
    expect(await ui.find({ type: 'Markdown', text: 'de novo' })).toBeDefined()
    // As chamadas de cada rodada, pela hora (sem a entrada guardada, em texto).
    await mostra(ui, /Read passo2\.md/)
    await naoMostra(ui, /Read plano\.md/)
    await ui.press({ key: 'rodada-anterior' })
    expect(await ui.find({ type: 'Markdown', text: 'Tudo certo.' })).toBeDefined()
    await ui.press({ key: 'caminho-aba' })
    await ui.unmount()
  }
})

test('dados antigos: um agente retomado sem os começos nem as chamadas com hora não quebra nada', async ($, on) => {
  ligar(on)
  const loja = lojaFalsa(on)
  const retrato: RetratoDaSessao = {
    versao: 1,
    quando: 50_000,
    pedidos: 1,
    turno: 1,
    rodadas: [{ n: 1, ordem: 1, pedido: 'revise', inicio: 1000, duracaoMs: 40_000, ferramentas: 1, falhas: 0 }],
    agentes: [
      { id: 'ag-1', tipo: 'Explore', descricao: 'Mapear o carrinho', estado: 'concluido', inicio: 2000, duracaoMs: 6000, chamadas: 3, retomadas: 1, inicioDaRodada: 30_000 },
    ],
    fichas: {
      agentes: {
        'ag-1': {
          pedido: 'mapeie',
          passos: [
            { id: 'p1', ferramenta: 'Read', argumento: 'a.ts', estado: 'ok', duracaoMs: 100 },
            { id: 'p2', ferramenta: 'Grep', argumento: 'carrinho', estado: 'ok', duracaoMs: 100 },
          ],
          resposta: 'O carrinho fica em src.',
          rodadas: [{ inicio: 2000, fim: 5000, isOk: true, resposta: 'Achei.' }],
        },
      },
    },
  }
  loja.set(`retrato:${SESSAO}`, retrato)
  await $.session.start(INICIO)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PAINEL, surface, props: painel('dock', 100) })
    if ((await ui.find({ key: 'aba-1' })) !== undefined) {
      await ui.press({ key: 'aba-1' })
    }
    await ui.press({ key: 'ver-agente-ag-1' })
    // As duas rodadas aparecem (a segunda só pelo que o agente guarda); o
    // detalhe fica só com os totais e a lista, e as chamadas sem horário vão
    // para a tela da última rodada, com o aviso (na outra, só o aviso).
    await mostra(ui, /Rodadas · 2/)
    await naoMostra(ui, /Guardadas sem horário/)
    await naoMostra(ui, /Últimas chamadas/)
    await ui.press({ key: 'ver-rodada-ag-1-2' })
    await mostra(ui, /Rodada 2 de 2/)
    await mostra(ui, /guardadas sem horário/)
    await mostra(ui, /Últimas chamadas · 2/)
    await mostra(ui, /Read a\.ts/)
    expect(await ui.find({ type: 'Markdown', text: 'O carrinho fica em src.' })).toBeDefined()
    await ui.press({ key: 'rodada-anterior' })
    await mostra(ui, /não dá para dizer quais foram desta rodada/)
    await naoMostra(ui, /Read a\.ts/)
    expect(await ui.find({ type: 'Markdown', text: 'Achei.' })).toBeDefined()
    await ui.press({ key: 'caminho-aba' })
    await ui.unmount()
  }
})

test('workflow: um agente fechado pelo journal que ainda chama ferramentas não ganha rodadas', async ($, on) => {
  const motor = ligar(on)
  motor.sessao.env.HOME = '/casa'
  const sessao = `/casa/.claude/projects/-proj/${SESSAO}`
  const execucao = `${sessao}/subagents/workflows/wf_1`
  motor.listas['/casa/.claude/projects/-proj'] = [entrada(SESSAO, 'dir')]
  motor.listas[`${sessao}/subagents/workflows`] = [entrada('wf_1', 'dir')]
  motor.arquivos[`${execucao}/journal.jsonl`] = [
    { type: 'started', key: 'k1', agentId: 'a1', label: 'pesquisa:site', phase: 'Pesquisa' },
    { type: 'result', key: 'k1', agentId: 'a1', result: 'Achei.' },
  ]
    .map(linha => JSON.stringify(linha))
    .join('\n')
  motor.semTranscricao = ['a1']
  motor.responder = e =>
    e.tool === 'Workflow'
      ? { result: { runId: 'wf_1', workflowName: 'pesquisa', transcriptDir: execucao }, text: 'ok' }
      : { result: { type: 'text' }, text: 'ok' }
  await $.session.start(INICIO)
  await $.tool.call({ tool: 'Workflow', script: "export const meta = { name: 'pesquisa' }" } as never)
  await $.tool.call(doAgente({ tool: 'Read', file_path: '/proj/README.md' }, 'a1'))
  // O journal já tem o resultado: o Lens fecha o agente; ele ainda chama outra ferramenta.
  await motor.relogio.advance(3000)
  await $.tool.call(doAgente({ tool: 'Read', file_path: '/proj/b.md' }, 'a1'))
  await $.turn.complete(fimDoTurno('w1', '', 4000, 'a1'))
  await motor.relogio.advance(3000)

  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop', props: painel('dock', 100) })
  await ui.press({ key: 'aba-1' })
  await naoMostra(ui, /rodadas/)
  await ui.press({ key: 'ver-workflow-agente-a1' })
  await naoMostra(ui, /rodadas/)
  await naoMostra(ui, /Rodadas/)
  await mostra(ui, /Pedido que o agente recebeu/)
  await ui.unmount()
})

test('visão geral: o "Agora" diz em que rodada o agente está, e o grafo também', async ($, on) => {
  const motor = ligar(on)
  await $.session.start(INICIO)
  await $.turn.start({ text: 'mapeie', turnId: 't1' })
  const explore = await $.agent.spawn(subagente('e1', 'Explore', 'Mapear o carrinho'))
  const id = String(explore.agentId)
  await $.tool.call(doAgente({ tool: 'Read', file_path: '/proj/a.ts' }, id))
  await $.turn.complete(fimDoTurno('s1', 'Pronto.', 1000, id))
  await motor.relogio.advance(2000)
  await $.session.send({ to: id, text: 'de novo', origin: { kind: 'model' } })
  await $.tool.call(doAgente({ tool: 'Read', file_path: '/proj/b.ts' }, id))

  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop', props: painel('dock', 110) })
  await mostra(ui, /· rodada 2/)
  expect((await ui.find({ key: `visao-agente-${id}` }))?.props.label).toBe('Mapear o carrinho (Explore)')
  // Na dica do nó do grafo, as rodadas.
  expect(JSON.stringify(await (ui as ComDesenho).drawn())).toContain('2 rodadas')
  // Do "Agora" (fora de um turno), o detalhe mostra todas as rodadas.
  await ui.press({ key: `visao-agente-${id}` })
  expect(await caminho(ui)).toBe('Visão geral › Mapear o carrinho')
  await mostra(ui, /Rodadas · 2/)
  await naoMostra(ui, /Rodadas deste turno/)
  await ui.unmount()
})

// Uma resposta do modelo de um agente (turn.step), com o consumo dela: o
// Lens anota o contexto do agente por ela.
const responder = async (
  $: Parameters<Parameters<typeof test>[1]>[0],
  motor: ReturnType<typeof ligar>,
  agentId: string,
  consumo: { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number },
) => {
  motor.passo = { ...consumo, model: 'claude-haiku-4-5-20251001' }
  const fluxo = $.turn.step({ turnId: `passo-${agentId}`, index: 0, model: 'claude-haiku-4-5-20251001', messageCount: 3, agentId })
  let pedaco = await fluxo.next()

  while (pedaco.done !== true) {
    pedaco = await fluxo.next()
  }
}

test('tokens e contexto por rodada: cada rodada guarda os seus, e o agente soma as rodadas', async ($, on) => {
  const motor = ligar(on)
  await $.session.start(INICIO)
  await $.turn.start({ text: 'conte', turnId: 't1' })
  const contador = await $.agent.spawn(subagente('c1', 'Explore', 'Contar seções do README'))
  const id = String(contador.agentId)
  // O turn.complete de um agente traz o uso do turno dele (cada rodada é um turno).
  const usoDa1 = { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 20_000, cache_creation_input_tokens: 1500 }
  const usoDa2 = { input_tokens: 2000, output_tokens: 700, cache_read_input_tokens: 30_000, cache_creation_input_tokens: 500 }
  await $.tool.call(doAgente({ tool: 'Read', file_path: '/proj/README.md' }, id))
  await responder($, motor, id, usoDa1)
  await motor.relogio.advance(1000)
  await $.turn.complete({ ...fimDoTurno('s1', 'Um.', 1000, id), usage: { ...usoDa1, model: 'claude-haiku-4-5-20251001' } })
  await $.turn.complete(fimDoTurno('t1', 'feito', 1500))
  await motor.relogio.advance(4000)
  await $.turn.start({ text: 'conte de novo', turnId: 't2' })
  await $.session.send({ to: id, text: 'conte de novo', origin: { kind: 'model' } })
  await $.tool.call(doAgente({ tool: 'Grep', pattern: '^#', path: '/proj/README.md' }, id))
  await responder($, motor, id, usoDa2)
  await motor.relogio.advance(2000)
  await $.turn.complete({ ...fimDoTurno('s2', 'Dois.', 2000, id), usage: { ...usoDa2, model: 'claude-sonnet-5-5' } })
  await $.turn.complete(fimDoTurno('t2', 'feito', 2500))

  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop', props: painel('dock', 110) })
  // No cartão do turno 2, o cartão da rodada 2 com o contexto e os tokens só dela.
  await ui.press({ key: 'aba-4' })
  await ui.press({ key: 'ver-turno-2' })
  const pilulas = (await ui.findAll({ type: 'Svg' })).map(svg => String(svg.props.alt))
  expect(pilulas.some(alt => alt.includes('↻ rodada 2 de 2') && alt.includes('contexto 33,2k') && alt.includes('33,2k tokens'))).toBe(true)
  await ui.press({ key: 'caminho-aba' })

  // O cartão do agente inteiro: os tokens somados, ditos como total.
  await ui.press({ key: 'aba-1' })
  await mostra(ui, /56,2k tokens total/)
  await mostra(ui, /⏱ 3,0s total/)
  await mostra(ui, /3 chamadas total|2 chamadas total/)
  // O detalhe: os totais das duas rodadas.
  await ui.press({ key: `ver-agente-${id}` })
  const totais = String((await ui.findAll({ type: 'Svg' })).find(svg => String(svg.props.alt).startsWith('Contar seções do README'))?.props.alt)
  expect(totais).toContain('Entrada total 55k')
  expect(totais).toContain('Cache lido total 50k')
  expect(totais).toContain('Saída total 1,2k')
  expect(totais).toContain('Contexto 33,2k')
  // Cada rodada: os dela.
  await ui.press({ key: `ver-rodada-${id}-2` })
  const rodada2 = String((await ui.findAll({ type: 'Svg' })).find(svg => String(svg.props.alt).startsWith('Rodada 2 de 2'))?.props.alt)
  expect(rodada2).toContain('Entrada 32,5k')
  expect(rodada2).toContain('Cache lido 30k')
  expect(rodada2).toContain('Saída 700')
  expect(rodada2).toContain('Contexto 33,2k')
  // O modelo é o que respondeu nesta rodada (o uso dela traz o modelo).
  expect(rodada2).toContain('Modelo Sonnet 5.5')
  await ui.press({ key: 'rodada-anterior' })
  const rodada1 = String((await ui.findAll({ type: 'Svg' })).find(svg => String(svg.props.alt).startsWith('Rodada 1 de 2'))?.props.alt)
  expect(rodada1).toContain('Entrada 22,5k')
  expect(rodada1).toContain('Saída 500')
  expect(rodada1).toContain('Contexto 23k')
  expect(rodada1).toContain('Modelo Haiku 4.5')
  await ui.press({ key: 'caminho-aba' })
  await ui.unmount()
})

test('detalhe com várias rodadas: só os totais e a lista; o grafo, os recados e as chamadas ficam em cada rodada', async ($, on) => {
  const motor = ligar(on)
  await $.session.start(INICIO)
  await $.turn.start({ text: 'coordene', turnId: 't1' })
  const coordenador = await $.agent.spawn(subagente('k1', 'general-purpose', 'Coordenar'))
  const pai = String(coordenador.agentId)
  // Na rodada 1, o coordenador cria o agente A e termina.
  const a = await $.agent.spawn({ ...subagente('a1', 'Explore', 'Procurar em A'), parentAgentId: pai })
  await $.tool.call(doAgente({ tool: 'Read', file_path: '/proj/a.ts' }, pai))
  await motor.relogio.advance(1000)
  await $.turn.complete(fimDoTurno('sa', 'A pronto.', 500, String(a.agentId)))
  await $.turn.complete(fimDoTurno('k1', 'Coordenado uma vez.', 1000, pai))
  await $.turn.complete(fimDoTurno('t1', 'feito', 1500))
  await motor.relogio.advance(5000)
  // Na rodada 2 (um recado da conversa principal), ele cria o agente B e
  // troca recados com ele.
  await $.turn.start({ text: 'coordene de novo', turnId: 't2' })
  await $.session.send({ to: pai, text: 'coordene de novo', origin: { kind: 'model' } })
  await $.tool.call(doAgente({ tool: 'Grep', pattern: 'x', path: '/proj' }, pai))
  const b = await $.agent.spawn({ ...subagente('b1', 'Explore', 'Procurar em B'), parentAgentId: pai })
  await $.session.send({ to: String(b.agentId), text: 'procure também em c', origin: { kind: 'model' }, agentId: pai })
  await motor.relogio.advance(2000)
  await $.turn.complete(fimDoTurno('sb', 'B pronto.', 500, String(b.agentId)))
  await $.turn.complete(fimDoTurno('k2', 'Coordenado de novo.', 2000, pai))
  await $.turn.complete(fimDoTurno('t2', 'feito', 2500))

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PAINEL, surface, props: painel('dock', 110) })
    // (O painel volta onde ficou: na segunda superfície, já na aba Agentes.)
    if ((await ui.find({ key: 'aba-1' })) !== undefined) {
      await ui.press({ key: 'aba-1' })
    }
    await ui.press({ key: `ver-agente-${pai}` })
    // O detalhe: os totais e a lista das rodadas, e nada do que é de cada uma.
    await mostra(ui, /Rodadas · 2/)
    await naoMostra(ui, /Recados/)
    await naoMostra(ui, /Agentes que ele criou/)
    await naoMostra(ui, /Últimas chamadas/)
    await naoMostra(ui, /^▾ Ferramentas/)
    await naoMostra(ui, /Pedido que o agente recebeu/)
    await naoMostra(ui, /O que o agente escreveu/)
    expect(await ui.find({ key: 'mensagens' })).toBeUndefined()
    expect(await ui.find({ key: `curta-abrir-${String(a.agentId)}` })).toBeUndefined()
    // A rodada 1: o agente A (criado nela), as chamadas dela, sem recados.
    await ui.press({ key: `ver-rodada-${pai}-1` })
    await mostra(ui, /Agentes que ele criou · 1/)
    expect(await ui.find({ key: `curta-abrir-${String(a.agentId)}` })).toBeUndefined()
    expect(await ui.find({ key: `ver-agente-${String(a.agentId)}` }) ?? (await ui.find({ key: `linha-agente-${String(a.agentId)}-abrir-0` }))).toBeDefined()
    expect(await ui.find({ key: `ver-agente-${String(b.agentId)}` }) ?? (await ui.find({ key: `linha-agente-${String(b.agentId)}-abrir-0` }))).toBeUndefined()
    await naoMostra(ui, /Recados/)
    await mostra(ui, /Chamadas · 1/)
    expect((await ui.findAll({ type: 'Button' })).some(botao => botao.props.label === 'Read a.ts')).toBe(true)
    expect((await ui.findAll({ type: 'Button' })).some(botao => botao.props.label === 'Grep x')).toBe(false)
    // A rodada 2: o agente B, o recado para ele, a chamada dela.
    await ui.press({ key: 'rodada-seguinte' })
    await mostra(ui, /Agentes que ele criou · 1/)
    expect(await ui.find({ key: `ver-agente-${String(b.agentId)}` }) ?? (await ui.find({ key: `linha-agente-${String(b.agentId)}-abrir-0` }))).toBeDefined()
    expect(await ui.find({ key: `ver-agente-${String(a.agentId)}` }) ?? (await ui.find({ key: `linha-agente-${String(a.agentId)}-abrir-0` }))).toBeUndefined()
    // Os recados da rodada: o que a acordou (da conversa principal) e o que
    // ele mandou a B.
    await mostra(ui, /Recados · 2/)
    await mostra(ui, /→ para/)
    await mostra(ui, /← de/)
    expect((await ui.findAll({ type: 'Button' })).some(botao => botao.props.label === 'Grep x')).toBe(true)
    expect((await ui.findAll({ type: 'Button' })).some(botao => botao.props.label === 'Read a.ts')).toBe(false)
    // O agente aberto da rodada volta para ela; "Agente inteiro" volta aos totais.
    await ui.press({ key: 'ver-agente-inteiro' })
    await mostra(ui, /Rodadas · 2/)
    await ui.press({ key: 'caminho-aba' })
    await ui.unmount()
  }
})

test('cartões e contagens: um agente com rodadas nunca mostra pedido e resposta no cartão; a contagem diz agentes e rodadas', async ($, on) => {
  const motor = ligar(on)
  await $.session.start(INICIO)
  await $.turn.start({ text: 'conte', turnId: 't1' })
  const um = await $.agent.spawn(subagente('c1', 'Explore', 'Contar'))
  const dois = await $.agent.spawn(subagente('p1', 'Plan', 'Planejar'))
  const id = String(um.agentId)
  await $.tool.call(doAgente({ tool: 'Read', file_path: '/proj/a.ts' }, id))
  await motor.relogio.advance(1000)
  await $.turn.complete(fimDoTurno('s1', 'Um.', 1000, id))
  await $.turn.complete(fimDoTurno('p1', 'Planejado.', 1000, String(dois.agentId)))
  // Duas rodadas a mais no mesmo turno.
  await $.session.send({ to: id, text: 'de novo', origin: { kind: 'model' } })
  await $.tool.call(doAgente({ tool: 'Read', file_path: '/proj/b.ts' }, id))
  await motor.relogio.advance(1000)
  await $.turn.complete(fimDoTurno('s2', 'Dois.', 1000, id))
  await $.session.send({ to: id, text: 'mais uma', origin: { kind: 'model' } })
  await motor.relogio.advance(1000)
  await $.turn.complete(fimDoTurno('s3', 'Três.', 1000, id))
  await $.turn.complete(fimDoTurno('t1', 'feito', 4000))

  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop', props: painel('dock', 110) })
  // A Visão geral: dois agentes, quatro linhas (três rodadas do primeiro e o segundo).
  await mostra(ui, /Agentes que ele chamou · 2 · 4 rodadas/)
  expect(await chaves(ui, `rodada-${id}-`)).toEqual([`rodada-${id}-1`, `rodada-${id}-2`, `rodada-${id}-3`])
  expect(await ui.find({ key: `curta-abrir-${String(dois.agentId)}` })).toBeDefined()
  await mostra(ui, /2 agentes chamados · 4 rodadas/)
  // O cartão do turno: a mesma contagem.
  await ui.press({ key: 'aba-4' })
  await mostra(ui, /^Agentes · 2 · 4 rodadas$/)
  // O detalhe do turno: um cartão por rodada, cada um com o recado e a
  // resposta daquela rodada (e nunca os de outra).
  await ui.press({ key: 'ver-turno-1' })
  await mostra(ui, /Subagentes · 2 \(4 rodadas\)/)
  expect((await chaves(ui, `cartao-rodada-${id}-`)).filter(chave => chave.endsWith('-abrir-0'))).toEqual([
    `cartao-rodada-${id}-1-abrir-0`,
    `cartao-rodada-${id}-2-abrir-0`,
    `cartao-rodada-${id}-3-abrir-0`,
  ])
  expect(await ui.find({ type: 'Text', text: 'mais uma' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Três.' })).toBeDefined()
  await ui.press({ key: 'caminho-aba' })
  // Na aba Agentes, o cartão do agente inteiro: sem pedido nem resposta, com
  // as três rodadas em linhas e os totais.
  await ui.press({ key: 'aba-1' })
  const textos = (await ui.findAll({ type: 'Text' })).map(texto => String(texto.text ?? ''))
  expect(textos.filter(texto => texto === 'Pedido  ')).toHaveLength(1)
  expect(textos.filter(texto => texto === 'Resposta  ')).toHaveLength(1)
  await mostra(ui, /↻ 3 rodadas/)
  await mostra(ui, /2 chamadas total/)
  await ui.unmount()
})

test('dados antigos no cartão: um agente retomado sem as rodadas guardadas não mistura pedido e resposta', async ($, on) => {
  ligar(on)
  const loja = lojaFalsa(on)
  const retrato: RetratoDaSessao = {
    versao: 1,
    quando: 50_000,
    pedidos: 1,
    turno: 1,
    rodadas: [{ n: 1, ordem: 1, pedido: 'revise', inicio: 1000, duracaoMs: 40_000, ferramentas: 1, falhas: 0 }],
    agentes: [
      { id: 'ag-1', tipo: 'general-purpose', descricao: 'Revisar o plugin.json', estado: 'concluido', inicio: 2000, duracaoMs: 6000, chamadas: 3, retomadas: 1, inicioDaRodada: 30_000, ordem: 1, resultado: 'Resposta da rodada 2.' },
    ],
    fichas: {
      agentes: {
        'ag-1': { pedido: 'Pedido da rodada 1', passos: [], resposta: 'Resposta da rodada 2.' },
      },
    },
  }
  loja.set(`retrato:${SESSAO}`, retrato)
  await $.session.start(INICIO)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PAINEL, surface, props: painel('dock', 100) })
    // Na aba Agentes e no detalhe do turno, o cartão do agente inteiro: os
    // totais e a nota das rodadas sem detalhe, nunca o pedido e a resposta.
    if ((await ui.find({ key: 'aba-1' })) !== undefined) {
      await ui.press({ key: 'aba-1' })
    }
    await mostra(ui, /↻ 2 rodadas/)
    await mostra(ui, /sem o detalhe guardado/)
    expect(await ui.find({ type: 'Text', text: 'Pedido  ' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: 'Resposta  ' })).toBeUndefined()
    await ui.press({ key: 'aba-4' })
    await ui.press({ key: 'ver-turno-1' })
    expect(await ui.find({ type: 'Text', text: 'Pedido  ' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: 'Resposta  ' })).toBeUndefined()
    await mostra(ui, /↻ 2 rodadas/)
    // O detalhe dele: os totais e a lista do que se sabe.
    await ui.press({ key: 'caminho-aba' })
    await ui.press({ key: 'aba-1' })
    await ui.press({ key: 'ver-agente-ag-1' })
    await mostra(ui, /Rodadas · 2/)
    await naoMostra(ui, /Pedido que o agente recebeu/)
    await ui.press({ key: 'caminho-aba' })
    await ui.unmount()
  }
})

test('custo com agentes em paralelo: a mesma subida não entra duas vezes, e os agentes nunca passam do total', async ($, on) => {
  const motor = ligar(on)
  await $.session.start(INICIO)
  await $.turn.start({ text: 'rode dois', turnId: 't1' })
  const a = String((await $.agent.spawn(subagente('a1', 'Explore', 'Um'))).agentId)
  const b = String((await $.agent.spawn(subagente('b1', 'Explore', 'Outro'))).agentId)
  // As duas respostas terminam juntas, com a sessão já em US$ 1,50.
  motor.uso = { ...motor.uso, cost: { usd: 1.5 } }
  const passo = async (agentId: string) => {
    const fluxo = $.turn.step({ turnId: `s-${agentId}`, index: 0, model: 'claude-haiku-4-5-20251001', messageCount: 3, agentId })
    let pedaco = await fluxo.next()

    while (pedaco.done !== true) {
      pedaco = await fluxo.next()
    }
  }
  await Promise.all([passo(a), passo(b), passo(a), passo(b)])
  await $.turn.complete(fimDoTurno('t1', 'feito', 1000))

  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop', props: painel('dock', 110) })
  await ui.press({ key: 'aba-3' })
  const grade = String((await ui.findAll({ type: 'Svg' })).find(svg => String(svg.props.alt).startsWith('Total:'))?.props.alt)
  const agentes = Number(/Agentes: US\$ (\d+),(\d+)/.exec(grade)?.slice(1, 3).join('.') ?? 'NaN')
  // A sessão começou em US$ 1,00: só US$ 0,50 é dos agentes, uma vez.
  expect(agentes).toBeLessThanOrEqual(0.5)
  expect(grade).not.toMatch(/\d{3}% do custo/)
  await ui.unmount()
})

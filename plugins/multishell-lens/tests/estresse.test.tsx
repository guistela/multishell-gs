import { expect, test } from 'claude-code/testing'

import { INICIO, comRepositorio, doAgente, fimDoTurno, ligar, painel, subagente } from './motor'

const MOD = 'csr-lens'
const PAINEL = { plugin: MOD, component: 'Pane', requestId: MOD } as const

// Uma sessão longa e bagunçada, como as de verdade: dezenas de turnos,
// agentes que nunca terminam, comandos que falham ou ficam rodando, edições.
// Toda aba, em toda superfície e largura, tem de desenhar alguma coisa.
test('sessão longa: toda aba desenha, em toda largura e superfície', { timeoutMs: 20_000 }, async ($, on) => {
  const motor = ligar(on)
  comRepositorio(motor)
  motor.responder = e => {
    if (typeof e.command === 'string' && e.command.startsWith('falha')) {
      return { isError: true, result: 'Exit code 2\nfalhou', text: 'Exit code 2\nfalhou' }
    }

    if (e.command === 'pendura') {
      return new Promise(() => undefined)
    }

    return { result: { stdout: 'ok', stderr: '', interrupted: false }, text: 'ok' }
  }
  await $.session.start(INICIO)
  let retomado: string | undefined

  for (let t = 1; t <= 30; t += 1) {
    await $.turn.start({ text: `pedido ${t} ${'com bastante texto '.repeat(t % 4)}`, turnId: `t${t}` })

    if (t % 5 === 0) {
      const agente = await $.agent.spawn(subagente(`a${t}`, t % 2 === 0 ? 'Explore' : 'general-purpose', t % 3 === 0 ? '' : `tarefa ${t}`))
      await $.tool.call(doAgente({ tool: 'Read', file_path: `/proj/src/m${t}.ts` }, agente.agentId))
      await $.tool.call(doAgente({ tool: 'Bash', command: `ls src/${t}` }, agente.agentId))

      // O do turno 5 termina e é acordado de novo, duas vezes (nos turnos 7 e 11).
      if (t === 5) {
        retomado = String(agente.agentId)
        await $.turn.complete(fimDoTurno('r1', 'Primeira rodada.', 1000, retomado))
      }
    }

    if ((t === 7 || t === 11) && retomado !== undefined) {
      await $.session.send({ to: retomado, text: `de novo no turno ${t}`, origin: { kind: 'model' } })
      await $.tool.call(doAgente({ tool: 'Grep', pattern: `t${t}`, path: '/proj' }, retomado))
      await $.turn.complete(fimDoTurno(`r${t}`, `Rodada do turno ${t}.`, 1000, retomado))
    }

    await $.tool.call({ tool: 'Read', file_path: `/proj/src/arquivo${t % 7}.ts` })
    await $.tool.call({ tool: 'Bash', command: t % 4 === 0 ? `falha ${t}` : `npm run passo-${t}` })
    await $.tool.call({ tool: 'Edit', file_path: `/proj/src/arquivo${t % 7}.ts`, old_string: 'a', new_string: `b${t}` })

    if (t === 12) {
      void $.tool.call({ tool: 'Bash', command: 'pendura' })
    }

    await motor.relogio.advance(3000 + t * 1000)

    if (t < 30) {
      await $.turn.complete(fimDoTurno(`t${t}`, `resposta ${t}`, 3000 + t * 1000, undefined, t % 9 === 0 ? 'error' : 'answer'))
    }
  }

  for (const surface of ['terminal', 'desktop'] as const) {
    for (const [placement, largura] of [['dock', 44], ['dock', 90], ['dock', 180], ['inline', 120]] as const) {
      const ui = await $.ui.mount({ ...PAINEL, surface, props: painel(placement, largura) })

      for (const aba of [1, 2, 3, 4, 5, 6]) {
        await ui.press({ key: `aba-${aba}` }).catch(() => undefined)
        const desenho = JSON.stringify(await ui.drawn())
        expect(desenho.length, `aba ${aba} · ${surface} · ${placement} ${largura}`).toBeGreaterThan(200)
      }

      // O detalhe de um turno com comandos, e de um comando aberto dele.
      if (placement === 'dock') {
        await ui.press({ key: 'aba-4' })
        await ui.press({ key: 'ver-turno-12' })
        expect(JSON.stringify(await ui.drawn())).toContain('Comandos Bash')
        await ui.press({ key: 'voltar' })

        // O agente de três rodadas: a linha da rodada no cartão do turno 7
        // abre a rodada 2; o detalhe dele, os totais; a rodada 3, os dela.
        // Em toda largura, o caminho e o Voltar estão lá. (A versão compacta
        // não lista os agentes nos cartões dos turnos.)
        await ui.press({ key: `rodada-${String(retomado)}-2` })
        expect(JSON.stringify(await ui.drawn()), `rodada · ${surface} · ${placement} ${largura}`).toContain('"key":"caminho-atual"')
        expect(await ui.find({ key: 'voltar' })).toBeDefined()
        await ui.press({ key: 'ver-agente-inteiro' })
        expect(JSON.stringify(await ui.drawn())).toContain('Rodadas')
        expect(await ui.find({ key: `ver-rodada-${String(retomado)}-3` })).toBeDefined()
        await ui.press({ key: `ver-rodada-${String(retomado)}-3` })
        expect(JSON.stringify(await ui.drawn())).toContain('Rodada 3 de 3')
        await ui.press({ key: 'voltar' })
        await ui.press({ key: 'voltar' })
        expect(await ui.find({ key: 'voltar' })).toBeUndefined()
      }

      await ui.press({ key: 'aba-1' })
      await ui.unmount()
    }
  }
})

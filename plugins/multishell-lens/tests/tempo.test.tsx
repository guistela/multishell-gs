import { expect, test } from 'claude-code/testing'

import { INICIO, comRepositorio, entrada, ligar, painel } from './motor'

const PAINEL = { plugin: 'csr-lens', component: 'Pane', requestId: 'csr-lens' } as const

// Quanto cada aba leva para desenhar numa sessão pesada: um diff grande,
// centenas de arquivos tocados, o projeto inteiro aberto. Um desenho lento
// passa do orçamento de tempo do hook e o painel fica sem desenho.
test('tempo de desenho de cada aba numa sessão pesada', async ($, on) => {
  const motor = ligar(on)
  comRepositorio(motor)
  const pastas = Array.from({ length: 40 }, (_, i) => entrada(`pasta${i}`, 'dir'))
  motor.listas['/proj'] = [...pastas, ...Array.from({ length: 60 }, (_, i) => entrada(`arquivo${i}.ts`, 'file'))]

  for (let i = 0; i < 40; i += 1) {
    motor.listas[`/proj/pasta${i}`] = Array.from({ length: 30 }, (_, j) => entrada(`f${j}.ts`, 'file'))
  }

  await $.session.start(INICIO)
  await $.turn.start({ text: 'refatore tudo', turnId: 't1' })
  const antigo = Array.from({ length: 900 }, (_, i) => `const linha${i} = calcular(${i}, 'texto ${i}') // comentário`).join('\n')
  const novo = antigo.replace(/calcular\((\d+)/g, (_, n: string) => `somar(${n}`)
  await $.tool.call({ tool: 'Write', file_path: '/proj/grande.ts', content: antigo })
  await $.tool.call({ tool: 'Edit', file_path: '/proj/grande.ts', old_string: antigo, new_string: novo })

  for (let i = 0; i < 300; i += 1) {
    await $.tool.call({ tool: 'Read', file_path: `/proj/pasta${i % 40}/f${i % 30}.ts` })
  }

  for (let i = 0; i < 60; i += 1) {
    await $.tool.call({ tool: 'Bash', command: `npm run passo-${i}` })
  }

  const tempos: string[] = []

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ ...PAINEL, surface, props: painel('dock', 120) })

    for (const aba of [2, 3, 4, 5, 6, 1]) {
      const inicio = performance.now()
      await ui.press({ key: `aba-${aba}` })
      await ui.drawn()
      tempos.push(`${surface} aba ${aba}: ${Math.round(performance.now() - inicio)} ms`)
    }

    // A árvore com o projeto inteiro e tudo expandido.
    await ui.press({ key: 'aba-5' })
    let inicio = performance.now()
    await ui.press({ key: 'arvore-toda' })
    await ui.drawn()
    tempos.push(`${surface} árvore inteira: ${Math.round(performance.now() - inicio)} ms`)
    inicio = performance.now()
    await ui.press({ key: 'arvore-expandir' })
    await ui.drawn()
    tempos.push(`${surface} árvore expandida: ${Math.round(performance.now() - inicio)} ms`)
    await ui.press({ key: 'arvore-toda' })
    await ui.press({ key: 'aba-1' })
    await ui.unmount()
  }

  ;(globalThis as unknown as { console: { log: (texto: string) => void } }).console.log(`@@TEMPOS ${tempos.join(' | ')}`)
  expect(tempos.length).toBeGreaterThan(0)
})

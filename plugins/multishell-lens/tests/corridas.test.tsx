// Cliques que chegam no meio de uma leitura lenta, e gravações que não mudam
// nada (cada uma redesenharia o painel, e no Desktop o clique seguinte cai
// num desenho já trocado).
import { expect, test } from 'claude-code/testing'

import { INICIO, comRepositorio, faixa, fimDoTurno, ligar, painel } from './motor'
import { noDesenho } from './achados'

const MOD = 'csr-lens'
const PAINEL = { plugin: MOD, component: 'Pane', requestId: MOD } as const
const FAIXA = { plugin: MOD, component: 'AbovePrompt' } as const
const ESCOLHIDO = '#264f78'

// O setTimeout existe no ambiente dos testes, mas não nos tipos do mod.
const { setTimeout: esperar } = globalThis as unknown as { setTimeout: (fazer: () => void, ms: number) => unknown }
const pausa = (ms: number) => new Promise<void>(resolve => esperar(resolve, ms))

const preso = () => {
  let soltar: () => void = () => undefined
  const promessa = new Promise<void>(resolve => {
    soltar = resolve
  })

  return { promessa, soltar: () => soltar() }
}

test('trocar de aba durante a leitura lenta do inventário: vale a última aba escolhida', async ($, on) => {
  const motor = ligar(on)
  await $.session.start(INICIO)
  const ui = await $.ui.mount({ ...PAINEL, surface: 'terminal', props: painel('dock', 110) })
  await ui.press({ key: 'aba-3' })

  const config = preso()
  motor.esperaConfig = config.promessa
  const lenta = ui.press({ key: 'aba-6' })
  await pausa(30)
  await ui.press({ key: 'aba-1' })
  config.soltar()
  await lenta
  await pausa(30)

  expect(await ui.find({ type: 'Text', text: 'Nenhum subagente rodando.' })).toBeDefined()
  await ui.unmount()
})

test('o diff do git de um arquivo anterior que chega depois não troca o escolhido', async ($, on) => {
  const motor = ligar(on)
  comRepositorio(motor)
  const lento = 'git diff HEAD --no-color --no-ext-diff -- src/a.ts'
  motor.comandos[lento] = 'diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,2 +1,3 @@\n-x\n+y\n+w\n z\n'
  motor.comandos['git diff --no-color --no-ext-diff --no-index -- /dev/null notas.md'] =
    'diff --git a/notas.md b/notas.md\nnew file mode 100644\n--- /dev/null\n+++ b/notas.md\n@@ -0,0 +1 @@\n+oi\n'
  await $.session.start(INICIO)

  const ui = await $.ui.mount({ ...PAINEL, surface: 'terminal', props: painel('dock', 110) })
  await ui.press({ key: 'aba-2' })
  await ui.press({ key: 'diff-git' })
  await ui.press({ key: 'proximo' })
  expect((await ui.find({ key: 'arquivo-/proj/notas.md' }))?.props.backgroundColor).toBe(ESCOLHIDO)

  // p volta a src/a.ts (git lento) e n vai a notas.md (rápido) antes de o lento acabar.
  const git = preso()
  motor.esperaComando[lento] = git.promessa
  const lenta = ui.press({ key: 'anterior' })
  await pausa(30)
  await ui.press({ key: 'proximo' })
  git.soltar()
  await lenta

  expect((await ui.find({ key: 'arquivo-/proj/notas.md' }))?.props.backgroundColor).toBe(ESCOLHIDO)
  expect((await ui.find({ type: 'Code' }))?.props.source).toBe('@@ -0,0 +1,1 @@\n+oi')
  expect(await ui.find({ type: 'Text', text: 'Lendo o diff…' })).toBeUndefined()
  await ui.unmount()
})

test('o que não muda não é gravado, e um clique no painel não redesenha as pílulas', async ($, on) => {
  const motor = ligar(on)
  comRepositorio(motor)
  const escritas: string[] = []
  on('state.set', (_, e, next) => {
    const ref = e as { key?: string; ref?: { key?: string } }
    escritas.push(String(ref.key ?? ref.ref?.key ?? '?'))

    return next(e)
  })
  let desenhosDaFaixa = 0
  on('ui.render', { component: 'AbovePrompt' }, (_, e, next) => {
    desenhosDaFaixa += 1

    return next(e)
  })
  await $.session.start(INICIO)

  motor.responder = e => ({ result: { filePath: e.file_path, structuredPatch: [] }, text: 'ok' })
  await $.turn.start({ text: 'edita', turnId: 't1' })
  await $.tool.call({ tool: 'Edit', file_path: '/proj/a.ts', old_string: 'x', new_string: 'y' })
  await $.tool.call({ tool: 'Edit', file_path: '/proj/b.ts', old_string: 'x', new_string: 'y' })
  const pilulas = await $.ui.mount({ ...FAIXA, surface: 'desktop', props: faixa() })
  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop', props: painel('dock', 110) })
  await ui.press({ key: 'aba-2' })
  await ui.press({ key: 'proximo' })
  expect((await ui.find({ key: 'arquivo-/proj/b.ts' }))?.props.backgroundColor).toBe(ESCOLHIDO)

  // n no último arquivo: nada muda.
  escritas.length = 0
  await ui.press({ key: 'proximo' })
  expect(escritas).not.toContain('ui')

  // O fim de um turno sem agentes não regrava a lista de agentes.
  escritas.length = 0
  await $.turn.complete(fimDoTurno('t1', 'feito', 1000))
  expect(escritas).not.toContain('agentes')

  // A mesma medição duas vezes: a segunda não grava nada do contexto.
  await $.session.measure({ ...motor.uso, changed: ['context'] })
  escritas.length = 0
  await $.session.measure({ ...motor.uso, changed: ['context'] })
  expect(escritas.filter(chave => chave === 'contexto' || chave === 'rodadas')).toEqual([])

  // Trocar de aba no painel não redesenha a linha de pílulas.
  const antes = desenhosDaFaixa
  await ui.press({ key: 'aba-5' })
  await ui.press({ key: 'aba-3' })
  expect(desenhosDaFaixa - antes).toBe(0)
  await ui.unmount()
  await pilulas.unmount()
})

test('Voltar de um comando aberto do detalhe do turno volta ao turno e depois à lista; turno sem texto continua o pedido', async ($, on) => {
  const motor = ligar(on)
  motor.responder = () => ({ result: { stdout: 'ok', stderr: '', interrupted: false }, text: 'ok' })
  await $.session.start(INICIO)
  await $.turn.start({ text: 'roda', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await $.turn.complete(fimDoTurno('t1', 'feito', 1000))
  // Uma continuação, sem texto digitado: não é um pedido novo.
  await $.turn.start({ text: '', turnId: 't2' })
  await $.turn.complete(fimDoTurno('t2', 'continuei', 500))

  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop', props: painel('dock', 100) })
  await ui.press({ key: 'aba-4' })
  expect(await ui.find({ key: 'ver-turno-2' })).toBeUndefined()
  // Os comandos ficam no detalhe do turno, não no cartão dele.
  await ui.press({ key: 'ver-turno-1' })
  const botao = (await ui.findAll({ type: 'Button' })).find(b => String(b.key).startsWith('ver-comando-'))
  await ui.press({ key: String(botao?.key) })
  await ui.press({ key: 'voltar' })
  // O cabeçalho do turno é um painel desenhado no Desktop.
  expect((await ui.findAll({ type: 'Svg' })).some(svg => String(svg.props.alt).startsWith('Turno 1 · '))).toBe(true)
  await ui.press({ key: 'voltar' })
  expect(await noDesenho(ui, /^Turnos/)).toBe(true)
  expect(await ui.find({ key: 'voltar' })).toBeUndefined()
  await ui.unmount()
})

test('o que um comando Bash muda entra na Sessão, com o comando, pelas fotos do git', async ($, on) => {
  const motor = ligar(on)
  comRepositorio(motor)
  motor.comandos['mktemp -d -t csr-lens'] = '/tmp/csr-lens.x1\n'
  motor.comandos['git rev-parse --path-format=absolute --git-path objects'] = '/proj/.git/objects\n'
  motor.comandos['mkdir -p /tmp/csr-lens.x1/objects'] = ''
  motor.comandos['git rev-parse --path-format=absolute --git-path index'] = '/proj/.git/index\n'
  motor.comandos['cp /proj/.git/index /tmp/csr-lens.x1/index'] = ''
  motor.comandos['git add -A -- .'] = ''
  motor.comandos['git write-tree'] = 'antes\n'
  motor.comandos['git -c core.quotePath=false diff --no-color --no-ext-diff --no-renames antes depois'] = [
    'diff --git a/src/a.ts b/src/a.ts',
    'index 1111111..2222222 100644',
    '--- a/src/a.ts',
    '+++ b/src/a.ts',
    '@@ -1,2 +1,2 @@',
    ' const a = 1',
    '-const b = 2',
    '+const b = 3',
    'diff --git a/gerado.txt b/gerado.txt',
    'new file mode 100644',
    'index 0000000..3333333',
    '--- /dev/null',
    '+++ b/gerado.txt',
    '@@ -0,0 +1 @@',
    '+oi',
    '',
  ].join('\n')
  // O comando muda os arquivos: a foto de depois é outra.
  motor.responder = () => {
    motor.comandos['git write-tree'] = 'depois\n'

    return { result: { stdout: '', stderr: '', interrupted: false }, text: 'ok' }
  }
  await $.session.start(INICIO)
  await $.turn.start({ text: 'troca o b', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', command: "sed -i 's/2/3/' src/a.ts && echo oi > gerado.txt" })
  // A foto de depois corre à parte: espera ela chegar.
  await pausa(50)

  const ui = await $.ui.mount({ ...PAINEL, surface: 'terminal', props: painel('dock', 110) })
  await ui.press({ key: 'aba-2' })
  // Nada no projeto: o índice e as cópias das fotos ficam na pasta temporária.
  expect(motor.rodados).toContain('cp /proj/.git/index /tmp/csr-lens.x1/index')
  expect(motor.rodados).toContain('git add -A -- .')
  expect(motor.rodados).not.toContain('git add -A')
  expect(await ui.find({ type: 'Text', text: /^ · 2 arquivos/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: "$ sed -i 's/2/3/' src/a.ts && echo oi > gerado.txt" })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Bash · turno 1/ })).toBeDefined()
  await ui.unmount()
})

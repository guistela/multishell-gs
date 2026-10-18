// O "motor" dos testes: debaixo do mod não há nada, então estes hooks
// respondem no lugar do Claude Code e anotam o que o mod pediu.

import type {
  AgentInfo,
  CommandInfo,
  ContextSkill,
  FsEntry,
  On,
  ProcessRunResult,
  RenderPropsOf,
  SessionMessage,
  SessionUsage,
  SessionUsageArgs,
  Settings,
  ToolCallResult,
  ToolInfo,
  TurnUsage,
} from 'claude-code'
import { mock } from 'claude-code/testing'
import type { MockClock } from 'claude-code/testing'

export const AGORA = 1_800_000_000_000
export const SESSAO = 'sessao-teste'
export const RAIZ = '/proj'
export const SUPERFICIES = ['terminal', 'desktop'] as const

export type Visto = {
  status: (string | undefined)[]
  // Cada pedido de $.session.usage, com o detalhamento pedido (ou 'simples').
  usos: string[]
  ordem: string[]
  abertos: { id: string; focus: boolean; closeOnEscape: boolean }[]
  fechados: string[]
  // O `e` que chegou ao fundo da cadeia em cada tool.call.
  chamadas: Readonly<Record<string, unknown>>[]
}

export type Motor = {
  relogio: MockClock
  visto: Visto
  uso: SessionUsage
  // O que a próxima resposta do modelo (turn.step) diz ter consumido.
  passo: TurnUsage | null
  arquivos: Record<string, string>
  agentes: AgentInfo[]
  // A transcrição que $.session.messages devolve para um subagente.
  mensagens: SessionMessage[]
  // Os agentes cuja transcrição a sessão não devolve (os de um workflow).
  semTranscricao: string[]
  // Sem lugar para o painel: $.ui.open responde isPlaced false.
  semLugar: boolean
  // O que cada comando do host devolve, pela linha de comando (argv unida por
  // espaços); sem entrada, sai com 128, como o git fora de um repositório.
  comandos: Record<string, string>
  // Cada comando que o mod rodou.
  rodados: string[]
  // O que $.fs.list devolve para cada pasta.
  listas: Record<string, FsEntry[]>
  // Em quantos tokens a conversa compacta sozinha (no detalhamento estimado).
  compactaEm?: number
  // O que a sessão tem carregado, para o inventário.
  sessao: {
    comandos: CommandInfo[]
    ferramentas: ToolInfo[]
    skills: ContextSkill[]
    // As configurações juntas (chave '') e de cada fonte.
    configuracoes: Record<string, Settings>
    env: Record<string, string>
  }
  // O que o fundo responde a cada tool.call; trocável por teste.
  responder: (e: Readonly<Record<string, unknown>>) => ToolCallResult | Promise<ToolCallResult>
  // Comandos e leituras das configurações que ficam presos até a promessa
  // resolver (para testar cliques que chegam no meio de uma leitura lenta).
  esperaComando: Record<string, Promise<unknown>>
  esperaConfig?: Promise<unknown>
}

const usoInicial = (): SessionUsage => ({
  startedAt: AGORA,
  context: { tokens: 100_000, window: 200_000, percent: 50 },
  rateLimits: [],
  cost: { usd: 1 },
})

// A estimativa ('summary') e a contagem exata ('full') diferem nas mensagens,
// para os testes saberem qual das duas o painel mostra.
const detalhe = (
  mensagens: number,
  skills: ContextSkill[] = [],
  compactaEm?: number,
): NonNullable<SessionUsage['context']['breakdown']> => ({
  ...(compactaEm === undefined ? {} : { autoCompactThreshold: compactaEm }),
  categories: [
    { name: 'System prompt', tokens: 4200, color: 'promptBorder', isDeferred: false, kind: 'used' },
    { name: 'Messages', tokens: mensagens, color: 'permission', isDeferred: false, kind: 'used' },
    { name: 'Free space', tokens: 42_800, color: 'inactive', isDeferred: false, kind: 'free' },
  ],
  totalTokens: 4200 + mensagens,
  maxTokens: 167_000,
  rawMaxTokens: 167_000,
  autocompactSource: 'model-default',
  percentage: 74,
  gridRows: [],
  model: 'opus',
  memoryFiles: [],
  mcpTools: [],
  agents: [],
  isAutoCompactEnabled: true,
  apiUsage: null,
  ...(skills.length === 0
    ? {}
    : {
        skills: {
          totalSkills: skills.length,
          includedSkills: skills.length,
          tokens: 100,
          skillFrontmatter: skills,
        },
      }),
})

export const ligar = (on: On): Motor => {
  const relogio = mock.clock(on, { now: AGORA })
  const motor: Motor = {
    relogio,
    visto: { status: [], usos: [], ordem: [], abertos: [], fechados: [], chamadas: [] },
    uso: usoInicial(),
    passo: null,
    arquivos: {},
    agentes: [],
    mensagens: [],
    semTranscricao: [],
    semLugar: false,
    comandos: {},
    rodados: [],
    listas: {},
    sessao: { comandos: [], ferramentas: [], skills: [], configuracoes: {}, env: {} },
    responder: e => ({ result: { tool: e.tool }, text: 'ok' }),
    esperaComando: {},
  }
  let abertos: string[] = []

  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.log', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.status', (_, e) => {
    motor.visto.status.push(e.text)

    return { value: undefined }
  })
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('agent.list', () => ({ value: motor.agentes }))
  on('session.messages', (_, e) => {
    motor.visto.ordem.push(`session.messages ${String(e.agentId ?? 'principal')}`)

    // A transcrição de um agente de workflow a sessão não devolve.
    if (e.agentId !== undefined && motor.semTranscricao.includes(e.agentId)) {
      return { value: { deny: `no conversation for ${e.agentId}` } } as never
    }

    return { value: motor.mensagens }
  })
  on('session.id', () => ({ value: SESSAO }))
  on('session.usage', (_, e: SessionUsageArgs) => {
    motor.visto.usos.push(e.breakdown ?? 'simples')

    return {
      value:
        e.breakdown === undefined
          ? motor.uso
          : {
              ...motor.uso,
              context: {
                ...motor.uso.context,
                breakdown: detalhe(
                  e.breakdown === 'full' ? 120_000 : 100_000,
                  motor.sessao.skills,
                  motor.compactaEm,
                ),
              },
            },
    }
  })
  on('fs.read', (_, e) => {
    motor.visto.ordem.push(`fs.read ${e.path}`)
    const texto = motor.arquivos[e.path]

    return texto === undefined ? { deny: `ENOENT: ${e.path}` } : { value: texto }
  })
  on('process.run', async (_, e) => {
    const linha = e.argv.join(' ')
    motor.rodados.push(linha)
    await motor.esperaComando[linha]
    const saida = motor.comandos[linha]
    const resultado: ProcessRunResult = {
      exitCode: saida === undefined ? 128 : 0,
      stdout: saida ?? '',
      stderr: saida === undefined ? 'fatal: not a git repository' : '',
      isStdoutTruncated: false,
      isStderrTruncated: false,
    }

    return { value: resultado }
  })
  // Os outros comandos (/plugin, /mcp...): o motor os roda e não diz nada.
  on('command.run', () => ({}))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('command.list', () => ({ value: motor.sessao.comandos }))
  on('tool.list', () => ({ value: motor.sessao.ferramentas }))
  on('settings.read', async (_, e) => {
    await motor.esperaConfig

    return { value: motor.sessao.configuracoes[e.source ?? ''] ?? {} }
  })
  on('env.get', (_, e) => ({ value: motor.sessao.env[e.name] }))
  on('fs.write', (_, e) => {
    motor.arquivos[e.path] = e.text

    return { value: undefined }
  })
  on('fs.list', (_, e) => {
    motor.visto.ordem.push(`fs.list ${e.path}`)

    return { value: motor.listas[e.path] ?? [] }
  })
  on('ui.open', (_, e) => {
    motor.visto.abertos.push({
      id: e.id,
      focus: e.focus === true,
      closeOnEscape: e.closeOnEscape === true,
    })
    abertos = [...abertos, e.id]

    return {
      value: motor.semLugar
        ? { isPlaced: false, reason: 'terminal estreito' }
        : { isPlaced: true },
    }
  })
  on('ui.close', (_, e) => {
    motor.visto.fechados.push(e.id)
    abertos = abertos.filter(id => id !== e.id)

    return { value: undefined }
  })
  on('ui.panes', () => ({
    value: abertos.map(id => ({
      id,
      title: id,
      isShown: true,
      isFocused: true,
      isPlaced: !motor.semLugar,
    })),
  }))
  on('tool.call', (_, e) => {
    const chamada = e as Readonly<Record<string, unknown>>
    motor.visto.ordem.push(`tool.call ${e.tool}`)
    motor.visto.chamadas.push(chamada)

    return motor.responder(chamada)
  })
  on('agent.spawn', (_, e) => ({
    model: 'claude-haiku-4-5-20251001',
    agentId: `ag-${e.tool_use_id}`,
  }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  // O SendMessage: entregue na caixa do destinatário; um nome que começa com
  // "ninguem" não é de ninguém, como no motor.
  on('session.send', (_, e) =>
    e.to.startsWith('ninguem')
      ? { isDelivered: false as const, reason: `No agent named '${e.to}' is reachable` }
      : { isDelivered: true as const },
  )
  // Uma resposta do modelo, sem pedaços: só o resultado, com o consumo.
  // eslint-disable-next-line require-yield
  on('turn.step', async function* (_, e) {
    return {
      turnId: e.turnId,
      index: e.index,
      answer: '',
      toolUses: [],
      stopReason: 'end_turn' as const,
      usage: motor.passo,
    }
  })
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  // O que o motor desenharia na faixa acima do prompt: nada.
  on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Box', children: [] }))

  return motor
}

// Uma chamada de dentro de um subagente: o motor carimba `agentId`, que o tipo
// de $.tool.call (o que um plugin passa) não declara.
export const doAgente = <T extends object>(entrada: T, agentId: string | undefined): T =>
  ({ ...entrada, agentId }) as T

export const INICIO = { cwd: RAIZ, surface: 'desktop', isInteractive: true } as const

// O que o Agent do loop principal decide sobre um subagente, para $.agent.spawn.
export const subagente = (id: string, tipo: string, descricao: string) => ({
  tool_use_id: id,
  prompt: `Tarefa de ${tipo}`,
  description: descricao,
  subagentType: tipo,
  provider: { plugin: 'engine', tier: 'core' } as const,
  parentModel: 'claude-opus-5-5',
  background: true,
  fork: false,
})

export const fimDoTurno = (
  turnId: string,
  resposta: string,
  durationMs: number,
  agentId?: string,
  reason: 'answer' | 'error' = 'answer',
) => ({
  answer: resposta,
  durationMs,
  isAborted: false,
  turnId,
  reason,
  ...(agentId === undefined ? {} : { agentId }),
})

export const painel = (
  placement: 'dock' | 'inline' = 'dock',
  bodyColumns = 60,
): RenderPropsOf['Pane'] => ({
  title: 'Lens',
  isFocused: true,
  bodyColumns,
  placement,
  scroll: { offset: 0, bodyRows: 40 },
  view: {},
})

export const faixa = (): RenderPropsOf['AbovePrompt'] => ({
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 100,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
})

export const COMANDO = {
  command: 'lens',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: true, columns: 160 },
} as const

// Um repositório de exemplo em /proj: o ramo, um arquivo alterado, um novo e
// um apagado, e as linhas somadas do alterado.
export const comRepositorio = (motor: Motor) => {
  motor.comandos['git rev-parse --show-toplevel'] = '/proj\n'
  motor.comandos['git status --porcelain=v1 -b -z --untracked-files=all'] =
    '## main...origin/main [ahead 1]\0 M src/a.ts\0?? notas.md\0D  velho.ts\0'
  motor.comandos['git diff HEAD --numstat -z'] = '3\t1\tsrc/a.ts\0'
}

export const entrada = (name: string, kind: 'file' | 'dir'): FsEntry => ({
  name,
  kind,
  size: 0,
  mtimeMs: 0,
  isLink: false,
})

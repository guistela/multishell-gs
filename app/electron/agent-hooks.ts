// Hooks do Claude Code que avisam o Multishell sozinhos.
//
// Com a chave `agent_notifications` ligada no espaço, o Multishell escreve dois
// hooks no `settings.json` do Claude Code daquele espaço. Aí o agente notifica
// sem ninguém pedir: `Notification` quando ele precisa de mim, `Stop` quando
// termina o turno.
//
// O arquivo é do usuário, não do app. Só mexemos no que tem a nossa marca.
// Módulo puro: entra JSON, sai JSON.

/** A marca que diz "este hook é nosso". Está no próprio comando. */
export const MULTISHELL_HOOK_MARK = "hook ";

/** Os eventos do Claude Code que viram notificação. */
export const HOOK_EVENTS = ["Notification", "Stop"] as const;
export type HookEvent = (typeof HOOK_EVENTS)[number];

/** O evento que pede permissão antes de a ferramenta rodar. Só ele aceita
 *  resposta de volta: `Notification` avisa, mas não decide nada. */
export const APPROVAL_EVENT = "PreToolUse";
/** Quais ferramentas passam pelo painel. Só as que mexem na máquina: pôr
 *  `Read` ou `Grep` aqui faria o agente parar a cada passo. */
export const APPROVAL_MATCHER = "Bash|Write|Edit|NotebookEdit";
/** Prazo da pergunta no painel. Depois disso o CLI não decide nada e o
 *  Claude Code volta a perguntar no terminal. */
export const APPROVAL_ASK_TIMEOUT_MS = 4 * 60 * 1000;
/** Prazo que o Claude Code dá ao hook, em segundos. Maior que o de cima:
 *  quem desiste primeiro tem de ser o nosso CLI, não ele. */
export const APPROVAL_TIMEOUT_S = 300;

type Evento = HookEvent | typeof APPROVAL_EVENT;

interface HookCmd { type: string; command: string; timeout?: number }
interface HookGroup { matcher?: string; hooks?: HookCmd[] }
type Settings = Record<string, any>;

function comando(cli: string, evento: Evento): string {
  return `${cli} ${MULTISHELL_HOOK_MARK}${evento}`;
}

/** Nosso hook termina em `hook <Evento>`. Qualquer caminho de CLI antes dele. */
function ehNosso(h: unknown, evento: Evento): boolean {
  const cmd = (h as HookCmd | null)?.command;
  return typeof cmd === "string" && cmd.trimEnd().endsWith(`${MULTISHELL_HOOK_MARK}${evento}`);
}

/** Cópia rasa do settings e cópia funda só do `hooks`: nunca alteramos o
 *  objeto de quem chamou. `tinha` diz se o arquivo já trazia a chave `hooks`. */
function base(settings: unknown): { s: Settings; hooks: Settings; tinha: boolean } {
  const valido = !!settings && typeof settings === "object" && !Array.isArray(settings);
  const src: Settings = valido ? { ...(settings as Settings) } : {};
  const tinha = "hooks" in src;
  const crus = src.hooks && typeof src.hooks === "object" && !Array.isArray(src.hooks) ? src.hooks : {};
  delete src.hooks;
  return { s: src, hooks: JSON.parse(JSON.stringify(crus)), tinha };
}

/** Grupos do evento, já sem o nosso hook. Grupo que fica vazio some. */
function semONosso(grupos: unknown, evento: Evento): HookGroup[] {
  if (!Array.isArray(grupos)) return [];
  const out: HookGroup[] = [];
  for (const g of grupos as HookGroup[]) {
    const restantes = (g?.hooks ?? []).filter((h) => !ehNosso(h, evento));
    if (restantes.length > 0) out.push({ ...g, hooks: restantes });
  }
  return out;
}

/** Liga os hooks. Idempotente: rodar de novo troca o caminho, não soma outro. */
export function withNotifyHooks(settings: Settings, cli: string): Settings {
  const { s, hooks } = base(settings);
  for (const evento of HOOK_EVENTS) {
    const grupos = semONosso(hooks[evento], evento);
    grupos.push({ matcher: "", hooks: [{ type: "command", command: comando(cli, evento) }] });
    hooks[evento] = grupos;
  }
  s.hooks = hooks;
  return s;
}

/** Desliga os hooks. Hook do usuário no mesmo evento continua lá. */
export function withoutNotifyHooks(settings: Settings): Settings {
  const { s, hooks, tinha } = base(settings);
  for (const evento of HOOK_EVENTS) {
    if (!(evento in hooks)) continue;
    const grupos = semONosso(hooks[evento], evento);
    if (grupos.length > 0) hooks[evento] = grupos;
    else delete hooks[evento];
  }
  // Arquivo que nunca teve `hooks` continua sem a chave.
  if (tinha) s.hooks = hooks;
  return s;
}

/** Liga a aprovação pelo painel. Idempotente, igual aos avisos. */
export function withApprovalHook(settings: Settings, cli: string): Settings {
  const { s, hooks } = base(settings);
  const grupos = semONosso(hooks[APPROVAL_EVENT], APPROVAL_EVENT);
  grupos.push({
    matcher: APPROVAL_MATCHER,
    hooks: [{ type: "command", command: comando(cli, APPROVAL_EVENT), timeout: APPROVAL_TIMEOUT_S }],
  });
  hooks[APPROVAL_EVENT] = grupos;
  s.hooks = hooks;
  return s;
}

/** Desliga a aprovação. Hook PreToolUse do usuário continua lá. */
export function withoutApprovalHook(settings: Settings): Settings {
  const { s, hooks, tinha } = base(settings);
  if (APPROVAL_EVENT in hooks) {
    const grupos = semONosso(hooks[APPROVAL_EVENT], APPROVAL_EVENT);
    if (grupos.length > 0) hooks[APPROVAL_EVENT] = grupos;
    else delete hooks[APPROVAL_EVENT];
  }
  if (tinha) s.hooks = hooks;
  return s;
}

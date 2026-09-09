import { useAppStore } from "../../store";
import type { Provider, Session, Space } from "../../types";
import { pty } from "../terminal/pty";

export type HandoffReason = "token_exhausted" | "role_transition" | "conflict_resolution";

export const HANDOFF_REASONS: Record<HandoffReason, string> = {
  token_exhausted: "Limite de Tokens / Quota esgotada no harness anterior",
  role_transition: "Passagem de bastão especialista (Arquiteto ➔ Dev ➔ QA)",
  conflict_resolution: "Resolução de conflito / nova abordagem",
};

/** Sugestões de preenchimento. São placeholder na UI, nunca vão no prompt sozinhas. */
export const OBJECTIVE_PLACEHOLDER = "ex: terminar o guardrail de comandos e rodar os testes";
export const NEXT_ACTIONS_PLACEHOLDER = "ex: 1. ler o diff atual  2. corrigir o teste que falha";

export interface HandoffContext {
  origin: Session | null | undefined;
  originProvider?: Provider | null;
  space: Space | null | undefined;
  targetName: string;
  reason: HandoffReason;
  objective?: string;
  nextActions?: string;
}

/** Texto único de handoff, usado tanto pela aba quanto pelo menu de contexto das abas de terminal. */
export function buildHandoffPrompt(ctx: HandoffContext): string {
  const originName = ctx.originProvider?.name || ctx.origin?.title || "Terminal anterior";
  const spacePath = ctx.origin?.cwd || ctx.space?.base_path || (ctx.space ? `~/.multishell/profiles/${ctx.space.directory_name}` : "—");
  const lines = [
    "=== PROTOCOLO DE CONTINUIDADE MULTIAGENTE (HANDOFF) ===",
    `Origem: [${originName}] -> Destino: [${ctx.targetName}]`,
    `Espaço: ${ctx.space?.name ?? "—"} (${spacePath})`,
    `Motivo do handoff: ${HANDOFF_REASONS[ctx.reason]}`,
  ];

  // Só entra o que o usuário escreveu: texto genérico inventado atrapalha mais do que ajuda.
  const objective = ctx.objective?.trim();
  if (objective) lines.push("", "## Objetivo da tarefa:", objective);
  const next = ctx.nextActions?.trim();
  if (next) lines.push("", "## Próximas ações imediatas:", next);

  lines.push("", "Continue a tarefa a partir deste ponto no mesmo diretório de trabalho, sem refazer o que já foi concluído.");
  return lines.join("\n");
}

/**
 * Injeta o pacote de handoff só depois que o harness sobe.
 * Terminal.tsx zera `auto_start_harness` ao lançar o CLI; o atraso extra dá tempo do prompt do agente aparecer.
 */
export function deliverHandoffWhenHarnessReady(
  sessionId: string,
  prompt: string,
  opts: { readyDelayMs?: number; timeoutMs?: number } = {}
): Promise<void> {
  const readyDelayMs = opts.readyDelayMs ?? 2500;
  const timeoutMs = opts.timeoutMs ?? 20000;
  return new Promise<void>((resolve) => {
    let sent = false;
    const isReady = () => {
      const s = useAppStore.getState().sessions.find((x) => x.id === sessionId);
      return Boolean(s?.harness_running && !s.auto_start_harness);
    };
    const send = () => {
      if (sent) return;
      sent = true;
      unsubscribe();
      clearTimeout(timer);
      setTimeout(() => {
        void handoffToSession(sessionId, prompt).finally(resolve);
      }, readyDelayMs);
    };
    const unsubscribe = useAppStore.subscribe(() => {
      if (isReady()) send();
    });
    const timer = setTimeout(() => {
      if (sent) return;
      sent = true;
      unsubscribe();
      useAppStore.setState({ notice: { message: "O agente não iniciou a tempo. Inicie-o no terminal e tente enviar o contexto novamente.", retry: () => { void handoffToSession(sessionId, prompt); } } });
      resolve();
    }, timeoutMs);
    if (isReady()) send();
  });
}

/**
 * Um prompt com quebras de linha viraria várias mensagens no CLI do agente
 * (e vários comandos num shell). Vai tudo em uma linha só.
 */
export function toSingleLine(prompt: string): string {
  return prompt.split("\n").map((l) => l.trim()).filter(Boolean).join(" · ");
}

export interface HandoffResult {
  delivered: boolean;
  /** "no_harness": o destino é um shell puro; escrever ali executaria comandos. */
  reason?: "no_harness" | "not_found" | "write_failed";
}

/**
 * Passa o bastão para um terminal já aberto: escreve o contexto e foca nele.
 * Só entrega em terminal com harness rodando — num shell puro o texto viraria comando.
 */
export async function handoffToSession(targetSessionId: string, prompt: string): Promise<HandoffResult> {
  const target = useAppStore.getState().sessions.find((s) => s.id === targetSessionId);
  if (!target) {
    useAppStore.setState({ notice: { message: "O terminal de destino foi fechado. Escolha outro destino para enviar o contexto." } });
    return { delivered: false, reason: "not_found" };
  }
  if (!target.harness_running || target.exit_code != null) {
    useAppStore.setState({ notice: { message: "Inicie o agente no terminal antes de enviar o contexto.", retry: () => { void handoffToSession(targetSessionId, prompt); } } });
    return { delivered: false, reason: "no_harness" };
  }

  try {
    await pty.write(targetSessionId, toSingleLine(prompt) + "\n");
  } catch {
    useAppStore.setState({ notice: { message: "Falha ao enviar contexto ao terminal. Tente novamente.", retry: () => { void handoffToSession(targetSessionId, prompt); } } });
    return { delivered: false, reason: "write_failed" };
  }
  useAppStore.setState({ notice: { message: "Contexto enviado ao terminal. Confira a resposta do agente." } });
  useAppStore.getState().selectSession(targetSessionId);
  useAppStore.getState().setWorkspaceTab("terminals");
  return { delivered: true };
}

/** Abre outro harness no mesmo espaço e entrega o contexto quando o agente estiver de pé. */
export function handoffToNewAgent(opts: {
  spaceId: string;
  cwd?: string | null;
  provider: Provider;
  bypass: boolean;
  prompt: string;
}): Session {
  const session = useAppStore.getState().addSession({
    space_id: opts.spaceId,
    cwd: opts.cwd ?? null,
    title: opts.provider.name,
    provider_id: opts.provider.id,
    bypass: opts.bypass,
    auto_start_harness: true,
  });
  void deliverHandoffWhenHarnessReady(session.id, opts.prompt);
  useAppStore.getState().selectSession(session.id);
  useAppStore.getState().setWorkspaceTab("terminals");
  return session;
}

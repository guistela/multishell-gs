import { useAppStore } from "../../store";
import type { Provider, Session } from "../../types";
import { deliverHandoffWhenHarnessReady, toSingleLine } from "./handoff";
import { pty } from "../terminal/pty";
import { cleanSelection } from "../terminal/selection";

/** Instrução que acompanha o trecho. O agente de destino não viu o terminal de origem. */
export const CONVERSATION_INSTRUCTION =
  "Analise o trecho abaixo, copiado de outro terminal deste espaço, e diga qual é o próximo passo.";

/** Trecho muito grande vira ruído no prompt do agente. */
export const SELECTION_MAX = 4000;

export function buildConversationPrompt(opts: {
  selection: string;
  originTitle: string;
  spaceName?: string | null;
  instruction?: string;
}): string {
  const trecho = cleanSelection(opts.selection).trim().slice(0, SELECTION_MAX);
  return toSingleLine(
    [
      opts.instruction?.trim() || CONVERSATION_INSTRUCTION,
      `Origem: terminal "${opts.originTitle}"${opts.spaceName ? ` do espaço "${opts.spaceName}"` : ""}.`,
      "--- trecho ---",
      trecho,
      "--- fim do trecho ---",
    ].join("\n")
  );
}

export interface ConversationResult {
  delivered: boolean;
  reason?: "no_harness" | "not_found";
  sessionId?: string;
}

/** Manda o trecho para um agente já rodando em outro terminal do espaço. */
export async function startConversationInSession(opts: {
  targetSessionId: string;
  prompt: string;
}): Promise<ConversationResult> {
  const target = useAppStore.getState().sessions.find((s) => s.id === opts.targetSessionId);
  if (!target) return { delivered: false, reason: "not_found" };
  // Num shell puro o texto viraria comando; a conversa só faz sentido com agente de pé.
  if (!target.harness_running) return { delivered: false, reason: "no_harness" };

  await pty.write(target.id, opts.prompt + "\n").catch(() => {});
  useAppStore.getState().selectSession(target.id);
  return { delivered: true, sessionId: target.id };
}

/** Abre outro agente no mesmo espaço e entrega o trecho quando o harness sobe. */
export function startConversationInNewAgent(opts: {
  spaceId: string;
  provider: Provider;
  prompt: string;
}): Session {
  const session = useAppStore.getState().addSession({
    space_id: opts.spaceId,
    title: opts.provider.name,
    provider_id: opts.provider.id,
    bypass: false,
    auto_start_harness: true,
  });
  void deliverHandoffWhenHarnessReady(session.id, opts.prompt);
  useAppStore.getState().selectSession(session.id);
  return session;
}

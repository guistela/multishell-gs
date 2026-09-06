import { useEffect, useState } from "react";

/**
 * Estado do agente deduzido do fluxo do PTY. Enquanto o harness trabalha ele
 * escreve sem parar (spinner, tokens); ao devolver o prompt, o output silencia.
 * É inferência sobre dado real, não introspecção do CLI.
 */
export type AgentState = "working" | "idle" | "off";

/** Silêncio maior que isto conta como "terminou e está esperando". */
export const IDLE_AFTER_MS = 1500;

const lastOutput = new Map<string, number>();

/** Chamado pelo Terminal a cada chunk recebido. Barato de propósito: sem estado React. */
export function markOutput(sessionId: string, at: number = Date.now()): void {
  lastOutput.set(sessionId, at);
}

export function forgetSession(sessionId: string): void {
  lastOutput.delete(sessionId);
}

export function agentState(sessionId: string, harnessRunning: boolean, now: number = Date.now()): AgentState {
  if (!harnessRunning) return "off";
  const last = lastOutput.get(sessionId);
  if (last == null) return "idle";
  return now - last < IDLE_AFTER_MS ? "working" : "idle";
}

/** Só para teste: zera o rastreamento. */
export function resetActivity(): void {
  lastOutput.clear();
}

const TICK_MS = 500;

/** Reavalia os estados em intervalo fixo: o output em si não passa pelo React. */
export function useAgentStates(sessions: Array<{ id: string; harness_running: boolean }>): Record<string, AgentState> {
  const [, tick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const now = Date.now();
  const states: Record<string, AgentState> = {};
  for (const s of sessions) states[s.id] = agentState(s.id, s.harness_running, now);
  return states;
}

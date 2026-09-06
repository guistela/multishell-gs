import { useEffect, useState } from "react";

/**
 * Estado do agente deduzido do fluxo do PTY. Enquanto o harness trabalha ele
 * escreve sem parar (spinner, tokens); ao devolver o prompt, o output silencia.
 * É inferência sobre dado real, não introspecção do CLI.
 */
export type AgentState = "working" | "idle" | "off";

/** Silêncio maior que isto conta como "terminou e está esperando". */
export const IDLE_AFTER_MS = 3000;

/** CPU acima disso na árvore do terminal significa agente processando, mesmo calado. */
export const BUSY_CPU_PERCENT = 8;

/** CPU por sessão, alimentada pelas métricas do processo main. */
const cpuBySession = new Map<string, number>();

export function setSessionCpu(sessionId: string, cpuPercent: number | null): void {
  if (cpuPercent == null) cpuBySession.delete(sessionId);
  else cpuBySession.set(sessionId, cpuPercent);
}

const lastOutput = new Map<string, number>();

/** Chamado pelo Terminal a cada chunk recebido. Barato de propósito: sem estado React. */
export function markOutput(sessionId: string, at: number = Date.now()): void {
  lastOutput.set(sessionId, at);
}

export function forgetSession(sessionId: string): void {
  lastOutput.delete(sessionId);
  cpuBySession.delete(sessionId);
}

export function agentState(sessionId: string, harnessRunning: boolean, now: number = Date.now()): AgentState {
  if (!harnessRunning) return "off";
  // Dois sinais: o agente escrevendo agora, ou a árvore dele queimando CPU em silêncio.
  const last = lastOutput.get(sessionId);
  if (last != null && now - last < IDLE_AFTER_MS) return "working";
  if ((cpuBySession.get(sessionId) ?? 0) >= BUSY_CPU_PERCENT) return "working";
  return "idle";
}

/** Só para teste: zera o rastreamento. */
export function resetActivity(): void {
  lastOutput.clear();
  cpuBySession.clear();
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

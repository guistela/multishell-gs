import { api } from "../../api";
import { useAppStore } from "../../store";
import type { Session } from "../../types";

/**
 * Fallback do cwd via `pty_cwd`, chamado só no `beforeunload`.
 * Em uso normal o cwd chega por OSC 7 (ver Terminal.tsx).
 * Lê o cwd de cada sessão viva e grava só o que mudou. Persiste no máximo 1x.
 */
export async function pollCwds(): Promise<void> {
  const live = useAppStore.getState().sessions.filter((s) => s.exit_code === undefined || s.exit_code === null);
  const results = await Promise.all(
    live.map(async (s) => [s.id, await api.ptyCwd(s.id).catch(() => undefined)] as const),
  );
  const now = new Map(useAppStore.getState().sessions.map((s) => [s.id, s]));
  const patches: Record<string, Partial<Session>> = {};
  for (const [id, cwd] of results) {
    const s = now.get(id);
    if (!s || cwd === undefined || cwd === null || cwd === s.cwd) continue;
    patches[id] = { cwd };
  }
  if (Object.keys(patches).length > 0) useAppStore.getState().patchSessions(patches);
}

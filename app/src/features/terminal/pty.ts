import { bridge, invoke, type PtyExit } from "../../bridge";

export type { PtyExit };

export interface SpawnRequest {
  session_id: string;
  shell: string;
  shell_args?: string[];
  cwd?: string | null;
  env?: Record<string, string>;
  inherit_env?: boolean;
  cols?: number;
  rows?: number;
}

/** `pty_spawn` é idempotente: sessão já viva → `attached: true` + replay do ring buffer. */
export interface SpawnResult {
  attached: boolean;
  replay?: Uint8Array;
}

const encoder = new TextEncoder();

export const pty = {
  spawn: async (req: SpawnRequest): Promise<SpawnResult> => (await invoke<SpawnResult | undefined>("pty_spawn", { req })) ?? { attached: false },
  /** O IPC do Electron serializa Uint8Array (structured clone): vai direto, sem Array.from. */
  write: (sessionId: string, data: string) => invoke<void>("pty_write", { sessionId, data: encoder.encode(data) }),
  resize: (sessionId: string, cols: number, rows: number) =>
    invoke<void>("pty_resize", { sessionId, cols, rows }),
  kill: (sessionId: string) => invoke<void>("pty_kill", { sessionId }),
  defaultShell: () => invoke<string>("default_shell"),
  /** Síncrono: devolve o unsubscribe. */
  onOutput: (sessionId: string, cb: (bytes: Uint8Array) => void): (() => void) => bridge().onPtyOutput(sessionId, cb),
  onExit: (cb: (exit: PtyExit) => void): (() => void) => bridge().onPtyExit(cb),
};

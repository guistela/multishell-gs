// Ponte com o preload do Electron (`contextBridge.exposeInMainWorld("multishell", ...)`).
// Único ponto do renderer que conhece `window.multishell`.

export type ShortcutAction = "new" | "close" | "settings" | "search";

export interface PtyExit {
  session_id: string;
  code: number | null;
}

export interface SessionReattached { session_id: string }
export interface SessionDrag { session_id: string; detached: boolean; action: "detach" | "reattach" | "none" }
export interface StoreChanged { name: string }

export interface MultishellBridge {
  /** Canal IPC = nome do command (snake_case). Args chegam ao main como um objeto único. */
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
  onPtyOutput(sessionId: string, cb: (bytes: Uint8Array) => void): () => void;
  onPtyExit(cb: (exit: PtyExit) => void): () => void;
  onShortcut(cb: (action: ShortcutAction) => void): () => void;
  /** Main fechou a janela destacada (botão do sistema ou session_reattach). Só a janela principal recebe. */
  onSessionReattached(cb: (e: SessionReattached) => void): () => void;
  /** Outra janela fez store_set(name). */
  onStoreChanged(cb: (e: StoreChanged) => void): () => void;
  onSessionDrag(cb: (ev: SessionDrag | null) => void): () => void;
  platform: "darwin" | "win32" | "linux";
}

declare global {
  interface Window {
    multishell: MultishellBridge;
  }
}

export const BRIDGE_MISSING = "window.multishell ausente: o preload do Electron não carregou.";

export function hasBridge(): boolean {
  return typeof window !== "undefined" && window.multishell != null;
}

export function bridge(): MultishellBridge {
  if (!hasBridge()) throw new Error(BRIDGE_MISSING);
  return window.multishell;
}

/** `bridge().invoke` como Promise sempre: bridge ausente vira rejeição, não throw síncrono. */
export async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const b = bridge();
  return args === undefined ? b.invoke<T>(command) : b.invoke<T>(command, args);
}

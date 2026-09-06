// Instala um `window.multishell` falso para os testes do renderer.
// Importar este módulo já instala a bridge (platform "darwin").
import { vi } from "vitest";
import type { MultishellBridge, SessionDrag, PtyExit, SessionReattached, ShortcutAction, StoreChanged } from "../bridge";
import type { Provider, Space } from "../types";

export const invokeMock = vi.fn();
export const sessionDragListeners = new Set<(e: SessionDrag | null) => void>();

/** Callbacks registrados via onPtyOutput, por session_id. */
export const outputListeners = new Map<string, Set<(bytes: Uint8Array) => void>>();
export const exitListeners = new Set<(exit: PtyExit) => void>();
export const shortcutListeners = new Set<(action: ShortcutAction) => void>();
export const sessionReattachedListeners = new Set<(e: SessionReattached) => void>();
export const storeChangedListeners = new Set<(e: StoreChanged) => void>();

export function makeBridge(overrides: Partial<MultishellBridge> = {}): MultishellBridge {
  return {
    invoke: (...args: unknown[]) => invokeMock(...args),
    onPtyOutput(sessionId, cb) {
      const set = outputListeners.get(sessionId) ?? new Set();
      set.add(cb);
      outputListeners.set(sessionId, set);
      return () => { set.delete(cb); };
    },
    onPtyExit(cb) {
      exitListeners.add(cb);
      return () => { exitListeners.delete(cb); };
    },
    onShortcut(cb) {
      shortcutListeners.add(cb);
      return () => { shortcutListeners.delete(cb); };
    },
    onSessionReattached(cb) {
      sessionReattachedListeners.add(cb);
      return () => { sessionReattachedListeners.delete(cb); };
    },
    onSessionDrag(cb) { sessionDragListeners.add(cb); return () => { sessionDragListeners.delete(cb); }; },
    onStoreChanged(cb) {
      storeChangedListeners.add(cb);
      return () => { storeChangedListeners.delete(cb); };
    },
    platform: "darwin",
    ...overrides,
  };
}

export function installBridge(overrides: Partial<MultishellBridge> = {}): MultishellBridge {
  const b = makeBridge(overrides);
  Object.defineProperty(window, "multishell", { value: b, writable: true, configurable: true });
  return b;
}

export function uninstallBridge(): void {
  delete (window as { multishell?: MultishellBridge }).multishell;
}

/** Zera invokeMock e todos os listeners; reinstala a bridge padrão. */
export function resetBridge(): void {
  invokeMock.mockReset();
  outputListeners.clear();
  exitListeners.clear();
  shortcutListeners.clear();
  sessionReattachedListeners.clear();
  storeChangedListeners.clear();
  sessionDragListeners.clear();
  installBridge();
}

export function emitPtyOutput(sessionId: string, bytes: number[] | Uint8Array): void {
  outputListeners.get(sessionId)?.forEach((cb) => cb(new Uint8Array(bytes)));
}

export function emitPtyExit(exit: PtyExit): void {
  exitListeners.forEach((cb) => cb(exit));
}

export function emitShortcut(action: ShortcutAction): void {
  shortcutListeners.forEach((cb) => cb(action));
}

export function emitSessionReattached(sessionId: string): void {
  sessionReattachedListeners.forEach((cb) => cb({ session_id: sessionId }));
}

export function emitStoreChanged(name: string): void {
  storeChangedListeners.forEach((cb) => cb({ name }));
}

installBridge();

export const security = { load_user_shell_profile: false, share_keychain: false, share_ssh: false, share_git_config: false, inherit_process_env: false };
export const spaceA: Space = { id: "sp-a", name: "Pessoal", color_hex: "#ff0000", directory_name: "personal", custom_env: [], security, created_at: "2026-01-01T00:00:00Z" };
export const spaceB: Space = { id: "sp-b", name: "Trabalho", color_hex: "#00ff00", directory_name: "work", custom_env: [], security, created_at: "2026-01-01T00:00:00Z" };
export const claude: Provider = { id: "pv-claude", name: "Claude Code", executable: "claude", args: [], bypass_args: ["--dangerously-skip-permissions"], config_env_key: "CLAUDE_CONFIG_DIR", extra_env: [], icon: "sparkles", resume_args: ["--continue"] };

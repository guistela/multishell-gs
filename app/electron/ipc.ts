// Nomes de canais IPC = nomes dos commands do contrato (docs/CONTRATO-API.md).
// Um lugar só. O renderer chama `window.multishell.invoke(<command>, args)`.

export const COMMANDS = [
  "store_get",
  "store_set",
  "spaces_list",
  "space_save",
  "space_delete",
  "space_open_folder",
  "path_open",
  "directory_pick",
  "space_spawn_plan",
  "providers_list",
  "provider_save",
  "provider_delete",
  "provider_presets",
  "provider_command_line",
  "provider_resume_line",
  "secret_set",
  "secret_get",
  "secret_delete",
  "migrate_from_swift",
  "pty_spawn",
  "pty_write",
  "pty_resize",
  "pty_kill",
  "pty_cwd",
  "pty_attach",
  "session_drag_preview",
  "session_drop",
  "session_detach",
  "session_reattach",
  "window_role",
  "default_shell",
  "log_front",
] as const;

export type Command = (typeof COMMANDS)[number];

/** Eventos main → renderer. */
export const EVENTS = {
  ptyOutput: "pty-output",
  ptyExit: "pty-exit",
  shortcut: "shortcut",
  sessionReattached: "session-reattached",
  storeChanged: "store-changed",
  sessionDrag: "session-drag",
} as const;

export interface PtyOutputEvent { session_id: string; data: Uint8Array }
export interface PtyExitEvent { session_id: string; code: number | null }
export type Shortcut = "new" | "close" | "settings" | "search";
export interface SessionReattachedEvent { session_id: string }
export interface StoreChangedEvent { name: string }
/** Papel da janela chamadora (`window_role`). */
export type WindowRole = { role: "main" } | { role: "detached"; session_id: string };
/** Retorno de `pty_spawn` (fase 8: idempotente). */
export type SpawnResult = { attached: false } | { attached: true; replay: Uint8Array };

export interface SessionDragEvent { session_id: string; detached: boolean; action: "detach" | "reattach" | "none" }

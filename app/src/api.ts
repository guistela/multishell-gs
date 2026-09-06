// Wrappers tipados dos commands IPC. Um lugar só para os nomes.
import { invoke } from "./bridge";
import type { MigrationReport, Provider, Space, SpawnPlan, WindowRole } from "./types";

export const api = {
  storeGet: <T,>(name: string) => invoke<T | null>("store_get", { name }),
  storeSet: (name: string, value: unknown) => invoke<void>("store_set", { name, value }),

  pickDirectory: (defaultPath?: string) => invoke<string | null>("directory_pick", { defaultPath }),
  spacesList: () => invoke<Space[]>("spaces_list"),
  spaceSave: (space: Space) => invoke<Space>("space_save", { space }),
  spaceDelete: (spaceId: string) => invoke<void>("space_delete", { spaceId }),
  spaceOpenFolder: (spaceId: string) => invoke<void>("space_open_folder", { spaceId }),
  pathOpen: (path: string) => invoke<void>("path_open", { path }),
  spaceSpawnPlan: (spaceId: string, providerId: string | null, cwd: string | null) =>
    invoke<SpawnPlan>("space_spawn_plan", { spaceId, providerId, cwd }),

  providersList: () => invoke<Provider[]>("providers_list"),
  providerSave: (provider: Provider) => invoke<Provider>("provider_save", { provider }),
  providerDelete: (providerId: string) => invoke<void>("provider_delete", { providerId }),
  providerPresets: () => invoke<Provider[]>("provider_presets"),
  providerCommandLine: (provider: Provider, bypass: boolean) =>
    invoke<string>("provider_command_line", { provider, bypass }),
  providerResumeLine: (provider: Provider, bypass: boolean) =>
    invoke<string>("provider_resume_line", { provider, bypass }),
  ptyCwd: (sessionId: string) => invoke<string | null>("pty_cwd", { sessionId }),
  /** Registra esta janela como destino dos eventos da sessão. Devolve o replay do ring buffer. */
  ptyAttach: (sessionId: string) => invoke<Uint8Array>("pty_attach", { sessionId }),
  /** Uso real das sessões vivas. Sem `sessionId`, devolve todas. */
  sessionMetrics: (sessionId?: string) => invoke<SessionMetrics[]>("session_metrics", { sessionId }),
  sessionDragPreview: (sessionId: string | null) => invoke<void>("session_drag_preview", { sessionId }),
  sessionDrop: (sessionId: string) => invoke<"detach" | "reattach" | "none">("session_drop", { sessionId }),
  sessionDetach: (sessionId: string) => invoke<void>("session_detach", { sessionId }),
  sessionReattach: (sessionId: string) => invoke<void>("session_reattach", { sessionId }),
  windowRole: () => invoke<WindowRole>("window_role"),

  secretSet: (spaceId: string, key: string, value: string) => invoke<void>("secret_set", { spaceId, key, value }),
  secretGet: (spaceId: string, key: string) => invoke<string | null>("secret_get", { spaceId, key }),
  secretDelete: (spaceId: string, key: string) => invoke<void>("secret_delete", { spaceId, key }),

  logFront: (level: "error" | "warn", message: string) => invoke<void>("log_front", { level, message }),

  migrateFromSwift: () => invoke<MigrationReport>("migrate_from_swift"),


  /** Guarda o conteúdo atual dos arquivos que o git aponta como modificados em `cwd`. */
  snapshotCreate: (spaceId: string, label: string, cwd: string) =>
    invoke<SnapshotCreateResult>("snapshot_create", { spaceId, label, cwd }),
  snapshotList: (spaceId: string) => invoke<SnapshotMeta[]>("snapshot_list", { spaceId }),
  /** Sobrescreve os arquivos de `cwd` com o conteúdo do snapshot. */
  snapshotRestore: (spaceId: string, snapshotId: string, cwd: string) =>
    invoke<SnapshotRestoreResult>("snapshot_restore", { spaceId, snapshotId, cwd }),
  snapshotDelete: (spaceId: string, snapshotId: string) => invoke<void>("snapshot_delete", { spaceId, snapshotId }),

  /** Sessões de login das CLIs dentro do espaço. Nunca devolve token, só identidade. */
  authSessions: (spaceId: string) => invoke<AuthSessionStatus[]>("auth_sessions", { spaceId }),
  mcpList: (spaceId: string) => invoke<McpServer[]>("mcp_list", { spaceId }),
  /** Persiste a lista e regrava o `.mcp.json` que os harnesses leem. */
  mcpSave: (spaceId: string, servers: McpServer[]) => invoke<McpSaveResult>("mcp_save", { spaceId, servers }),
};

/** Estado de login de uma CLI dentro do espaço. */
export interface AuthSessionStatus {
  id: string;
  name: string;
  installed: boolean;
  logged_in: boolean;
  account: string | null;
  detail: string | null;
  /** Comando que a interface digita no terminal para entrar. */
  login_command: string;
  logout_command: string | null;
}

/** Servidor MCP configurado num espaço. */
export interface McpServer {
  id: string;
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  enabled: boolean;
}

export interface McpSaveResult {
  /** Caminho do manifesto gravado. */
  path: string;
  enabled: number;
}

/** Bytes trafegados numa sessão viva. Não há contagem de tokens: o main não parseia a saída dos CLIs. */
export interface SessionMetrics {
  session_id: string;
  /** Raiz da árvore de processos da sessão. */
  pid: number;
  bytes_in: number;
  bytes_out: number;
  started_at: string;
  /** RSS do shell mais toda a árvore de filhos. null quando não deu para medir. */
  memory_bytes: number | null;
  /** CPU somada da árvore. Mostra agente processando mesmo em silêncio. */
  cpu_percent: number | null;
}

export interface SnapshotMeta {
  id: string;
  spaceId: string;
  timestamp: string;
  label: string;
  fileCount: number;
}

/** `skipped` explica cada arquivo que ficou de fora (binário ou grande demais). */
export interface SnapshotCreateResult extends SnapshotMeta {
  skipped: string[];
  truncated: boolean;
}

export interface SnapshotRestoreResult {
  id: string;
  cwd: string;
  restored: number;
  files: string[];
}

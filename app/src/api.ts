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
};

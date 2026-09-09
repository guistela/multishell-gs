// Espelho de docs/CONTRATO-API.md. Não mude nomes sem mudar o Rust.
export interface EnvVar { key: string; value: string; is_secret: boolean }

export interface Provider {
  id: string; name: string; executable: string;
  args: string[]; bypass_args: string[];
  config_env_key: string | null; extra_env: EnvVar[]; icon: string;
  resume_args: string[];
}

export interface SpaceSecurity {
  load_user_shell_profile: boolean;
  share_keychain: boolean;
  share_ssh: boolean;
  share_git_config: boolean;
  inherit_process_env: boolean;
  block_destructive_commands?: boolean;
}

export interface Space {
  id: string; name: string; color_hex: string; directory_name: string;
  base_path?: string | null;
  custom_env: EnvVar[]; security: SpaceSecurity; created_at: string;
}

export interface SpawnPlan {
  shell: string; shell_args: string[]; cwd: string | null;
  /** Sem os valores de segredo: o main os injeta no `pty_spawn`. */
  env: Record<string, string>; inherit_env: boolean;
  /** Chaves marcadas como segredo no espaço/provider. Só os nomes chegam aqui. */
  secret_keys: string[];
}

export interface TerminalSettings {
  shell: string | null; default_cwd: string | null;
  font_family: string; font_size: number; theme: string; language: "pt-BR" | "en";
}

export interface Session {
  id: string; title: string; space_id: string; provider_id: string | null;
  bypass: boolean; cwd: string | null; harness_running: boolean; exit_code?: number | null;
  auto_start_harness?: boolean;
  /** Tema xterm só deste terminal. Ausente = usa o tema global das configurações. */
  theme?: string;
  /** true enquanto vive numa janela própria (Fase 8). Persiste em ui-state. */
  detached: boolean;
}

export interface WindowRole { role: "main" | "detached"; session_id?: string }

export interface MigrationReport { spaces: number; providers: number; sessions: number; notes: string[] }

export const LAYOUT_MODES = ["single", "list", "grid", "vertical", "horizontal"] as const;
export type LayoutMode = (typeof LAYOUT_MODES)[number];



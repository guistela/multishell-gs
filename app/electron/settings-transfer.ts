// Exportar e importar configurações entre máquinas.
// Puro: quem lê, grava e abre diálogo é o handler.
// Segredo nunca sai: valores `is_secret` e todo env de MCP vão vazios.

import type { McpServerConfig } from "./mcp.js";
import { normalizeProvider, type EnvVar, type Provider } from "./provider.js";
import { makeDirectoryName, normalizeSpace, type Space } from "./space.js";

export const EXPORT_FORMAT = "multishell-settings";
export const EXPORT_VERSION = 1;

/** Só aparência. Shell e pasta inicial dependem da máquina. */
const PORTABLE_SETTINGS = ["font_family", "font_size", "theme", "language"] as const;

export interface TransferData {
  spaces: Space[];
  providers: Provider[];
  layouts: Record<string, unknown>;
  mcp: Record<string, McpServerConfig[]>;
  settings: Record<string, unknown> | null;
}

export interface ExportFile {
  format: typeof EXPORT_FORMAT;
  version: number;
  exported_at: string;
  app_version: string;
  spaces: Space[];
  providers: Provider[];
  workspace_layouts: Record<string, unknown>;
  mcp_servers: Record<string, McpServerConfig[]>;
  settings: Record<string, unknown>;
}

const blankSecrets = (vars: EnvVar[]): EnvVar[] => vars.map((v) => (v.is_secret ? { ...v, value: "" } : v));

const envKeysOnly = (env: Record<string, string> | undefined): Record<string, string> | undefined =>
  env ? Object.fromEntries(Object.keys(env).map((k) => [k, ""])) : undefined;

function portableSettings(s: Record<string, unknown> | null): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of PORTABLE_SETTINGS) if (s && s[k] !== undefined) out[k] = s[k];
  return out;
}

export function buildExport(d: TransferData, meta: { appVersion: string; now: Date }): ExportFile {
  const mcp: Record<string, McpServerConfig[]> = {};
  for (const [spaceId, list] of Object.entries(d.mcp)) {
    mcp[spaceId] = list.map((m) => {
      const env = envKeysOnly(m.env);
      return env ? { ...m, env } : { ...m };
    });
  }
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exported_at: meta.now.toISOString(),
    app_version: meta.appVersion,
    spaces: d.spaces.map((s) => ({ ...s, custom_env: blankSecrets(s.custom_env) })),
    providers: d.providers.map((p) => ({ ...p, extra_env: blankSecrets(p.extra_env) })),
    workspace_layouts: { ...d.layouts },
    mcp_servers: mcp,
    settings: portableSettings(d.settings),
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function parseExport(text: string): ExportFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("Arquivo inválido: não é JSON.");
  }
  if (!isRecord(raw) || raw.format !== EXPORT_FORMAT) throw new Error("Arquivo inválido: não é uma exportação do Multishell.");
  if (typeof raw.version !== "number" || raw.version > EXPORT_VERSION) {
    throw new Error(`Arquivo de versão ${String(raw.version)} não suportada. Atualize o Multishell.`);
  }
  return {
    format: EXPORT_FORMAT,
    version: raw.version,
    exported_at: typeof raw.exported_at === "string" ? raw.exported_at : "",
    app_version: typeof raw.app_version === "string" ? raw.app_version : "",
    spaces: Array.isArray(raw.spaces) ? raw.spaces.map(normalizeSpace) : [],
    providers: Array.isArray(raw.providers) ? raw.providers.map(normalizeProvider) : [],
    workspace_layouts: isRecord(raw.workspace_layouts) ? raw.workspace_layouts : {},
    mcp_servers: isRecord(raw.mcp_servers)
      ? Object.fromEntries(Object.entries(raw.mcp_servers).filter(([, v]) => Array.isArray(v))) as Record<string, McpServerConfig[]>
      : {},
    settings: isRecord(raw.settings) ? portableSettings(raw.settings) : {},
  };
}

/** Importado vence no mesmo id. Itens novos entram no fim, na ordem do arquivo. */
function mergeById<T extends { id: string }>(current: T[], incoming: T[], fix: (item: T, old: T | undefined) => T): T[] {
  const byId = new Map(incoming.map((x) => [x.id, x]));
  const out = current.map((c) => (byId.has(c.id) ? fix(byId.get(c.id)!, c) : c));
  const known = new Set(current.map((c) => c.id));
  for (const x of incoming) if (!known.has(x.id)) out.push(fix(x, undefined));
  return out;
}

/** Segredo vazio no arquivo não apaga o valor que já existe aqui. */
function keepLocalValues(incoming: EnvVar[], local: EnvVar[] | undefined): EnvVar[] {
  return incoming.map((v) => {
    if (v.value !== "") return v;
    const old = local?.find((o) => o.key === v.key);
    return old ? { ...v, value: old.value } : v;
  });
}

const SAFE_DIR = /^[a-z0-9][a-z0-9-]*$/;

export function mergeImport(current: TransferData, file: ExportFile, opts: { isDir: (p: string) => boolean }): TransferData {
  const usedDirs = current.spaces.map((s) => s.directory_name);
  const spaces = mergeById(current.spaces, file.spaces, (s, old) => {
    const next: Space = { ...s, custom_env: keepLocalValues(s.custom_env, old?.custom_env) };
    // A pasta do espaço já existe aqui: o nome dela não muda.
    if (old) next.directory_name = old.directory_name;
    else {
      const dir = SAFE_DIR.test(s.directory_name) && !usedDirs.includes(s.directory_name)
        ? s.directory_name
        : makeDirectoryName(s.name, usedDirs);
      next.directory_name = dir;
      usedDirs.push(dir);
    }
    if (next.base_path && !opts.isDir(next.base_path)) next.base_path = null;
    return next;
  });

  const providers = mergeById(current.providers, file.providers, (p, old) => ({
    ...p,
    extra_env: keepLocalValues(p.extra_env, old?.extra_env),
  }));

  const mcp: Record<string, McpServerConfig[]> = { ...current.mcp };
  for (const [spaceId, list] of Object.entries(file.mcp_servers)) {
    mcp[spaceId] = mergeById(current.mcp[spaceId] ?? [], list, (m, old) => {
      if (!m.env) return m;
      const env = Object.fromEntries(Object.entries(m.env).map(([k, v]) => [k, v || old?.env?.[k] || ""]));
      return { ...m, env };
    });
  }

  return {
    spaces,
    providers,
    layouts: { ...current.layouts, ...file.workspace_layouts },
    mcp,
    settings: { ...(current.settings ?? {}), ...file.settings },
  };
}

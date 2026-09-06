// Migração dos dados do app Swift (UserDefaults) para o novo modelo.
//
// Fonte: `~/Library/Preferences/com.multishell.app.plist` (HOME real, plist binário).
// Destino: arquivos JSON em `userDataDir`:
// `spaces.json`, `providers.json`, `ui-state.json`, `settings.json`, `bookmarks.json`.
// Módulo puro (sem `electron`).

import * as fs from "node:fs/promises";
import * as path from "node:path";
import bplist from "bplist-parser";
import { newProvider, normalizeProvider, presets, type EnvVar, type Provider } from "./provider.js";
import { PERSONAL_ID, WORK_ID, realHome, type Space, type SpaceSecurity } from "./space.js";

export const SWIFT_BUNDLE_ID = "com.multishell.app";

export interface MigrationReport {
  spaces: number;
  providers: number;
  sessions: number;
  notes: string[];
}

// ---------- Modelos novos (saída, snake_case) ----------

export interface MigratedSession {
  id: string;
  title: string;
  space_id: string;
  provider_id: string | null;
  bypass: boolean;
  cwd: string | null;
  harness_running: boolean;
}

export interface MigratedBookmark {
  id: string;
  title: string;
  working_directory: string;
  initial_command: string;
  color_hex: string;
  theme: string;
  space_id: string;
}

export interface MigratedSettings {
  shell: string | null;
  default_cwd: string | null;
  font_family: string;
  font_size: number;
  theme: string;
  language: string;
}

export interface UiState {
  sessions: MigratedSession[];
  selectedSessionId: string | null;
}

export interface Converted {
  spaces: Space[];
  providers: Provider[];
  sessions: MigratedSession[];
  bookmarks: MigratedBookmark[];
  settings: MigratedSettings;
  notes: string[];
}

const DEFAULT_COLOR = "#00E5FF";
const DEFAULT_THEME = "Basic";

/** Presets espelhando provider.ts + "Antigravity (Claude)". */
export function migrationPresets(): Provider[] {
  const base = presets();
  const agyClaude = newProvider("Antigravity (Claude)", "agy");
  agyClaude.args = ["--model", "Claude Sonnet 4.6 (Thinking)"];
  agyClaude.bypass_args = ["--dangerously-skip-permissions"];
  agyClaude.icon = "rocket";
  const idx = base.findIndex((p) => p.name === "Antigravity");
  const at = idx === -1 ? base.length : idx + 1;
  return [...base.slice(0, at), agyClaude, ...base.slice(at)];
}

// ---------- Conversão pura ----------

/** `AgentType.rawValue` → nome do provider. */
export function providerNameForAgent(agent: string): string | null {
  switch (agent) {
    case "Claude Peers":
    case "Claude Pessoal":
      return "Claude Code";
    case "Antigravity Gemini":
      return "Antigravity";
    case "Antigravity Claude":
      return "Antigravity (Claude)";
    case "Codex Pessoal":
    case "Codex Peers":
      return "Codex";
    default:
      return null;
  }
}

/** Mesma lista de `ShellSession.cleaningAgentSuffix`. */
export function cleanAgentSuffix(title: string): string {
  const suffixes = [
    " - Claude Peers",
    " - Claude Pessoal",
    " - Antigravity Gemini",
    " - Antigravity Claude",
    " - Codex Peers",
    " - Codex Pessoal",
    " - Antigravity",
    " - Codex",
  ];
  let clean = title;
  for (const s of suffixes) {
    if (clean.endsWith(s)) clean = clean.slice(0, -s.length);
  }
  return clean;
}

function resolveSpaceId(profileId: string | null, environment: string | null): string {
  if (profileId) return profileId;
  return environment === "peers" ? WORK_ID : PERSONAL_ID;
}

/** Segundos desde 2001-01-01 (Foundation) → RFC3339 UTC sem milissegundos. */
export function appleDateToIso(secs: number): string {
  const APPLE_EPOCH_UNIX = 978_307_200;
  const unix = APPLE_EPOCH_UNIX + Math.floor(secs);
  return new Date(unix * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "bigint") return Number(v);
  return null;
}

/** Valores JSON do UserDefaults chegam como `<data>` (Buffer) ou string. */
function dataAsString(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (Buffer.isBuffer(v)) return v.toString("utf8");
  if (v instanceof Uint8Array) return Buffer.from(v).toString("utf8");
  return null;
}

function parseList(raw: unknown, label: string, notes: string[]): Record<string, unknown>[] {
  const text = dataAsString(raw);
  if (text === null) return [];
  try {
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) {
      notes.push(`${label}: JSON inválido, ignorado (esperado array)`);
      return [];
    }
    return parsed.filter(isRecord);
  } catch (e) {
    notes.push(`${label}: JSON inválido, ignorado (${(e as Error).message})`);
    return [];
  }
}

function migratedSecurity(): SpaceSecurity {
  return {
    load_user_shell_profile: true,
    share_keychain: true,
    share_ssh: false,
    share_git_config: false,
    inherit_process_env: false,
  };
}

/** Converte os valores do UserDefaults no modelo novo. `providers` são os
 *  presets (ou os já existentes em disco) usados para resolver `provider_id`. */
export function convert(plistValues: Record<string, unknown>, providers: Provider[]): Converted {
  const notes: string[] = [];

  const spaces: Space[] = parseList(plistValues.shellProfiles, "shellProfiles", notes).map((p) => {
    const customEnv: EnvVar[] = (Array.isArray(p.customEnv) ? p.customEnv : [])
      .filter(isRecord)
      .map((e) => ({ key: str(e.key) ?? "", value: str(e.value) ?? "", is_secret: false }))
      .filter((e) => e.key.trim() !== "");
    return {
      id: (str(p.id) ?? "").toLowerCase(),
      name: str(p.name) ?? "",
      color_hex: str(p.colorHex) ?? DEFAULT_COLOR,
      directory_name: str(p.directoryName) ?? "",
      custom_env: customEnv,
      security: migratedSecurity(),
      created_at: appleDateToIso(num(p.createdAt) ?? 0),
    };
  });

  const providerId = (name: string): string | null => providers.find((p) => p.name === name)?.id ?? null;

  const sessions: MigratedSession[] = parseList(plistValues.activeSessions, "activeSessions", notes).map((s) => {
    const title = str(s.title) ?? "";
    const agent = str(s.activeAgent);
    let pid: string | null = null;
    if (agent !== null) {
      const name = providerNameForAgent(agent);
      if (name === null) {
        notes.push(`agente desconhecido "${agent}"; sessão "${title}" sem provider`);
      } else {
        pid = providerId(name);
        if (pid === null) notes.push(`provider "${name}" não encontrado; sessão "${title}" sem provider`);
      }
    }
    const cwd = str(s.currentDirectory);
    return {
      id: (str(s.id) ?? "").toLowerCase(),
      title: cleanAgentSuffix(title),
      space_id: resolveSpaceId(str(s.profileId), str(s.environment)).toLowerCase(),
      provider_id: pid,
      bypass: s.bypassMode === true,
      cwd: cwd === null || cwd === "" ? null : cwd,
      harness_running: false,
    };
  });

  const bookmarks: MigratedBookmark[] = parseList(plistValues.terminalBookmarks, "terminalBookmarks", notes).map((b) => ({
    id: (str(b.id) ?? "").toLowerCase(),
    title: str(b.title) ?? "",
    working_directory: str(b.workingDirectory) ?? "",
    initial_command: str(b.initialCommand) ?? "",
    color_hex: str(b.colorHex) ?? DEFAULT_COLOR,
    theme: str(b.themeRaw) ?? DEFAULT_THEME,
    space_id: resolveSpaceId(str(b.profileId), str(b.environment)).toLowerCase(),
  }));

  const settings: MigratedSettings = {
    shell: str(plistValues.defaultShell),
    default_cwd: str(plistValues.defaultPath),
    font_family: str(plistValues.fontFamily) ?? "SF Mono",
    font_size: num(plistValues.fontSize) ?? 12,
    theme: str(plistValues.terminalTheme) ?? DEFAULT_THEME,
    language: "pt-BR",
  };

  return { spaces, providers, sessions, bookmarks, settings, notes };
}

// ---------- Leitura do plist ----------

function swiftHome(): string {
  // HOME pode estar virado para um espaço; realHome() já remove o prefixo do espaço.
  return realHome();
}

export function swiftPlistPath(): string {
  return path.join(swiftHome(), "Library", "Preferences", `${SWIFT_BUNDLE_ID}.plist`);
}

/** Lê um plist binário. Devolve o dicionário raiz. */
export async function readPlist(file: string): Promise<Record<string, unknown>> {
  let parsed: unknown[];
  try {
    parsed = await bplist.parseFile(file);
  } catch (e) {
    throw new Error(`plist: ${(e as Error).message}`);
  }
  const root = parsed[0];
  if (!isRecord(root)) throw new Error("plist não é um dicionário");
  return root;
}

// ---------- Gravação ----------

async function readText(file: string): Promise<string | null> {
  try {
    return await fs.readFile(file, "utf8");
  } catch {
    return null;
  }
}

async function readExistingProviders(file: string): Promise<Provider[] | null> {
  const text = await readText(file);
  if (text === null || text.trim() === "") return null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed.map(normalizeProvider);
  } catch {
    return null;
  }
}

/** Grava `value` em `file` se o arquivo não existir ou estiver vazio.
 *  Retorna `true` se gravou, `false` se pulou. */
async function writeIfEmpty(file: string, value: unknown): Promise<boolean> {
  const existing = await readText(file);
  if (existing !== null && existing.trim() !== "") return false;
  await fs.writeFile(file, JSON.stringify(value, null, 2), "utf8");
  return true;
}

/** Grava o resultado da conversão em `userDataDir`. Não sobrescreve arquivo com conteúdo. */
export async function writeConverted(userDataDir: string, converted: Converted): Promise<MigrationReport> {
  const report: MigrationReport = { spaces: 0, providers: 0, sessions: 0, notes: [...converted.notes] };
  await fs.mkdir(userDataDir, { recursive: true });

  const save = async (name: string, value: unknown, count: number): Promise<number> => {
    if (await writeIfEmpty(path.join(userDataDir, name), value)) return count;
    report.notes.push(`${name}: já migrado, pulado`);
    return 0;
  };

  report.spaces = await save("spaces.json", converted.spaces, converted.spaces.length);
  report.providers = await save("providers.json", converted.providers, converted.providers.length);
  const ui: UiState = { sessions: converted.sessions, selectedSessionId: null };
  report.sessions = await save("ui-state.json", ui, converted.sessions.length);
  await save("bookmarks.json", converted.bookmarks, converted.bookmarks.length);
  await save("settings.json", converted.settings, 1);
  return report;
}

async function isFile(p: string): Promise<boolean> {
  try {
    return (await fs.stat(p)).isFile();
  } catch {
    return false;
  }
}

export async function migrateFromSwift(userDataDir: string, plistPath: string = swiftPlistPath()): Promise<MigrationReport> {
  if (!(await isFile(plistPath))) {
    return { spaces: 0, providers: 0, sessions: 0, notes: ["plist do app Swift não encontrado; nada a migrar"] };
  }
  const values = await readPlist(plistPath);
  await fs.mkdir(userDataDir, { recursive: true });

  // Reaproveita ids dos providers já gravados (resolução por nome).
  const providers = (await readExistingProviders(path.join(userDataDir, "providers.json"))) ?? migrationPresets();
  const converted = convert(values, providers);
  return writeConverted(userDataDir, converted);
}

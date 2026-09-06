// Espaço = conjunto de credenciais isolado. Pasta raiz própria, política de segurança explícita.
// Módulo puro (sem `electron`): `buildSpawnPlan` não toca em disco; `materialize` usa só node:fs.

import { existsSync } from "node:fs";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { normalizeEnvVars, slug, type EnvVar, type Provider } from "./provider.js";

export const PERSONAL_ID = "00000000-0000-0000-0000-000000000001";
export const WORK_ID = "00000000-0000-0000-0000-000000000002";

export interface SpaceSecurity {
  load_user_shell_profile: boolean;
  share_keychain: boolean;
  share_ssh: boolean;
  share_git_config: boolean;
  inherit_process_env: boolean;
  block_destructive_commands?: boolean;
}

export interface Space {
  id: string;
  name: string;
  color_hex: string;
  /** Pasta estável sob a raiz de espaços. */
  directory_name: string;
  /** Working directory for new terminals; credentials stay in the isolated home. */
  base_path?: string | null;
  /** is_secret=true → value fica vazio; valor real no keyring. */
  custom_env: EnvVar[];
  security: SpaceSecurity;
  /** RFC3339. */
  created_at: string;
}

export interface SpawnPlan {
  shell: string;
  shell_args: string[];
  cwd: string | null;
  env: Record<string, string>;
  inherit_env: boolean;
}

export type Os = "darwin" | "win32" | "linux";

export function currentOs(): Os {
  const p = process.platform;
  if (p === "win32" || p === "darwin") return p;
  return "linux";
}

const DEFAULT_COLOR = "#00E5FF";

export function defaultSecurity(): SpaceSecurity {
  return {
    load_user_shell_profile: false,
    share_keychain: false,
    share_ssh: false,
    share_git_config: false,
    inherit_process_env: false,
  };
}

export function newSpace(name: string, colorHex: string, directoryName: string): Space {
  return {
    id: crypto.randomUUID(),
    name,
    color_hex: colorHex,
    directory_name: directoryName,
    custom_env: [],
    security: defaultSecurity(),
    created_at: new Date().toISOString(),
  };
}

/** Os 2 espaços padrão. Ids fixos para migrar do app Swift.
 *  Nascem com `load_user_shell_profile` e `share_keychain` ligados (decisão de migração). */
export function defaultSpaces(): Space[] {
  const migrated = (): SpaceSecurity => ({ ...defaultSecurity(), load_user_shell_profile: true, share_keychain: true });
  const personal = newSpace("Pessoal", "#FF6482", "personal");
  personal.id = PERSONAL_ID;
  personal.security = migrated();
  const work = newSpace("Trabalho", "#32ADE6", "work");
  work.id = WORK_ID;
  work.security = migrated();
  return [personal, work];
}

// ---------- normalização de JSON ----------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function normalizeSecurity(raw: unknown): SpaceSecurity {
  const d = defaultSecurity();
  if (!isRecord(raw)) return d;
  return {
    load_user_shell_profile: raw.load_user_shell_profile === true,
    share_keychain: raw.share_keychain === true,
    share_ssh: raw.share_ssh === true,
    share_git_config: raw.share_git_config === true,
    inherit_process_env: raw.inherit_process_env === true,
  };
}

/** Aplica defaults para campos ausentes (equivalente ao `#[serde(default)]`). */
export function normalizeSpace(raw: unknown): Space {
  if (!isRecord(raw)) throw new Error("espaço inválido: esperado objeto");
  return {
    id: typeof raw.id === "string" ? raw.id : crypto.randomUUID(),
    name: typeof raw.name === "string" ? raw.name : "",
    color_hex: typeof raw.color_hex === "string" ? raw.color_hex : DEFAULT_COLOR,
    directory_name: typeof raw.directory_name === "string" ? raw.directory_name : "",
    base_path: typeof raw.base_path === "string" ? raw.base_path.trim() || null : null,
    custom_env: normalizeEnvVars(raw.custom_env),
    security: normalizeSecurity(raw.security),
    created_at: typeof raw.created_at === "string" ? raw.created_at : new Date().toISOString(),
  };
}

// ---------- nomes de pasta ----------

/** Slug de pasta: minúsculas, sem acento, só `[a-z0-9-]`, único contra `existing`.
 *  Regra igual a `ShellProfile.makeDirectoryName` do app Swift. */
export function makeDirectoryName(name: string, existing: string[]): string {
  let slugged = "";
  let lastDash = false;
  const plain = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  for (const c of plain) {
    if (/^[\p{L}\p{N}]$/u.test(c)) {
      slugged += c;
      lastDash = false;
    } else if (!lastDash) {
      slugged += "-";
      lastDash = true;
    }
  }
  slugged = slugged.replace(/^-+|-+$/g, "");
  if (slugged === "") slugged = "profile";
  let candidate = slugged;
  let counter = 2;
  while (existing.includes(candidate)) {
    candidate = `${slugged}-${counter}`;
    counter += 1;
  }
  return candidate;
}

// ---------- raízes ----------

/** Se o app foi aberto de dentro de um espaço (HOME = <real>/.multishell/profiles/<x>),
 *  devolve o HOME real. Evita espaços aninhados. */
export function stripSpaceHome(home: string): string {
  const sep = home.includes("\\") && !home.includes("/") ? "\\" : "/";
  const comps = home.split(/[\\/]/);
  for (let i = 0; i + 2 < comps.length; i++) {
    if (comps[i] === ".multishell" && comps[i + 1] === "profiles") {
      return comps.slice(0, i).join(sep);
    }
  }
  return home;
}

export function realHome(): string {
  const raw =
    process.platform === "win32"
      ? process.env.USERPROFILE || os.homedir()
      : process.env.HOME || os.homedir();
  if (!raw) throw new Error("HOME do usuário não encontrado");
  return stripSpaceHome(raw);
}

/** Raiz de todos os espaços: `<HOME real>/.multishell/profiles`. */
export function spacesRoot(): string {
  return path.join(realHome(), ".multishell", "profiles");
}

export function spaceRoot(space: Space): string {
  if (!space.directory_name) throw new Error("espaço sem directory_name");
  return path.join(spacesRoot(), space.directory_name);
}

function pathFor(osName: Os): typeof path.posix {
  return osName === "win32" ? path.win32 : path.posix;
}

function rootFor(space: Space, realHomeDir: string, osName: Os): string {
  if (!space.directory_name) throw new Error("espaço sem directory_name");
  return pathFor(osName).join(realHomeDir, ".multishell", "profiles", space.directory_name);
}

export function providerConfigDir(root: string, prov: Provider, osName: Os): string {
  return pathFor(osName).join(root, "providers", slug(prov.name));
}

// ---------- plano de spawn (puro) ----------

export interface BuildOpts {
  space: Space;
  provider: Provider | null;
  cwd: string | null;
  realHome: string;
  os: Os;
  userShell: string;
  processEnv: NodeJS.ProcessEnv;
  resolveSecret: (spaceId: string, key: string) => string | null;
  /** Pasta padrão das configurações do terminal. Vale quando o espaço não tem pasta base. */
  defaultCwd?: string | null;
}

/** Locale do host quando ela é UTF-8; senão uma UTF-8 padrão. */
export function utf8Locale(env: NodeJS.ProcessEnv): string {
  for (const key of ["LC_ALL", "LC_CTYPE", "LANG"]) {
    const value = env[key];
    if (typeof value === "string" && /utf-?8$/i.test(value.trim())) return value.trim();
  }
  return "en_US.UTF-8";
}

function processPath(env: NodeJS.ProcessEnv): string {
  if (typeof env.PATH === "string") return env.PATH;
  const key = Object.keys(env).find((k) => k.toUpperCase() === "PATH");
  return (key && env[key]) || "";
}

function applyEnvVars(
  env: Record<string, string>,
  vars: EnvVar[],
  spaceId: string,
  resolveSecret: BuildOpts["resolveSecret"],
): void {
  for (const v of vars) {
    const key = v.key.trim();
    if (key === "") continue;
    if (v.is_secret) {
      const value = resolveSecret(spaceId, key);
      if (value === null) continue; // segredo ausente: omite, não falha
      env[key] = value;
    } else {
      env[key] = v.value;
    }
  }
}

/** Monta o plano de spawn. Pura: não toca em disco.
 *  HOME real nunca entra nos valores; só PATH carrega o PATH do processo do app. */
export function buildSpawnPlan(o: BuildOpts): SpawnPlan {
  const p = pathFor(o.os);
  const root = rootFor(o.space, o.realHome, o.os);
  const env: Record<string, string> = {};
  let shellArgs: string[] = [];

  env.HOME = root;
  // Sem locale UTF-8 o shell cai em "C" e acentos viram lixo ao copiar do terminal.
  const locale = utf8Locale(o.processEnv);
  env.LANG = locale;
  env.LC_CTYPE = locale;
  env.MULTISHELL_SPACE = o.space.directory_name;
  env.MULTISHELL_SPACE_NAME = o.space.name;
  env.MULTISHELL_SPACE_HOME = root;

  if (o.os === "win32") {
    env.USERPROFILE = root;
    env.APPDATA = p.join(root, "AppData", "Roaming");
    env.LOCALAPPDATA = p.join(root, "AppData", "Local");
    env.PATH = processPath(o.processEnv);
    shellArgs = ["-NoLogo", "-NoExit", "-File", p.join(root, "multishell-profile.ps1")];
  } else {
    const config = p.join(root, ".config");
    env.XDG_CONFIG_HOME = config;
    env.XDG_DATA_HOME = p.join(root, ".local", "share");
    env.XDG_STATE_HOME = p.join(root, ".local", "state");
    env.XDG_CACHE_HOME = p.join(root, ".cache");
    env.ZDOTDIR = p.join(root, ".zsh");
    env.CLOUDSDK_CONFIG = p.join(config, "gcloud");
    env.GH_CONFIG_DIR = p.join(config, "gh");
    env.FIREBASE_CONFIG_DIR = p.join(config, "configstore");
    env.DOCKER_CONFIG = p.join(root, ".docker");
    env.KUBECONFIG = p.join(root, ".kube", "config");
    env.NPM_CONFIG_USERCONFIG = p.join(root, ".npmrc");
    env.PATH = `/opt/homebrew/bin:/usr/local/bin:${processPath(o.processEnv)}`;
  }

  // custom_env do espaço.
  applyEnvVars(env, o.space.custom_env, o.space.id, o.resolveSecret);

  // provider: pasta de config dentro do espaço + extra_env por cima.
  if (o.provider) {
    const key = o.provider.config_env_key?.trim();
    if (key) env[key] = providerConfigDir(root, o.provider, o.os);
    applyEnvVars(env, o.provider.extra_env, o.space.id, o.resolveSecret);
  }

  return {
    shell: o.userShell,
    shell_args: shellArgs,
    // Terminal novo começa na pasta do projeto, na pasta padrão do usuário ou no home real.
    // A pasta de perfil do espaço é só o HOME isolado: ninguém quer trabalhar dentro dela.
    cwd: o.cwd ?? o.space.base_path ?? o.defaultCwd ?? o.realHome,
    env,
    inherit_env: o.space.security.inherit_process_env,
  };
}

// ---------- rc files gerados ----------

const OSC7_ZSH = `printf '\\e]7;file://%s%s\\a' "$HOST" "$PWD"`;

/** Conteúdo do `.zshrc` gerado no espaço. Arquivo é do app; regenerado sempre. */
export function zshrcContent(space: Space, realHomeDir: string): string {
  let s = "# Gerado pelo Multishell. Edite ~/.zshrc.local no espaço.\n";
  s += 'export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"\n';
  if (space.security.load_user_shell_profile) {
    s += `[[ -f "${realHomeDir}/.zshrc" ]] && source "${realHomeDir}/.zshrc"\n`;
  }
  s += '[[ -f "$HOME/.zshrc.local" ]] && source "$HOME/.zshrc.local"\n';
  s += "# OSC 7: informa o cwd ao Multishell a cada prompt.\n";
  s += `__multishell_osc7() { ${OSC7_ZSH} }\n`;
  s += "precmd_functions+=(__multishell_osc7)\n";
  return s;
}

export function zshenvContent(_space: Space): string {
  return '# Gerado pelo Multishell.\n[[ -f "$HOME/.zshenv.local" ]] && source "$HOME/.zshenv.local"\n';
}

/** Conteúdo do perfil PowerShell gerado no espaço. */
export function ps1Content(space: Space, realHomeDir: string): string {
  let s = "# Gerado pelo Multishell.\n";
  s += `$env:USERPROFILE_REAL = '${realHomeDir.replace(/'/g, "''")}'\n`;
  if (space.security.load_user_shell_profile) {
    s += "$__ms_user = Join-Path $env:USERPROFILE_REAL 'Documents\\PowerShell\\profile.ps1'\n";
    s += "if (Test-Path $__ms_user) { . $__ms_user }\n";
  }
  s += "$__ms_local = Join-Path $env:USERPROFILE 'multishell-profile.local.ps1'\n";
  s += "if (Test-Path $__ms_local) { . $__ms_local }\n";
  s += "# OSC 7: informa o cwd ao Multishell a cada prompt.\n";
  s += "function prompt {\n";
  s += "  $__ms_pwd = (Get-Location).Path -replace '\\\\', '/'\n";
  s += '  [Console]::Write("$([char]27)]7;file://$env:COMPUTERNAME/$__ms_pwd$([char]7)")\n';
  s += '  "PS $((Get-Location).Path)> "\n';
  s += "}\n";
  return s;
}

// ---------- materialização em disco ----------

async function lstatOrNull(p: string) {
  try {
    return await fs.lstat(p);
  } catch {
    return null;
  }
}

/** Cria/garante um symlink `link -> target` quando `enabled`; remove quando não, só se for symlink. */
async function syncSymlink(link: string, target: string, enabled: boolean): Promise<void> {
  const meta = await lstatOrNull(link);
  const isSymlink = meta?.isSymbolicLink() ?? false;
  if (enabled) {
    if (isSymlink) {
      if ((await fs.readlink(link)) === target) return;
      await fs.unlink(link);
    } else if (meta) {
      // Existe algo real no lugar (pasta ou arquivo do espaço). Não sobrescreve.
      return;
    }
    await fs.mkdir(path.dirname(link), { recursive: true });
    await createSymlink(target, link);
  } else if (isSymlink) {
    await removeSymlink(link);
  }
}

async function createSymlink(target: string, link: string): Promise<void> {
  let type: "dir" | "file" | "junction" = "file";
  if (process.platform === "win32") {
    try {
      type = (await fs.stat(target)).isDirectory() ? "junction" : "file";
    } catch {
      type = "file";
    }
  }
  await fs.symlink(target, link, type);
}

async function removeSymlink(link: string): Promise<void> {
  try {
    await fs.unlink(link);
  } catch {
    await fs.rmdir(link);
  }
}

/** Cria pastas, rc do shell e symlinks conforme a política. Idempotente. */
export async function materialize(space: Space, provider: Provider | null, realHomeDir: string, osName: Os): Promise<void> {
  // Em disco usa o separador do host (o teste roda o ramo win32 em mac/linux).
  if (!space.directory_name) throw new Error("espaço sem directory_name");
  const root = path.join(realHomeDir, ".multishell", "profiles", space.directory_name);
  const dirs: string[] = [root];
  if (osName === "win32") {
    dirs.push(path.join(root, "AppData", "Roaming"), path.join(root, "AppData", "Local"), path.join(root, "Documents", "PowerShell"));
  } else {
    const config = path.join(root, ".config");
    dirs.push(
      path.join(config, "gcloud"),
      path.join(config, "gh"),
      path.join(config, "configstore"),
      path.join(root, ".local", "share"),
      path.join(root, ".local", "state"),
      path.join(root, ".cache"),
      path.join(root, ".docker"),
      path.join(root, ".kube"),
      path.join(root, ".zsh"),
    );
    if (osName === "darwin") dirs.push(path.join(root, "Library"));
  }
  if (provider && provider.config_env_key) {
    dirs.push(path.join(root, "providers", slug(provider.name)));
  }
  for (const d of dirs) {
    await fs.mkdir(d, { recursive: true });
  }

  if (osName === "win32") {
    await fs.writeFile(path.join(root, "multishell-profile.ps1"), ps1Content(space, realHomeDir), "utf8");
  } else {
    const zsh = path.join(root, ".zsh");
    await fs.writeFile(path.join(zsh, ".zshrc"), zshrcContent(space, realHomeDir), "utf8");
    await fs.writeFile(path.join(zsh, ".zshenv"), zshenvContent(space), "utf8");
  }

  const sec = space.security;
  if (osName === "darwin") {
    await syncSymlink(path.join(root, "Library", "Keychains"), path.join(realHomeDir, "Library", "Keychains"), sec.share_keychain);
  }
  await syncSymlink(path.join(root, ".ssh"), path.join(realHomeDir, ".ssh"), sec.share_ssh);
  await syncSymlink(path.join(root, ".gitconfig"), path.join(realHomeDir, ".gitconfig"), sec.share_git_config);
}

// ---------- shell padrão ----------

export function defaultShell(): string {
  if (process.platform === "win32") {
    const paths = (process.env.PATH || process.env.Path || "").split(path.delimiter);
    const has = (bin: string) => paths.some((d) => d && existsSync(path.join(d, bin)));
    return has("pwsh.exe") ? "pwsh.exe" : "powershell.exe";
  }
  return process.env.SHELL || "/bin/zsh";
}


/** materialize + buildSpawnPlan com o SO do processo. */
export async function spawnPlanFor(
  space: Space,
  provider: Provider | null,
  cwd: string | null,
  resolveSecret: BuildOpts["resolveSecret"],
  defaultCwd?: string | null,
): Promise<SpawnPlan> {
  const osName = currentOs();
  const home = realHome();
  await materialize(space, provider, home, osName);
  return buildSpawnPlan({
    space,
    provider,
    cwd,
    realHome: home,
    os: osName,
    userShell: defaultShell(),
    processEnv: process.env,
    resolveSecret,
    defaultCwd,
  });
}

// Provider = um harness/CLI de IA cadastrado pelo usuário.
// Nada aqui é fixo: presets só preenchem o formulário.
// Módulo puro (sem `electron`): testável em ambiente node.

import { randomUUID } from "node:crypto";

export interface EnvVar {
  key: string;
  value: string;
  is_secret: boolean;
}

export interface Provider {
  id: string;
  /** Nome livre do harness ("Claude Code", "Meu Agente"). */
  name: string;
  /** Caminho ou nome do executável no PATH. */
  executable: string;
  args: string[];
  /** Args adicionados quando o bypass está ligado. */
  bypass_args: string[];
  /** Variável de ambiente que o CLI usa para achar sua pasta de config.
   *  O app aponta para `<espaço>/providers/<slug>`. */
  config_env_key: string | null;
  extra_env: EnvVar[];
  icon: string;
  /** Args que retomam a última sessão do CLI (ex.: `["--continue"]`).
   *  Vazio = o CLI não tem resume; `resumeCommand` vira `command`. */
  resume_args: string[];
}

export function newProvider(name: string, executable: string): Provider {
  return {
    id: randomUUID(),
    name,
    executable,
    args: [],
    bypass_args: [],
    config_env_key: null,
    extra_env: [],
    icon: "terminal",
    resume_args: [],
  };
}

/** Linha de comando final. Único lugar que monta o comando. */
export function command(p: Provider, bypass: boolean): string[] {
  return [p.executable, ...p.args, ...(bypass ? p.bypass_args : [])];
}

/** Comando pronto para digitar no shell, com aspas onde precisa. */
export function commandLine(p: Provider, bypass: boolean): string {
  return joinQuoted(command(p, bypass));
}

/** Comando de resume: executable + args + resume_args + bypass_args. */
export function resumeCommand(p: Provider, bypass: boolean): string[] {
  return [p.executable, ...p.args, ...p.resume_args, ...(bypass ? p.bypass_args : [])];
}

export function resumeLine(p: Provider, bypass: boolean): string {
  return joinQuoted(resumeCommand(p, bypass));
}

export function presets(): Provider[] {
  const claude = newProvider("Claude Code", "claude");
  claude.bypass_args = ["--dangerously-skip-permissions"];
  claude.config_env_key = "CLAUDE_CONFIG_DIR";
  claude.icon = "sparkles";
  claude.resume_args = ["--continue"];

  const codex = newProvider("Codex", "codex");
  codex.bypass_args = ["--dangerously-bypass-approvals-and-sandbox"];
  codex.config_env_key = "CODEX_HOME";
  codex.icon = "cpu";
  codex.resume_args = ["resume", "--last"];

  const agy = newProvider("Antigravity", "agy");
  agy.bypass_args = ["--dangerously-skip-permissions"];
  agy.icon = "rocket";
  agy.resume_args = ["--continue"];

  const cursor = newProvider("Cursor", "cursor-agent");
  cursor.bypass_args = ["--force"];
  cursor.icon = "mouse-pointer";
  cursor.resume_args = ["--resume"];

  return [claude, codex, agy, cursor];
}

/** Slug usado como nome de pasta em `<espaço>/providers/<slug>`. */
export function slug(name: string): string {
  let out = "";
  let lastDash = false;
  for (const c of name.toLowerCase()) {
    if (/^[a-z0-9]$/.test(c)) {
      out += c;
      lastDash = false;
    } else if (!lastDash) {
      out += "-";
      lastDash = true;
    }
  }
  out = out.replace(/^-+|-+$/g, "");
  return out === "" ? "provider" : out;
}

// ---------- normalização de JSON (campos ausentes em JSON antigo) ----------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export function normalizeEnvVar(raw: unknown): EnvVar | null {
  if (!isRecord(raw)) return null;
  return { key: str(raw.key), value: str(raw.value), is_secret: raw.is_secret === true };
}

export function normalizeEnvVars(raw: unknown): EnvVar[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeEnvVar).filter((v): v is EnvVar => v !== null);
}

/** Aplica defaults para campos ausentes (equivalente ao `#[serde(default)]`). */
export function normalizeProvider(raw: unknown): Provider {
  if (!isRecord(raw)) throw new Error("provider inválido: esperado objeto");
  const configKey = raw.config_env_key;
  const executable = str(raw.executable);
  let resume_args = strList(raw.resume_args);
  if (resume_args.length === 0 && (executable === "agy" || str(raw.name).toLowerCase().includes("antigravity"))) {
    resume_args = ["--continue"];
  }
  return {
    id: str(raw.id, randomUUID()),
    name: str(raw.name),
    executable,
    args: strList(raw.args),
    bypass_args: strList(raw.bypass_args),
    config_env_key: typeof configKey === "string" ? configKey : null,
    extra_env: normalizeEnvVars(raw.extra_env),
    icon: str(raw.icon, "terminal"),
    resume_args,
  };
}

// ---------- shell quoting (igual ao Rust) ----------

function joinQuoted(cmd: string[]): string {
  return cmd.map(shellQuote).join(" ");
}

function shellQuote(arg: string): string {
  const safe = /^[A-Za-z0-9\-_./=:@+,]+$/.test(arg);
  if (safe) return arg;
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

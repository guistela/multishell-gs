import { existsSync } from "node:fs";
import * as path from "node:path";
import type { Os } from "./space";

/** Valor de `settings.shell` que pede o Git Bash detectado no Windows. */
export const GIT_BASH = "git-bash";

type Exists = (p: string) => boolean;
type Env = Record<string, string | undefined>;

/** Procura o bash.exe do Git for Windows. Puro: `exists` vem de fora para o teste. */
export function findGitBash(env: Env, exists: Exists = existsSync): string | null {
  const w = path.win32;
  const candidates: string[] = [];
  for (const base of [env.ProgramFiles, env["ProgramFiles(x86)"], env.ProgramW6432]) {
    if (base) candidates.push(w.join(base, "Git", "bin", "bash.exe"));
  }
  if (env.LOCALAPPDATA) candidates.push(w.join(env.LOCALAPPDATA, "Programs", "Git", "bin", "bash.exe"));
  // git.exe fica em <Git>\cmd ou <Git>\bin. O bash.exe fica em <Git>\bin.
  for (const dir of (env.PATH ?? env.Path ?? "").split(";").filter(Boolean)) {
    if (exists(w.join(dir, "git.exe"))) candidates.push(w.join(dir, "..", "bin", "bash.exe"));
  }
  return candidates.find((c) => exists(c)) ?? null;
}

export interface ResolveOpts {
  setting: string | null | undefined;
  os: Os;
  env: Env;
  exists?: Exists;
  /** Shell padrão do SO (PowerShell ou $SHELL). */
  fallback: string;
}

/** Converte `settings.shell` no executável a usar. */
export function resolveShell(o: ResolveOpts): string {
  const s = o.setting?.trim();
  if (!s) return o.fallback;
  if (s === GIT_BASH) {
    if (o.os !== "win32") return o.fallback;
    return findGitBash(o.env, o.exists) ?? o.fallback;
  }
  return s;
}

export function isBash(shell: string): boolean {
  return /^bash(\.exe)?$/i.test(path.win32.basename(shell));
}

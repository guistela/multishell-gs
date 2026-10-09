// Abre uma pasta no VS Code. Sem `shell: true`: o caminho vai como argumento, nunca por string de comando.
import { spawn as nodeSpawn } from "node:child_process";
import { join } from "node:path";

export type SpawnFn = (cmd: string, args: string[], env: NodeJS.ProcessEnv) => Promise<void>;

export interface EditorDeps {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  spawn?: SpawnFn;
}

/** Candidatos em ordem. `code` da PATH primeiro; depois o app instalado, sem depender do `code` configurado. */
export function editorCandidates(dir: string, platform: NodeJS.Platform, env: NodeJS.ProcessEnv): Array<[string, string[]]> {
  if (platform === "darwin") return [["code", [dir]], ["open", ["-a", "Visual Studio Code", dir]]];
  if (platform === "win32") {
    const bases = [env.LOCALAPPDATA ? join(env.LOCALAPPDATA, "Programs") : null, env.ProgramFiles ?? null];
    return bases.filter((b): b is string => Boolean(b)).map((b) => [join(b, "Microsoft VS Code", "Code.exe"), [dir]]);
  }
  return [["code", [dir]]];
}

/** Devolve "" quando abriu, ou a mensagem de erro. Mesmo contrato do `shell.openPath`. */
export async function openInEditor(dir: string, deps: EditorDeps = {}): Promise<string> {
  const platform = deps.platform ?? process.platform;
  const env = deps.env ?? process.env;
  const spawn = deps.spawn ?? detachedSpawn;
  for (const [cmd, args] of editorCandidates(dir, platform, env)) {
    try {
      await spawn(cmd, args, env);
      return "";
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") continue;
      return e instanceof Error ? e.message : String(e);
    }
  }
  return "VS Code não encontrado. Instale o comando `code` na PATH.";
}

function detachedSpawn(cmd: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = nodeSpawn(cmd, args, { env, detached: true, stdio: "ignore", windowsHide: true });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

// Keychain próprio por espaço (macOS).
//
// O Multishell troca o HOME do shell pela raiz do espaço. O macOS resolve o
// keychain do usuário a partir de `$HOME/Library/Keychains/login.keychain-db`.
// Com o espaço isolado e nenhum arquivo ali, qualquer CLI que tente guardar
// credencial recebe o diálogo "A keychain cannot be found to store ...".
//
// A correção é dar ao espaço um keychain próprio. Credencial de um espaço não
// aparece no outro, e o keychain real do usuário não é tocado.
// Módulo puro (sem `electron`): a execução entra por `KeychainDeps`.
import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface KeychainDeps {
  exists: (p: string) => Promise<boolean>;
  mkdir: (p: string) => Promise<void>;
  run: (bin: string, args: string[]) => Promise<void>;
  chmod: (p: string, mode: number) => Promise<void>;
}

/** Onde o macOS procura o keychain do usuário, dado o HOME do espaço. */
export function spaceKeychainPath(root: string): string {
  return path.join(root, "Library", "Keychains", "login.keychain-db");
}

export type KeychainResult = "created" | "kept" | "skipped";

export const realKeychainDeps: KeychainDeps = {
  exists: async (p) => { try { await fs.access(p); return true; } catch { return false; } },
  mkdir: async (p) => { await fs.mkdir(p, { recursive: true }); },
  run: async (bin, args) => { await execFileAsync(bin, args, { timeout: 10_000 }); },
  chmod: async (p, mode) => { await fs.chmod(p, mode); },
};

/**
 * Garante o keychain do espaço. Idempotente: existindo, não mexe — os segredos
 * já guardados ficam onde estão.
 *
 * A senha é vazia de propósito. `security unlock-keychain -p <senha>` falha
 * fora de uma sessão gráfica, então um keychain com senha voltaria a travar
 * depois do timeout e o diálogo reapareceria. O arquivo fica 0600 dentro do
 * HOME do próprio usuário: ele separa espaços, não protege o usuário de si.
 *
 * Nunca lança: keychain é conveniência, abrir o terminal é o que importa.
 */
export async function ensureSpaceKeychain(root: string, deps: KeychainDeps = realKeychainDeps): Promise<KeychainResult> {
  const file = spaceKeychainPath(root);
  try {
    if (await deps.exists(file)) return "kept";
    await deps.mkdir(path.dirname(file));
    await deps.run("security", ["create-keychain", "-p", "", file]);
    // Sem argumento de lock: nada de timeout de 300s nem lock ao dormir.
    await deps.run("security", ["set-keychain-settings", file]);
    await deps.chmod(file, 0o600);
    return "created";
  } catch {
    return "skipped";
  }
}

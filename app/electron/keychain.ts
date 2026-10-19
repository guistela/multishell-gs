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

/** Onde o macOS procura o keychain do usuário, dado o HOME do espaço.
 *  `posix` fixo: só o macOS chega aqui, e assim o teste vale em qualquer runner. */
export function spaceKeychainPath(root: string): string {
  return path.posix.join(root, "Library", "Keychains", "login.keychain-db");
}

export type KeychainResult = "created" | "unlocked" | "skipped";

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
 * A senha é vazia de propósito. O arquivo fica 0600 dentro do HOME do próprio
 * usuário: ele separa espaços, não protege o usuário de si.
 *
 * Destrancar é o passo que não pode faltar, e vale também para o keychain que
 * já existe. Só o keychain de verdade do usuário é destrancado pelo login do
 * macOS; o do espaço nasce e reinicia trancado. Trancado, cada chamada do
 * `security` abre o diálogo "security wants to use the login keychain" — e
 * quem chama é o próprio `claude`, que guarda a credencial dele ali. Era um
 * diálogo por sessão aberta.
 *
 * Nunca lança: keychain é conveniência, abrir o terminal é o que importa.
 */
export async function ensureSpaceKeychain(root: string, deps: KeychainDeps = realKeychainDeps): Promise<KeychainResult> {
  const file = spaceKeychainPath(root);
  try {
    const existe = await deps.exists(file);
    if (!existe) {
      await deps.mkdir(path.posix.dirname(file));
      await deps.run("security", ["create-keychain", "-p", "", file]);
      // Sem argumento de lock: nada de timeout de 300s nem lock ao dormir.
      await deps.run("security", ["set-keychain-settings", file]);
      await deps.chmod(file, 0o600);
    }
    // Idempotente e silencioso quando já está destrancado.
    await deps.run("security", ["unlock-keychain", "-p", "", file]);
    return existe ? "unlocked" : "created";
  } catch {
    return "skipped";
  }
}

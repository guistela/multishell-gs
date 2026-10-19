// Keychain próprio por espaço (macOS).
//
// O Multishell troca o HOME do shell pela raiz do espaço. O macOS resolve o
// keychain padrão a partir do HOME. Com o espaço isolado e nenhum keychain ali,
// qualquer CLI que tente guardar credencial recebe o diálogo "A keychain cannot
// be found to store ...".
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
  /** `home` é o HOME do espaço. Todo `security` depende dele. */
  run: (bin: string, args: string[], home: string) => Promise<void>;
  chmod: (p: string, mode: number) => Promise<void>;
}

/** O keychain do espaço, dado o HOME do espaço.
 *
 *  O nome NÃO é `login.keychain-db`. O `security` recusa destrancar qualquer
 *  arquivo com esse nome, com senha vazia ou não: o securityd trata o nome como
 *  o keychain real do login e cobra a senha da conta do usuário. Medido no
 *  macOS 25.6. Com outro nome, `unlock-keychain -p ""` passa em silêncio.
 *
 *  `posix` fixo: só o macOS chega aqui, e assim o teste vale em qualquer runner. */
export function spaceKeychainPath(root: string): string {
  return path.posix.join(root, "Library", "Keychains", "espaco.keychain-db");
}

/** Onde o `security` grava o keychain padrão do HOME. */
function prefsDir(root: string): string {
  return path.posix.join(root, "Library", "Preferences");
}

export type KeychainResult = "created" | "unlocked" | "skipped";

export const realKeychainDeps: KeychainDeps = {
  exists: async (p) => { try { await fs.access(p); return true; } catch { return false; } },
  mkdir: async (p) => { await fs.mkdir(p, { recursive: true }); },
  run: async (bin, args, home) => {
    await execFileAsync(bin, args, { timeout: 10_000, env: { ...process.env, HOME: home } });
  },
  chmod: async (p, mode) => { await fs.chmod(p, mode); },
};

/**
 * Garante o keychain do espaço. Idempotente: existindo, não recria — os
 * segredos já guardados ficam onde estão.
 *
 * A senha é vazia de propósito. O arquivo fica 0600 dentro do HOME do próprio
 * usuário: ele separa espaços, não protege o usuário de si. Senha de verdade
 * precisaria ficar guardada em algum lugar, e esse lugar seria o keychain.
 *
 * Apontar o padrão não pode faltar. Fora do nome convencional, o keychain só
 * vira o padrão do espaço se o Multishell apontar, e é o padrão que o `claude`
 * usa ao guardar a credencial dele.
 *
 * Destrancar também não pode faltar, e vale para o keychain que já existe. Só o
 * keychain de verdade do usuário é destrancado pelo login do macOS; o do espaço
 * nasce e reinicia trancado. Trancado, cada chamada do `security` abre o diálogo
 * "security wants to use the login keychain" — um por sessão aberta.
 *
 * Nunca lança: keychain é conveniência, abrir o terminal é o que importa.
 */
export async function ensureSpaceKeychain(root: string, deps: KeychainDeps = realKeychainDeps): Promise<KeychainResult> {
  const file = spaceKeychainPath(root);
  try {
    const existe = await deps.exists(file);
    if (!existe) {
      await deps.mkdir(path.posix.dirname(file));
      await deps.run("security", ["create-keychain", "-p", "", file], root);
      // Sem argumento de lock: nada de timeout de 300s nem lock ao dormir.
      await deps.run("security", ["set-keychain-settings", file], root);
      await deps.chmod(file, 0o600);
    }
    // Sem a pasta, o `security` sai com 0 e não grava nada.
    await deps.mkdir(prefsDir(root));
    await deps.run("security", ["list-keychains", "-s", file], root);
    await deps.run("security", ["default-keychain", "-s", file], root);
    // Idempotente e silencioso quando já está destrancado.
    await deps.run("security", ["unlock-keychain", "-p", "", file], root);
    return existe ? "unlocked" : "created";
  } catch {
    return "skipped";
  }
}

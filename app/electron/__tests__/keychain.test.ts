import { describe, expect, it, vi } from "vitest";
import { ensureSpaceKeychain, spaceKeychainPath, type KeychainDeps } from "../keychain";

const ROOT = "/Users/fulano/.multishell/profiles/activitymon";
const KC = `${ROOT}/Library/Keychains/espaco.keychain-db`;

function deps(over: Partial<KeychainDeps> = {}): KeychainDeps {
  return {
    exists: vi.fn(async () => false),
    mkdir: vi.fn(async () => {}),
    run: vi.fn(async () => {}),
    chmod: vi.fn(async () => {}),
    ...over,
  };
}

function subcomandos(d: KeychainDeps): string[] {
  return (d.run as any).mock.calls.map((c: any[]) => c[1][0]);
}

describe("spaceKeychainPath", () => {
  // O `security` recusa destrancar QUALQUER arquivo chamado `login.keychain-db`,
  // com senha vazia ou não: o securityd trata o nome como o keychain real do
  // login e cobra a senha da conta. Medido no macOS 25.6. Com outro nome, o
  // `unlock-keychain -p ""` passa. Daí `espaco.keychain-db`.
  it("usa espaco.keychain-db, nunca o nome login.keychain-db", () => {
    expect(spaceKeychainPath(ROOT)).toBe(KC);
  });
});

describe("ensureSpaceKeychain", () => {
  it("cria o keychain com senha vazia e sem timeout", async () => {
    const d = deps();
    expect(await ensureSpaceKeychain(ROOT, d)).toBe("created");
    expect(d.mkdir).toHaveBeenCalledWith(`${ROOT}/Library/Keychains`);
    // Senha vazia é deliberada: o espaço não tem onde guardar uma senha sem
    // cair no mesmo problema que ela resolveria.
    expect(d.run).toHaveBeenCalledWith("security", ["create-keychain", "-p", "", KC], ROOT);
    // Sem argumento de lock: nada de timeout de 300s nem lock ao dormir.
    expect(d.run).toHaveBeenCalledWith("security", ["set-keychain-settings", KC], ROOT);
  });

  // O `default-keychain -s` grava em `$HOME/Library/Preferences`. Sem a pasta,
  // o `security` sai com 0 e não grava nada: o espaço fica sem keychain padrão.
  it("cria Library/Preferences antes de apontar o padrão", async () => {
    const d = deps();
    await ensureSpaceKeychain(ROOT, d);
    expect(d.mkdir).toHaveBeenCalledWith(`${ROOT}/Library/Preferences`);
  });

  it("deixa o arquivo só para o dono", async () => {
    const d = deps();
    await ensureSpaceKeychain(ROOT, d);
    expect(d.chmod).toHaveBeenCalledWith(KC, 0o600);
  });

  it("não recria o que já existe: os segredos do espaço ficam onde estão", async () => {
    const d = deps({ exists: vi.fn(async () => true) });
    expect(await ensureSpaceKeychain(ROOT, d)).toBe("unlocked");
    expect(subcomandos(d)).not.toContain("create-keychain");
  });

  // Fora do nome convencional, o keychain só vira o padrão do espaço se o
  // Multishell apontar. É ele que o `claude` usa ao guardar a credencial.
  it("aponta o keychain como padrão e único da busca", async () => {
    const d = deps();
    await ensureSpaceKeychain(ROOT, d);
    expect(d.run).toHaveBeenCalledWith("security", ["list-keychains", "-s", KC], ROOT);
    expect(d.run).toHaveBeenCalledWith("security", ["default-keychain", "-s", KC], ROOT);
  });

  // O travamento não sobrevive ao reboot. Keychain trancado faz o macOS pedir
  // a senha a cada chamada do `security`, e é o claude que chama, a cada sessão.
  it("destranca o keychain que já existe", async () => {
    const d = deps({ exists: vi.fn(async () => true) });
    await ensureSpaceKeychain(ROOT, d);
    expect(d.run).toHaveBeenCalledWith("security", ["unlock-keychain", "-p", "", KC], ROOT);
  });

  it("destranca também o que acabou de criar", async () => {
    const d = deps();
    await ensureSpaceKeychain(ROOT, d);
    expect(subcomandos(d)).toContain("unlock-keychain");
  });

  it("destranca depois de configurar, nunca antes de existir", async () => {
    const d = deps();
    await ensureSpaceKeychain(ROOT, d);
    expect(subcomandos(d)).toEqual([
      "create-keychain",
      "set-keychain-settings",
      "list-keychains",
      "default-keychain",
      "unlock-keychain",
    ]);
  });

  // Todo `security` roda com o HOME do espaço. É o HOME que diz ao macOS qual
  // keychain é o padrão, e é nele que o `default-keychain -s` grava.
  it("roda todo security com o HOME do espaço", async () => {
    const d = deps();
    await ensureSpaceKeychain(ROOT, d);
    for (const c of (d.run as any).mock.calls) expect(c[2]).toBe(ROOT);
  });

  it("falha ao destrancar não apaga nem recria nada", async () => {
    const d = deps({
      exists: vi.fn(async () => true),
      run: vi.fn(async (_b: string, args: string[]) => {
        if (args[0] === "unlock-keychain") throw new Error("senha mudou");
      }),
    });
    expect(await ensureSpaceKeychain(ROOT, d)).toBe("skipped");
    expect(d.chmod).not.toHaveBeenCalled();
  });

  it("falha do security não derruba o spawn", async () => {
    const d = deps({ run: vi.fn(async () => { throw new Error("security indisponível"); }) });
    expect(await ensureSpaceKeychain(ROOT, d)).toBe("skipped");
  });
});

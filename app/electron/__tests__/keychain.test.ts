import { describe, expect, it, vi } from "vitest";
import { ensureSpaceKeychain, spaceKeychainPath, type KeychainDeps } from "../keychain";

const ROOT = "/Users/fulano/.multishell/profiles/activitymon";
const KC = `${ROOT}/Library/Keychains/login.keychain-db`;

function deps(over: Partial<KeychainDeps> = {}): KeychainDeps {
  return {
    exists: vi.fn(async () => false),
    mkdir: vi.fn(async () => {}),
    run: vi.fn(async () => {}),
    chmod: vi.fn(async () => {}),
    ...over,
  };
}

describe("spaceKeychainPath", () => {
  it("é o login.keychain-db dentro do HOME do espaço", () => {
    // O macOS resolve o keychain do usuário a partir do $HOME. Com o HOME do
    // espaço e nenhum arquivo ali, ele abre o diálogo "Keychain Not Found".
    expect(spaceKeychainPath(ROOT)).toBe(KC);
  });
});

describe("ensureSpaceKeychain", () => {
  it("cria o keychain com senha vazia e sem timeout", async () => {
    const d = deps();
    expect(await ensureSpaceKeychain(ROOT, d)).toBe("created");
    expect(d.mkdir).toHaveBeenCalledWith(`${ROOT}/Library/Keychains`);
    // Senha vazia é deliberada: `security unlock-keychain` não destranca
    // keychain com senha fora de uma sessão gráfica, e aí o diálogo volta.
    expect(d.run).toHaveBeenCalledWith("security", ["create-keychain", "-p", "", KC]);
    // Sem argumento de lock: nada de timeout de 300s nem lock ao dormir.
    expect(d.run).toHaveBeenCalledWith("security", ["set-keychain-settings", KC]);
  });

  it("deixa o arquivo só para o dono", async () => {
    const d = deps();
    await ensureSpaceKeychain(ROOT, d);
    expect(d.chmod).toHaveBeenCalledWith(KC, 0o600);
  });

  it("não recria o que já existe: os segredos do espaço ficam onde estão", async () => {
    const d = deps({ exists: vi.fn(async () => true) });
    expect(await ensureSpaceKeychain(ROOT, d)).toBe("kept");
    expect(d.run).not.toHaveBeenCalled();
  });

  it("falha do security não derruba o spawn", async () => {
    const d = deps({ run: vi.fn(async () => { throw new Error("security indisponível"); }) });
    expect(await ensureSpaceKeychain(ROOT, d)).toBe("skipped");
  });
});

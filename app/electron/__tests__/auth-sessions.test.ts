import { describe, expect, it, vi } from "vitest";
import { AUTH_PROVIDERS, checkProvider, listAuthSessions, type AuthProviderDef } from "../auth-sessions";

const byId = (id: string): AuthProviderDef => AUTH_PROVIDERS.find((p) => p.id === id)!;
const opts = { env: { PATH: "/usr/bin", HOME: "/espaco" }, cwd: "/espaco" };

/** Simula o execFile promisificado: resolve com stdout/stderr ou rejeita. */
const execOk = (stdout: string, stderr = "") => vi.fn(async () => ({ stdout, stderr })) as any;
const execFail = (error: Record<string, unknown>) =>
  vi.fn(async () => {
    throw Object.assign(new Error("falhou"), error);
  }) as any;

describe("checkProvider", () => {
  it("gh autenticado devolve a conta e o host", async () => {
    const res = await checkProvider(byId("gh"), {
      ...opts,
      exec: execOk("", "✓ Logged in to github.com account guistela (keyring)"),
    });
    expect(res.logged_in).toBe(true);
    expect(res.account).toBe("guistela");
    expect(res.detail).toBe("github.com");
  });

  it("gh sem login não vira sessão ativa", async () => {
    const res = await checkProvider(byId("gh"), { ...opts, exec: execFail({ stderr: "You are not logged into any GitHub hosts" }) });
    expect(res.installed).toBe(true);
    expect(res.logged_in).toBe(false);
    expect(res.account).toBeNull();
  });

  it("CLI ausente aparece como não instalada, sem erro", async () => {
    const res = await checkProvider(byId("gcloud"), { ...opts, exec: execFail({ code: "ENOENT" }) });
    expect(res.installed).toBe(false);
    expect(res.logged_in).toBe(false);
  });

  it("gcloud devolve a conta ativa", async () => {
    const res = await checkProvider(byId("gcloud"), { ...opts, exec: execOk("gs@example.com\n") });
    expect(res).toMatchObject({ logged_in: true, account: "gs@example.com" });
  });

  it("az mostra usuário e assinatura", async () => {
    const json = JSON.stringify({ user: { name: "gs@corp.com" }, name: "Assinatura Dev" });
    const res = await checkProvider(byId("az"), { ...opts, exec: execOk(json) });
    expect(res.account).toBe("gs@corp.com");
    expect(res.detail).toContain("Assinatura Dev");
  });

  it("firebase lê a conta da listagem", async () => {
    const res = await checkProvider(byId("firebase"), { ...opts, exec: execOk("Logged in as gs@example.com") });
    expect(res).toMatchObject({ logged_in: true, account: "gs@example.com" });
  });

  it("firebase sem conta autorizada fica inativo", async () => {
    const res = await checkProvider(byId("firebase"), { ...opts, exec: execOk("No authorized accounts") });
    expect(res.logged_in).toBe(false);
  });

  it("aws resume o ARN e a conta", async () => {
    const json = JSON.stringify({ Arn: "arn:aws:iam::123:user/gs", Account: "123" });
    const res = await checkProvider(byId("aws"), { ...opts, exec: execOk(json) });
    expect(res.account).toBe("gs");
    expect(res.detail).toContain("123");
  });

  it("npm sem sessão não inventa usuário", async () => {
    const res = await checkProvider(byId("npm"), { ...opts, exec: execFail({ stdout: "", stderr: "ENEEDAUTH" }) });
    expect(res.logged_in).toBe(false);
  });

  it("sempre devolve o comando de login para o botão da interface", async () => {
    const res = await checkProvider(byId("gh"), { ...opts, exec: execFail({ stderr: "not logged in" }) });
    expect(res.login_command).toBe("gh auth login");
    expect(res.logout_command).toBe("gh auth logout");
  });

  it("passa o ambiente isolado do espaço para a CLI", async () => {
    const exec = execOk("gs@example.com");
    await checkProvider(byId("gcloud"), { env: { HOME: "/espaco-x", PATH: "/bin" }, cwd: "/espaco-x", exec });
    expect(exec.mock.calls[0][2]).toMatchObject({ env: { HOME: "/espaco-x" }, cwd: "/espaco-x" });
  });
});

describe("listAuthSessions", () => {
  it("consulta todas as CLIs do catálogo", async () => {
    const exec = execOk("");
    const res = await listAuthSessions({ ...opts, exec });
    expect(res).toHaveLength(AUTH_PROVIDERS.length);
    expect(exec).toHaveBeenCalledTimes(AUTH_PROVIDERS.length);
  });

  it("uma CLI quebrada não derruba as outras", async () => {
    const exec = vi.fn(async (file: string) => {
      if (file === "gh") throw Object.assign(new Error("x"), { code: "ENOENT" });
      return { stdout: "gs@example.com", stderr: "" };
    }) as any;
    const res = await listAuthSessions({ ...opts, exec });
    expect(res.find((r) => r.id === "gh")?.installed).toBe(false);
    expect(res.find((r) => r.id === "gcloud")?.logged_in).toBe(true);
  });
});

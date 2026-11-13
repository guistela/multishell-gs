import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { NotificationCenter } from "../notifications";
import { NotifyServer } from "../notify-server";
import { cliSource, shimSource } from "../notify-cli";

const run = promisify(execFile);

// O CLI é um arquivo gerado dentro do espaço. O teste roda o arquivo de verdade
// contra um servidor de verdade: é o único jeito de saber que o contrato fecha.
let dir: string;
let cliJs: string;
let sock: string;
let center: NotificationCenter;
let srv: NotifyServer;
let token: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "ms-cli-"));
  cliJs = join(dir, "cli.cjs");
  writeFileSync(cliJs, cliSource());
  sock = join(dir, "s.sock");
  center = new NotificationCenter();
  srv = new NotifyServer(center);
  srv.listen(sock);
  token = srv.register("s1", "e1");
  await new Promise((r) => setTimeout(r, 120));
});

afterAll(() => {
  srv.close();
  rmSync(dir, { recursive: true, force: true });
});

/** Espera a pergunta chegar no servidor. Sleep fixo falha com a máquina ocupada. */
async function esperaPergunta(): Promise<string> {
  for (let i = 0; i < 200; i += 1) {
    const n = center.list().find((x) => x.ask && x.answer === undefined);
    if (n) return n.id;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("a pergunta não chegou no servidor");
}

function cli(args: string[], env: Record<string, string> = {}) {
  return run(process.execPath, [cliJs, ...args], {
    env: { ...process.env, MULTISHELL_NOTIFY_SOCK: sock, MULTISHELL_NOTIFY_TOKEN: token, ...env },
    timeout: 10_000,
  });
}

describe("notify", () => {
  it("manda título e corpo e sai calado", async () => {
    const { stdout } = await cli(["notify", "Testes verdes", "--body", "340 passaram", "--level", "warn"]);
    expect(stdout.trim()).toBe("");
    expect(center.list()[0]).toMatchObject({ title: "Testes verdes", body: "340 passaram", level: "warn", session_id: "s1" });
  });

  it("junta palavras soltas no título: `multishell notify build terminou`", async () => {
    await cli(["notify", "build", "terminou"]);
    expect(center.list()[0].title).toBe("build terminou");
  });
});

describe("ask", () => {
  it("bloqueia até a resposta e imprime o que eu respondi", async () => {
    const correndo = cli(["ask", "Faço o push?", "--option", "sim", "--option", "não"]);
    const id = await esperaPergunta();

    expect(center.find(id)?.ask?.options).toEqual(["sim", "não"]);
    center.answer(id, "sim");
    srv.deliverAnswers();

    const { stdout } = await correndo;
    expect(stdout.trim()).toBe("sim");
  });

  // Saída 2 = ninguém respondeu. O agente distingue "não" de "sem resposta".
  it("cancelar sai com código 2 e sem nada no stdout", async () => {
    const correndo = cli(["ask", "Faço o push?"]);
    center.dismiss(await esperaPergunta());
    srv.deliverAnswers();

    const e = await correndo.catch((err) => err);
    expect(e.code).toBe(2);
    expect(String(e.stdout).trim()).toBe("");
  });
});

describe("erros", () => {
  it("fora do Multishell avisa e sai com 1", async () => {
    const e = await cli(["notify", "oi"], { MULTISHELL_NOTIFY_SOCK: "", MULTISHELL_NOTIFY_TOKEN: "" }).catch((err) => err);
    expect(e.code).toBe(1);
    expect(String(e.stderr)).toMatch(/multishell/i);
  });

  it("sem subcomando mostra o uso e sai com 1", async () => {
    const e = await cli([]).catch((err) => err);
    expect(e.code).toBe(1);
    expect(String(e.stderr)).toMatch(/notify/);
  });

  it("token inválido devolve o erro do servidor", async () => {
    const e = await cli(["notify", "oi"], { MULTISHELL_NOTIFY_TOKEN: "chutei" }).catch((err) => err);
    expect(e.code).toBe(1);
    expect(String(e.stderr)).toMatch(/token/);
  });
});

describe("shimSource", () => {
  it("chama o binário do Electron em modo node", () => {
    const s = shimSource("/Applications/Multishell.app/Contents/MacOS/Multishell", "/espaco/bin/cli.js");
    expect(s).toContain("ELECTRON_RUN_AS_NODE=1");
    expect(s).toContain("/Applications/Multishell.app/Contents/MacOS/Multishell");
    expect(s).toContain("/espaco/bin/cli.js");
    expect(s.startsWith("#!/bin/sh")).toBe(true);
  });

  // O usuário pode ter instalado em "Multishell 2.app". Sem aspas o exec quebra.
  it("protege caminho com espaço", () => {
    expect(shimSource("/Apps/Multi shell.app/x", "/e/b/cli.js")).toContain('"/Apps/Multi shell.app/x"');
  });
});

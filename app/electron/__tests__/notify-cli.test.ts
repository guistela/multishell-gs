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

function cli(args: string[], env: Record<string, string> = {}, stdin?: string) {
  const p = run(process.execPath, [cliJs, ...args], {
    env: { ...process.env, MULTISHELL_NOTIFY_SOCK: sock, MULTISHELL_NOTIFY_TOKEN: token, ...env },
    timeout: 10_000,
  });
  if (stdin !== undefined) {
    p.child.stdin?.write(stdin);
    p.child.stdin?.end();
  }
  return p;
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

// O `hook` é o que o Claude Code chama sozinho, com a chave ligada no espaço.
// Ele recebe o JSON do evento no stdin.
describe("hook", () => {
  it("Notification vira aviso com a mensagem do Claude Code", async () => {
    await cli(["hook", "Notification"], {}, JSON.stringify({ message: "Permissão para rodar git push" }));
    expect(center.list()[0]).toMatchObject({
      title: "Claude precisa de você",
      body: "Permissão para rodar git push",
      level: "warn",
    });
  });

  it("Stop avisa que o turno acabou", async () => {
    await cli(["hook", "Stop"], {}, "{}");
    expect(center.list()[0]).toMatchObject({ title: "Claude terminou o turno", level: "info" });
  });

  // Hook que falha não pode quebrar o agente. Ele sai 0 mesmo sem entender nada.
  it("stdin vazio ainda notifica e sai com 0", async () => {
    const { stdout } = await cli(["hook", "Stop"], {}, "");
    expect(stdout.trim()).toBe("");
    expect(center.list()[0].title).toBe("Claude terminou o turno");
  });

  it("evento desconhecido não derruba o agente", async () => {
    const { stdout } = await cli(["hook", "Seja-O-Que-For"], {}, "{}");
    expect(stdout.trim()).toBe("");
  });

  it("fora do Multishell o hook sai calado com 0: o agente segue", async () => {
    const r = await cli(["hook", "Stop"], { MULTISHELL_NOTIFY_SOCK: "", MULTISHELL_NOTIFY_TOKEN: "" }, "{}");
    expect(r.stdout.trim()).toBe("");
  });
});

// ---------------------------------------------------------------------------
// PreToolUse: a pergunta de permissão vai para o painel e a resposta volta
// como decisão para o Claude Code.
// ---------------------------------------------------------------------------
describe("hook PreToolUse", () => {
  /** A decisão que o CLI imprimiu no stdout. */
  function decisao(stdout: string): any {
    return JSON.parse(stdout.trim()).hookSpecificOutput;
  }

  async function pergunta(entrada: object) {
    const correndo = cli(["hook", "PreToolUse"], {}, JSON.stringify(entrada));
    const id = await esperaPergunta();
    return { correndo, id };
  }

  it("mostra a ferramenta e o comando, e bloqueia esperando", async () => {
    const { correndo, id } = await pergunta({
      tool_name: "Bash",
      tool_input: { command: "git push --force" },
    });
    const n = center.find(id)!;
    expect(n.title).toContain("Bash");
    expect(n.body).toBe("git push --force");
    expect(n.level).toBe("warn");
    // Botões e campo livre: dá para permitir, negar ou dizer o que fazer.
    expect(n.ask?.options).toEqual(["Permitir", "Negar"]);
    expect(n.ask?.placeholder).toBeTruthy();

    center.answer(id, "Permitir");
    srv.deliverAnswers();
    expect(decisao((await correndo).stdout)).toMatchObject({
      hookEventName: "PreToolUse",
      permissionDecision: "allow",
    });
  });

  it("Negar vira deny", async () => {
    const { correndo, id } = await pergunta({ tool_name: "Bash", tool_input: { command: "rm -rf /" } });
    center.answer(id, "Negar");
    srv.deliverAnswers();
    expect(decisao((await correndo).stdout)).toMatchObject({ permissionDecision: "deny" });
  });

  it("texto livre nega e vira orientação para o agente", async () => {
    const { correndo, id } = await pergunta({ tool_name: "Bash", tool_input: { command: "npm test" } });
    center.answer(id, "use pnpm test, não npm");
    srv.deliverAnswers();
    expect(decisao((await correndo).stdout)).toMatchObject({
      permissionDecision: "deny",
      permissionDecisionReason: "use pnpm test, não npm",
    });
  });

  // Sem decisão nossa o Claude Code segue o fluxo normal: pergunta no terminal.
  it("cancelar não decide nada e sai com 0", async () => {
    const { correndo, id } = await pergunta({ tool_name: "Write", tool_input: { file_path: "/tmp/a.txt" } });
    expect(center.find(id)?.body).toBe("/tmp/a.txt");
    center.answer(id, null);
    srv.deliverAnswers();
    const { stdout } = await correndo;
    expect(stdout.trim()).toBe("");
  });

  it("ferramenta sem campo conhecido mostra a entrada inteira", async () => {
    const { correndo, id } = await pergunta({ tool_name: "Grep", tool_input: { pattern: "foo" } });
    expect(center.find(id)?.body).toBe('{"pattern":"foo"}');
    center.answer(id, "Permitir");
    srv.deliverAnswers();
    await correndo;
  });

  it("fora do Multishell não decide nada e sai com 0", async () => {
    const r = await cli(
      ["hook", "PreToolUse"],
      { MULTISHELL_NOTIFY_SOCK: "", MULTISHELL_NOTIFY_TOKEN: "" },
      JSON.stringify({ tool_name: "Bash", tool_input: { command: "ls" } }),
    );
    expect(r.stdout.trim()).toBe("");
  });
});

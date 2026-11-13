import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { NotificationCenter } from "../notifications";
import { NotifyServer } from "../notify-server";
import { buildSpawnPlan, materialize, newSpace } from "../space";

const run = promisify(execFile);

// O caminho inteiro, como acontece de verdade: o materialize grava o espaço, o
// PATH do plano de spawn acha o `multishell`, e o CLI fala com o servidor.
describe("ponta a ponta: do espaço ao painel", () => {
  let home: string;
  let center: NotificationCenter;
  let srv: NotifyServer;
  let sock: string;
  let env: Record<string, string>;

  const espaco = newSpace("Cliente X", "#fff", "cliente-x");

  beforeAll(async () => {
    home = mkdtempSync(join(tmpdir(), "ms-e2e-"));
    await materialize(espaco, null, home, "darwin");

    center = new NotificationCenter();
    srv = new NotifyServer(center);
    sock = join(home, "notify.sock");
    srv.listen(sock);

    const plan = buildSpawnPlan({
      space: espaco, provider: null, realHome: home, os: "darwin",
      processEnv: { PATH: "/usr/bin:/bin" }, userShell: "/bin/zsh", cwd: null, defaultCwd: null,
    });
    env = {
      ...plan.env,
      MULTISHELL_NOTIFY_SOCK: sock,
      MULTISHELL_NOTIFY_TOKEN: srv.register("s1", espaco.id),
    };
    await new Promise((r) => setTimeout(r, 120));
  });

  afterAll(() => {
    srv.close();
    rmSync(home, { recursive: true, force: true });
  });

  // `sh -c` resolve o `multishell` pelo PATH, igual ao shell do terminal.
  const noShell = (cmd: string) => run("/bin/sh", ["-c", cmd], { env, timeout: 15_000 });

  it("o PATH do espaço acha o `multishell`", async () => {
    const { stdout } = await noShell("command -v multishell");
    expect(stdout.trim()).toBe(join(home, ".multishell", "profiles", "cliente-x", "bin", "multishell"));
  });

  it("`multishell notify` cria o aviso na sessão e no espaço certos", async () => {
    await noShell('multishell notify "Testes verdes" --body "340 passaram" --level warn');
    expect(center.list()[0]).toMatchObject({
      session_id: "s1", space_id: espaco.id,
      title: "Testes verdes", body: "340 passaram", level: "warn",
    });
  });

  it("`multishell ask` bloqueia e recebe a minha resposta", async () => {
    const correndo = noShell('multishell ask "Faço o push?" --option sim --option nao');
    let id = "";
    for (let i = 0; i < 200 && !id; i += 1) {
      id = center.list().find((n) => n.ask && n.answer === undefined)?.id ?? "";
      if (!id) await new Promise((r) => setTimeout(r, 25));
    }
    expect(id).toBeTruthy();
    center.answer(id, "sim");
    srv.deliverAnswers();
    expect((await correndo).stdout.trim()).toBe("sim");
  });
});

// A aprovação inteira: o materialize escreve o hook, e o comando que ficou no
// settings.json roda de verdade e devolve a decisão que eu dei no painel.
describe("ponta a ponta: aprovação de ferramenta", () => {
  let home: string;
  let center: NotificationCenter;
  let srv: NotifyServer;
  let env: Record<string, string>;
  let hook: string;

  const claude = {
    id: "p", name: "Claude Code", executable: "claude", args: [], bypass_args: [],
    config_env_key: "CLAUDE_CONFIG_DIR", extra_env: [], icon: "", resume_args: [],
  };

  beforeAll(async () => {
    home = mkdtempSync(join(tmpdir(), "ms-ap-"));
    const espaco = newSpace("Cliente X", "#fff", "cliente-x");
    espaco.security = { ...espaco.security, agent_approvals: true };
    await materialize(espaco, claude, home, "darwin");

    const settings = JSON.parse(
      readFileSync(join(home, ".multishell", "profiles", "cliente-x", "providers", "claude-code", "settings.json"), "utf8"),
    );
    const grupo = settings.hooks.PreToolUse[0];
    expect(grupo.matcher).toContain("Bash");
    hook = grupo.hooks[0].command;

    center = new NotificationCenter();
    srv = new NotifyServer(center);
    const sock = join(home, "notify.sock");
    srv.listen(sock);
    env = {
      PATH: "/usr/bin:/bin",
      MULTISHELL_NOTIFY_SOCK: sock,
      MULTISHELL_NOTIFY_TOKEN: srv.register("s1", espaco.id),
    };
    await new Promise((r) => setTimeout(r, 120));
  });

  afterAll(() => {
    srv.close();
    rmSync(home, { recursive: true, force: true });
  });

  /** Roda o comando do settings.json com o JSON do evento no stdin. */
  function rodaHook(entrada: object) {
    const p = run("/bin/sh", ["-c", hook], { env, timeout: 20_000 });
    p.child.stdin?.end(JSON.stringify(entrada));
    return p;
  }

  async function esperaPergunta(): Promise<string> {
    for (let i = 0; i < 400; i += 1) {
      const n = center.list().find((x) => x.ask && x.answer === undefined);
      if (n) return n.id;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error("a pergunta não chegou no painel");
  }

  it("o comando do settings.json pergunta no painel e devolve allow", async () => {
    const correndo = rodaHook({ tool_name: "Bash", tool_input: { command: "git push" } });
    const id = await esperaPergunta();
    expect(center.find(id)).toMatchObject({ title: "Permitir Bash?", body: "git push", session_id: "s1" });

    center.answer(id, "Permitir");
    srv.deliverAnswers();
    const saida = JSON.parse((await correndo).stdout.trim());
    expect(saida.hookSpecificOutput).toMatchObject({
      hookEventName: "PreToolUse",
      permissionDecision: "allow",
    });
  });

  it("o texto que eu escrevo vira o motivo da negativa", async () => {
    const correndo = rodaHook({ tool_name: "Bash", tool_input: { command: "npm i -g foo" } });
    const id = await esperaPergunta();
    center.answer(id, "instale local, não global");
    srv.deliverAnswers();
    const saida = JSON.parse((await correndo).stdout.trim());
    expect(saida.hookSpecificOutput).toMatchObject({
      permissionDecision: "deny",
      permissionDecisionReason: "instale local, não global",
    });
  });
});

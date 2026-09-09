import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PtyManager, defaultShell, parseLsofCwd, type PtySender } from "../pty";

const isWin = process.platform === "win32";

/** Captura o que o main mandaria para o renderer. */
function fakeWindow() {
  const events: { channel: string; payload: any }[] = [];
  const sender: PtySender = { send: (channel, payload) => events.push({ channel, payload }) };
  return { win: { webContents: sender }, events };
}

function waitFor(pred: () => boolean, ms = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (pred()) return resolve();
      if (Date.now() - start > ms) return reject(new Error("timeout"));
      setTimeout(tick, 20);
    };
    tick();
  });
}

const managers: PtyManager[] = [];
afterEach(() => managers.forEach((m) => m.killAll()));

describe("PtyManager", () => {
  it.skipIf(isWin)("spawn de /bin/sh -c 'echo ok' emite pty-output e pty-exit", async () => {
    const pty = new PtyManager();
    managers.push(pty);
    const { win, events } = fakeWindow();
    pty.spawn(win, { session_id: "s1", shell: "/bin/sh", shell_args: ["-c", "echo ok"], inherit_env: false });

    await waitFor(() => events.some((e) => e.channel === "pty-exit"));

    const out = events.filter((e) => e.channel === "pty-output");
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].payload.session_id).toBe("s1");
    expect(out[0].payload.data).toBeInstanceOf(Uint8Array);
    const text = Buffer.concat(out.map((e) => Buffer.from(e.payload.data))).toString("utf8");
    expect(text).toContain("ok");

    const exit = events.find((e) => e.channel === "pty-exit")!;
    expect(exit.payload).toEqual({ session_id: "s1", code: 0 });
    expect(pty.has("s1")).toBe(false);
  });

  it.skipIf(isWin)("inherit_env=false passa só req.env + TERM/COLORTERM", async () => {
    const pty = new PtyManager();
    managers.push(pty);
    const { win, events } = fakeWindow();
    process.env.MULTISHELL_LEAK = "leak";
    pty.spawn(win, {
      session_id: "s2",
      shell: "/bin/sh",
      shell_args: ["-c", "env"],
      env: { FOO: "bar" },
      inherit_env: false,
    });
    await waitFor(() => events.some((e) => e.channel === "pty-exit"));
    const text = Buffer.concat(
      events.filter((e) => e.channel === "pty-output").map((e) => Buffer.from(e.payload.data)),
    ).toString("utf8");
    expect(text).toContain("FOO=bar");
    expect(text).toContain("TERM=xterm-256color");
    expect(text).toContain("COLORTERM=truecolor");
    expect(text).not.toContain("MULTISHELL_LEAK");
    delete process.env.MULTISHELL_LEAK;
  });

  it.skipIf(isWin)("write chega ao shell e kill remove a sessão", async () => {
    const pty = new PtyManager();
    managers.push(pty);
    const { win, events } = fakeWindow();
    pty.spawn(win, { session_id: "s3", shell: "/bin/sh", inherit_env: false, env: { PS1: "" } });
    pty.write("s3", Array.from(new TextEncoder().encode("echo hello-$((1+1))\n")));
    await waitFor(() =>
      Buffer.concat(events.filter((e) => e.channel === "pty-output").map((e) => Buffer.from(e.payload.data)))
        .toString("utf8")
        .includes("hello-2"),
    );
    pty.resize("s3", 100, 30);
    pty.kill("s3");
    expect(pty.has("s3")).toBe(false);
    expect(() => pty.write("s3", "x")).toThrow(/sessão não existe/);
  });

  it.skipIf(process.platform !== "darwin" && process.platform !== "linux")("cwd do shell recém-spawnado é o tempdir", async () => {
    const dir = mkdtempSync(join(tmpdir(), "multishell-pty-"));
    const pty = new PtyManager();
    managers.push(pty);
    const { win } = fakeWindow();
    pty.spawn(win, { session_id: "s4", shell: "/bin/sh", cwd: dir, inherit_env: false });
    let got: string | null = null;
    for (let i = 0; i < 50 && !got; i++) {
      got = await pty.cwd("s4");
      if (!got) await new Promise((r) => setTimeout(r, 20));
    }
    expect(got).not.toBeNull();
    expect(realpathSync(got!)).toBe(realpathSync(dir));
    pty.kill("s4");
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("parseLsofCwd", () => {
  it("lê a linha n do formato -Fn", () => {
    expect(parseLsofCwd("p123\nfcwd\nn/Users/mock/workspace\n")).toBe("/Users/mock/workspace");
    expect(parseLsofCwd("")).toBeNull();
  });
});

describe("defaultShell", () => {
  it.skipIf(isWin)("usa $SHELL ou /bin/zsh", () => {
    const old = process.env.SHELL;
    process.env.SHELL = "/bin/bash";
    expect(defaultShell()).toBe("/bin/bash");
    delete process.env.SHELL;
    expect(defaultShell()).toBe("/bin/zsh");
    if (old) process.env.SHELL = old;
  });
});

describe("PtyManager — anexos e ring buffer (fase 8)", () => {
  it.skipIf(isWin)("spawn é idempotente: segunda chamada anexa e devolve replay", async () => {
    const pty = new PtyManager();
    managers.push(pty);
    const a = fakeWindow();
    const r1 = pty.spawn(a.win, { session_id: "r1", shell: "/bin/sh", inherit_env: false, env: { PS1: "" } });
    expect(r1).toEqual({ attached: false });
    pty.write("r1", "echo ola-mundo\n");
    await waitFor(() => Buffer.concat(a.events.filter((e) => e.channel === "pty-output").map((e) => Buffer.from(e.payload.data))).toString("utf8").includes("ola-mundo"));

    const b = fakeWindow();
    const r2 = pty.spawn(b.win, { session_id: "r1", shell: "/bin/sh", inherit_env: false });
    expect(r2.attached).toBe(true);
    expect(r2.attached && r2.replay).toBeInstanceOf(Uint8Array);
    expect(Buffer.from((r2 as { replay: Uint8Array }).replay).toString("utf8")).toContain("ola-mundo");

    // Depois de anexar, as duas janelas recebem o output.
    pty.write("r1", "echo segundo-eco\n");
    await waitFor(() => b.events.some((e) => e.channel === "pty-output" && Buffer.from(e.payload.data).toString("utf8").includes("segundo-eco")));
    await waitFor(() => a.events.some((e) => e.channel === "pty-output" && Buffer.from(e.payload.data).toString("utf8").includes("segundo-eco")));
    pty.kill("r1");
  });

  it.skipIf(isWin)("attach devolve replay e não cria PTY; sessão inexistente lança", () => {
    const pty = new PtyManager();
    managers.push(pty);
    expect(() => pty.attach("nope", fakeWindow().win.webContents)).toThrow(/sessão não existe/);
  });

  it.skipIf(isWin)("replay corta em 256 KB mantendo o final; pty-exit limpa o buffer", async () => {
    const pty = new PtyManager();
    managers.push(pty);
    const a = fakeWindow();
    // 300 KB: 'a' × 300k e um marcador no fim.
    pty.spawn(a.win, { session_id: "big", shell: "/bin/sh", shell_args: ["-c", "head -c 300000 /dev/zero | tr '\\0' a; printf FIM"], inherit_env: false });
    await waitFor(() => a.events.some((e) => e.channel === "pty-exit"));
    expect(pty.has("big")).toBe(false);
    expect(pty.bufferSize("big")).toBe(0);
  });

  it.skipIf(isWin)("ring buffer mantém só os últimos 256 KB", () => {
    const pty = new PtyManager();
    managers.push(pty);
    const a = fakeWindow();
    pty.spawn(a.win, { session_id: "rb", shell: "/bin/sh", shell_args: ["-c", "sleep 5"], inherit_env: false });
    // Alimenta o buffer diretamente (sem depender do throughput do PTY).
    for (let i = 0; i < 40; i++) pty.pushOutput("rb", Buffer.alloc(10_000, "a"));
    pty.pushOutput("rb", Buffer.from("FIM"));
    const replay = pty.attach("rb", fakeWindow().win.webContents);
    expect(replay.byteLength).toBe(256 * 1024);
    const text = Buffer.from(replay).toString("utf8");
    expect(text.endsWith("FIM")).toBe(true);
    expect(text.startsWith("a")).toBe(true);
    pty.kill("rb");
  });

  it.skipIf(isWin)("broadcast só para anexados e vivos; destruídos são removidos", async () => {
    const pty = new PtyManager();
    managers.push(pty);
    const a = fakeWindow();
    const b = fakeWindow();
    let bDead = false;
    b.win.webContents.isDestroyed = () => bDead;
    const c = fakeWindow();
    pty.spawn(a.win, { session_id: "bc", shell: "/bin/sh", shell_args: ["-c", "sleep 5"], inherit_env: false });
    pty.attach("bc", b.win.webContents);
    bDead = true;
    pty.pushOutput("bc", Buffer.from("x"));
    expect(a.events.filter((e) => e.channel === "pty-output")).toHaveLength(1);
    expect(b.events).toHaveLength(0);
    expect(c.events).toHaveLength(0);
    expect(pty.attachedCount("bc")).toBe(1);
    pty.kill("bc");
  });
});

describe("PtyManager.stats", () => {
  it.skipIf(isWin)("conta bytes de entrada e de saída da sessão", async () => {
    const pty = new PtyManager();
    managers.push(pty);
    const { win, events } = fakeWindow();
    pty.spawn(win, { session_id: "st1", shell: "/bin/sh", shell_args: ["-c", "printf ok; sleep 5"], inherit_env: false });
    await waitFor(() => events.some((e) => e.channel === "pty-output"));
    pty.write("st1", "abc");
    pty.write("st1", new Uint8Array([100, 101]));

    const s = pty.stats("st1")!;
    expect(s.session_id).toBe("st1");
    expect(s.bytes_in).toBe(5);
    expect(s.bytes_out).toBeGreaterThan(0);
    expect(Number.isFinite(Date.parse(s.started_at))).toBe(true);
    pty.kill("st1");
  });

  it.skipIf(isWin)("allStats lista as sessões vivas e kill zera a contagem", async () => {
    const pty = new PtyManager();
    managers.push(pty);
    const { win } = fakeWindow();
    pty.spawn(win, { session_id: "st2", shell: "/bin/sh", shell_args: ["-c", "sleep 5"], inherit_env: false });
    pty.pushOutput("st2", Buffer.from("12345"));
    expect(pty.allStats().map((x) => x.session_id)).toEqual(["st2"]);
    expect(pty.stats("st2")!.bytes_out).toBe(5);

    pty.kill("st2");
    expect(pty.stats("st2")).toBeNull();
    expect(pty.allStats()).toEqual([]);
  });

  it("stats de sessão inexistente devolve null sem lançar", () => {
    const pty = new PtyManager();
    managers.push(pty);
    expect(pty.stats("nada")).toBeNull();
  });
});

describe("PtyManager: marca de atividade", () => {
  it.skipIf(isWin)("stats traz o instante do último output do shell", async () => {
    const pty = new PtyManager();
    managers.push(pty);
    const { win, events } = fakeWindow();
    const antes = Date.now();
    pty.spawn(win, { session_id: "act1", shell: "/bin/sh", shell_args: ["-c", "echo ok; sleep 5"], inherit_env: false });

    await waitFor(() => events.some((e) => e.channel === "pty-output"));

    const last = pty.stats("act1")!.last_output_at!;
    expect(last).toBeGreaterThanOrEqual(antes);
    expect(last).toBeLessThanOrEqual(Date.now());
  });

  it.skipIf(isWin)("sessão que ainda não escreveu vem com last_output_at nulo", async () => {
    const pty = new PtyManager();
    managers.push(pty);
    const { win } = fakeWindow();
    pty.spawn(win, { session_id: "act2", shell: "/bin/sh", shell_args: ["-c", "sleep 5"], inherit_env: false });
    expect(pty.stats("act2")!.last_output_at).toBeNull();
  });

  it.skipIf(isWin)("aviso do próprio app não conta como atividade do agente", async () => {
    const pty = new PtyManager();
    managers.push(pty);
    const { win } = fakeWindow();
    pty.spawn(win, { session_id: "act3", shell: "/bin/sh", shell_args: ["-c", "sleep 5"], inherit_env: false });
    pty.notify("act3", "bloqueado");
    expect(pty.stats("act3")!.last_output_at).toBeNull();
  });
});

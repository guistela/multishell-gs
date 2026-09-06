import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { claude, emitPtyExit, emitPtyOutput, invokeMock, outputListeners, resetBridge, spaceA } from "../../../test/bridge-mocks";
import "../../../i18n";
import { DEFAULT_SETTINGS, useAppStore } from "../../../store";
import type { Session } from "../../../types";

type OscHandler = (data: string) => boolean;
const xt = vi.hoisted(() => ({ instances: [] as Array<{ osc: Record<number, OscHandler>; writes: unknown[]; options: Record<string, unknown>; getSelection: () => string }> }));

vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    cols = 80; rows = 24; options = {};
    osc: Record<number, OscHandler> = {};
    writes: unknown[] = [];
    parser = {
      registerOscHandler: (id: number, cb: OscHandler) => { this.osc[id] = cb; return { dispose: () => { delete this.osc[id]; } }; },
    };
    constructor() { xt.instances.push(this); }
    loadAddon() {} open() {} write(d: unknown) { this.writes.push(d); } writeln() {} dispose() {}
    getSelection() { return ""; }
    selectAll() {}
    clear() {}
    onData() { return { dispose() {} }; }
  },
}));
vi.mock("@xterm/addon-fit", () => ({ FitAddon: class { fit() {} } }));
vi.mock("@xterm/xterm/css/xterm.css", () => ({}));

import { RESUME_TIMEOUT_MS, Terminal, parseOsc7 } from "../Terminal";
import { themeFor } from "../themes";

const session: Session = { id: "s1", title: "A", space_id: spaceA.id, provider_id: claude.id, bypass: true, cwd: "/w", harness_running: true, detached: false };
const plan = { shell: "/bin/zsh", shell_args: [], cwd: "/w", env: {}, inherit_env: true };

const writes = () => invokeMock.mock.calls.filter((c) => c[0] === "pty_write").map((c) => new TextDecoder().decode(c[1].data));
const flush = () => act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
const lastTerm = () => xt.instances[xt.instances.length - 1];

beforeEach(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} disconnect() {} };
  xt.instances.length = 0;
  resetBridge();
  invokeMock.mockImplementation(async (cmd: string, args?: { bypass?: boolean }) => {
    if (cmd === "space_spawn_plan") return plan;
    if (cmd === "provider_resume_line") return `claude --continue${args?.bypass ? " --dangerously-skip-permissions" : ""}`;
    if (cmd === "provider_command_line") return `claude${args?.bypass ? " --dangerously-skip-permissions" : ""}`;
    return undefined;
  });
  useAppStore.setState({ spaces: [spaceA], providers: [claude], sessions: [session], selectedSessionId: "s1", settings: DEFAULT_SETTINGS, loaded: true, migration: null, restoredSessionIds: new Set() });
});
afterEach(() => vi.useRealTimers());

describe("Terminal: resume", () => {
  it("sessão restaurada com harness_running: envia a linha de resume após o primeiro output", async () => {
    vi.useFakeTimers();
    useAppStore.setState({ restoredSessionIds: new Set(["s1"]) });
    render(<Terminal session={session} />);
    await flush();
    expect(invokeMock).toHaveBeenCalledWith("pty_spawn", expect.anything());
    expect(writes()).toEqual([]);
    act(() => emitPtyOutput("s1", [36, 32]));
    await flush();
    expect(invokeMock).toHaveBeenCalledWith("provider_resume_line", { provider: claude, bypass: true });
    expect(writes()).toEqual(["claude --continue --dangerously-skip-permissions\n"]);
    expect(useAppStore.getState().restoredSessionIds.has("s1")).toBe(false);
  });

  it("pty_write manda Uint8Array direto", async () => {
    useAppStore.setState({ restoredSessionIds: new Set(["s1"]) });
    render(<Terminal session={session} />);
    await flush();
    act(() => emitPtyOutput("s1", [36]));
    await flush();
    const write = invokeMock.mock.calls.find((c) => c[0] === "pty_write")!;
    // jsdom e node têm realms distintos: compara pela tag, não por instanceof.
    expect(Object.prototype.toString.call(write[1].data)).toBe("[object Uint8Array]");
  });

  it("sem output: envia após o timeout de 1,5 s", async () => {
    vi.useFakeTimers();
    useAppStore.setState({ restoredSessionIds: new Set(["s1"]) });
    render(<Terminal session={session} />);
    await flush();
    expect(writes()).toEqual([]);
    await act(() => vi.advanceTimersByTimeAsync(RESUME_TIMEOUT_MS));
    await flush();
    expect(writes()).toHaveLength(1);
  });

  it("sessão nova (não restaurada): não envia resume", async () => {
    render(<Terminal session={session} />);
    await flush();
    act(() => emitPtyOutput("s1", [36]));
    await flush();
    expect(invokeMock).not.toHaveBeenCalledWith("provider_resume_line", expect.anything());
    expect(writes()).toEqual([]);
  });

  it("restaurada sem harness_running: não envia resume", async () => {
    useAppStore.setState({ restoredSessionIds: new Set(["s1"]), sessions: [{ ...session, harness_running: false, detached: false }] });
    render(<Terminal session={{ ...session, harness_running: false, detached: false }} />);
    await flush();
    act(() => emitPtyOutput("s1", [36]));
    await flush();
    expect(writes()).toEqual([]);
    expect(useAppStore.getState().restoredSessionIds.has("s1")).toBe(false);
  });

  it("pty-exit zera harness_running", async () => {
    render(<Terminal session={session} />);
    await flush();
    act(() => emitPtyExit({ session_id: "s1", code: 0 }));
    expect(useAppStore.getState().sessions[0]).toMatchObject({ exit_code: 0, harness_running: false, detached: false });
  });

  it("desmontar remove os listeners da bridge", async () => {
    const { unmount } = render(<Terminal session={session} />);
    await flush();
    expect(outputListeners.get("s1")?.size).toBe(1);
    unmount();
    expect(outputListeners.get("s1")?.size ?? 0).toBe(0);
  });

  it("auto_start_harness: inicia o harness automaticamente após o spawn", async () => {
    vi.useFakeTimers();
    const autoSession: Session = {
      ...session,
      harness_running: false,
      auto_start_harness: true,
    };
    useAppStore.setState({ sessions: [autoSession], selectedSessionId: "s1" });
    render(<Terminal session={autoSession} />);
    await flush();
    act(() => emitPtyOutput("s1", [36, 32]));
    await act(() => vi.advanceTimersByTimeAsync(300));
    await flush();
    expect(invokeMock).toHaveBeenCalledWith("provider_command_line", { provider: claude, bypass: true });
    expect(writes()).toEqual(["claude --dangerously-skip-permissions\n"]);
    expect(useAppStore.getState().sessions[0].auto_start_harness).toBe(false);
    expect(useAppStore.getState().sessions[0].harness_running).toBe(true);
  });
});

describe("Terminal: attach (Fase 8)", () => {
  const cmds = (name: string) => invokeMock.mock.calls.filter((c) => c[0] === name);

  it("spawn attached: escreve o replay no xterm, redimensiona e não faz resume", async () => {
    const replay = new Uint8Array([104, 105]);
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "space_spawn_plan") return plan;
      if (cmd === "pty_spawn") return { attached: true, replay };
      if (cmd === "provider_resume_line") return "claude --continue";
      return undefined;
    });
    useAppStore.setState({ restoredSessionIds: new Set(["s1"]) });
    render(<Terminal session={session} />);
    await flush();
    expect(lastTerm().writes).toContain(replay);
    expect(cmds("pty_resize")).toHaveLength(1);
    act(() => emitPtyOutput("s1", [36]));
    await flush();
    expect(cmds("provider_resume_line")).toHaveLength(0);
    expect(writes()).toEqual([]);
  });

  it("spawn attached sem replay: não escreve nada", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "space_spawn_plan") return plan;
      if (cmd === "pty_spawn") return { attached: true };
      return undefined;
    });
    render(<Terminal session={session} />);
    await flush();
    expect(lastTerm().writes).toEqual([]);
  });

  it("spawn novo ({ attached: false }): faz resume normalmente", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "space_spawn_plan") return plan;
      if (cmd === "pty_spawn") return { attached: false };
      if (cmd === "provider_resume_line") return "claude --continue";
      return undefined;
    });
    useAppStore.setState({ restoredSessionIds: new Set(["s1"]) });
    render(<Terminal session={session} />);
    await flush();
    act(() => emitPtyOutput("s1", [36]));
    await flush();
    expect(writes()).toEqual(["claude --continue\n"]);
  });

  it("desmontar NÃO mata o PTY", async () => {
    const { unmount } = render(<Terminal session={session} />);
    await flush();
    unmount();
    await flush();
    expect(cmds("pty_kill")).toHaveLength(0);
  });

  it("desmontar durante o spawn NÃO mata o PTY", async () => {
    let resolveSpawn: (v: unknown) => void = () => {};
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "space_spawn_plan") return plan;
      if (cmd === "pty_spawn") return new Promise((r) => { resolveSpawn = r; });
      return undefined;
    });
    const { unmount } = render(<Terminal session={session} />);
    await flush();
    unmount();
    resolveSpawn({ attached: false });
    await flush();
    expect(cmds("pty_kill")).toHaveLength(0);
  });
});

describe("Terminal: cwd por OSC 7", () => {
  const uiSets = () => invokeMock.mock.calls.filter((c) => c[0] === "store_set" && c[1].name === "ui-state");

  it("file://host/path atualiza session.cwd e persiste", async () => {
    render(<Terminal session={session} />);
    await flush();
    invokeMock.mockClear();
    expect(lastTerm().osc[7]("file://mac.local/Users/mockuser/proj%20x")).toBe(true);
    expect(useAppStore.getState().sessions[0].cwd).toBe("/Users/mockuser/proj x");
    expect(uiSets()).toHaveLength(1);
  });

  it("mesmo cwd: não atualiza nem persiste", async () => {
    render(<Terminal session={session} />);
    await flush();
    invokeMock.mockClear();
    lastTerm().osc[7]("file://mac.local/w");
    expect(uiSets()).toHaveLength(0);
  });

  it("payload inválido: ignora e consome a sequência", async () => {
    render(<Terminal session={session} />);
    await flush();
    invokeMock.mockClear();
    expect(lastTerm().osc[7]("garbage")).toBe(true);
    expect(useAppStore.getState().sessions[0].cwd).toBe("/w");
    expect(uiSets()).toHaveLength(0);
  });

  it("desmontar remove o handler OSC", async () => {
    const { unmount } = render(<Terminal session={session} />);
    await flush();
    const term = lastTerm();
    expect(term.osc[7]).toBeDefined();
    unmount();
    expect(term.osc[7]).toBeUndefined();
  });
});

describe("parseOsc7", () => {
  it("decodifica file://host/path", () => {
    expect(parseOsc7("file://host/a/b%20c")).toBe("/a/b c");
    expect(parseOsc7("file:///a")).toBe("/a");
  });
  it("windows: tira a barra antes da letra do drive", () => {
    expect(parseOsc7("file://PC/C:/Users/mockuser")).toBe("C:/Users/mockuser");
  });
  it("não file:// ou encoding inválido: null", () => {
    expect(parseOsc7("http://x/y")).toBeNull();
    expect(parseOsc7("/a/b")).toBeNull();
    expect(parseOsc7("file://h/%E0%A4%A")).toBeNull();
  });
});

describe("Terminal: tema por sessão", () => {
  it("usa o tema da própria sessão, não o global do app", async () => {
    const themed: Session = { ...session, id: "s2", theme: "dracula" };
    useAppStore.setState({ sessions: [themed], selectedSessionId: "s2" });
    render(<Terminal session={themed} />);
    await flush();
    expect(lastTerm().options.theme).toEqual(themeFor("dracula"));
  });

  it("cai no tema global quando a sessão não define o seu", async () => {
    render(<Terminal session={session} />);
    await flush();
    expect(lastTerm().options.theme).toEqual(themeFor(DEFAULT_SETTINGS.theme));
  });

  it("aplica troca de tema feita só naquela sessão", async () => {
    render(<Terminal session={session} />);
    await flush();
    act(() => useAppStore.getState().updateSession(session.id, { theme: "nord" }));
    await flush();
    expect(lastTerm().options.theme).toEqual(themeFor("nord"));
  });
});

describe("Terminal: criar tarefa do Kanban a partir da seleção", () => {
  it("cria a tarefa no espaço do terminal, atribuída a ele", async () => {
    const stored: Record<string, any> = {};
    invokeMock.mockImplementation(async (cmd: string, args?: any) => {
      if (cmd === "space_spawn_plan") return plan;
      if (cmd === "store_get" && args?.name === "kanban") return stored.kanban ?? null;
      if (cmd === "store_set" && args?.name === "kanban") { stored.kanban = args.value; return undefined; }
      return undefined;
    });

    const { container } = render(<Terminal session={session} />);
    await flush();
    // A seleção é lida no render do menu; o contextMenu força esse render.
    lastTerm().getSelection = () => "erro no teste de PTY\nstack trace aqui";
    fireEvent.contextMenu(container.querySelector("article, div") ?? container.firstChild!);

    fireEvent.click(await screen.findByText(/Nova tarefa no Kanban/i));
    await flush();

    expect(stored.kanban[spaceA.id].tasks[0].title).toBe("erro no teste de PTY");
    expect(stored.kanban[spaceA.id].tasks[0].assignee_session_id).toBe(session.id);
    expect(stored.kanban[spaceA.id].tasks[0].details).toContain("stack trace");
  });
});

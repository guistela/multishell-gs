import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { ipcHandles, claude, spaceA, spacesRoot, spawnPlanFor, secrets } = vi.hoisted(() => {
  const claude = {
    id: "pv-claude", name: "Claude Code", executable: "claude", args: [] as string[], bypass_args: ["--dangerously-skip-permissions"],
    config_env_key: "CLAUDE_CONFIG_DIR", extra_env: [] as any[], icon: "sparkles", resume_args: ["--continue"],
  };
  const security = { load_user_shell_profile: false, share_keychain: false, share_ssh: false, share_git_config: false, inherit_process_env: false };
  const spaceA = { id: "sp-a", name: "Pessoal", color_hex: "#ff0000", directory_name: "personal", custom_env: [] as any[], security, created_at: "2026-01-01T00:00:00Z" };
  return {
    ipcHandles: new Map<string, (e: unknown, args: unknown) => unknown>(),
    claude,
    spaceA,
    spacesRoot: `${process.env.TMPDIR ?? "/tmp"}/multishell-handlers-root`,
    spawnPlanFor: vi.fn(async (space: any, provider: any, cwd: string | null) => ({
      shell: "/bin/zsh", shell_args: [], cwd, env: { HOME: `/root/${space.directory_name}`, ...(provider ? { PROVIDER: provider.id } : {}) }, inherit_env: false,
    })),
    secrets: new Map<string, string>(),
  };
});

vi.mock("electron", () => ({
  ipcMain: { handle: (name: string, fn: (e: unknown, args: unknown) => unknown) => ipcHandles.set(name, fn) },
  shell: { openPath: vi.fn(async () => "") },
  app: { getPath: () => "/tmp/unused" },
}));

vi.mock("../provider", () => ({
  presets: () => [claude],
  commandLine: (p: any, bypass: boolean) => [p.executable, ...p.args, ...(bypass ? p.bypass_args : [])].join(" "),
  resumeLine: (p: any, bypass: boolean) => [p.executable, ...p.args, ...p.resume_args, ...(bypass ? p.bypass_args : [])].join(" "),
  normalizeProvider: (p: any) => ({ ...p, resume_args: p.resume_args ?? [] }),
  slug: (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
}));

vi.mock("../space", () => ({
  defaultSpaces: () => [spaceA],
  makeDirectoryName: (name: string, existing: string[]) => {
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    let out = base;
    for (let i = 2; existing.includes(out); i++) out = `${base}-${i}`;
    return out;
  },
  spaceRoot: (s: any) => `${spacesRoot}/${s.directory_name}`,
  spawnPlanFor,
}));

vi.mock("../secrets", () => ({
  secretGetValue: (sid: string, key: string) => secrets.get(`${sid}:${key}`) ?? null,
  secretSet: (sid: string, key: string, v: string) => void secrets.set(`${sid}:${key}`, v),
  secretDelete: (sid: string, key: string) => void secrets.delete(`${sid}:${key}`),
}));
vi.mock("../migration", () => ({
  migrateFromSwift: vi.fn(async (dir: string) => ({ spaces: 0, providers: 0, sessions: 0, notes: [dir] })),
}));

import { COMMANDS } from "../ipc";
import { Store } from "../store";
import { createHandlers, registerHandlers, type Handlers } from "../handlers";
import { assertWorkDir } from "../snapshot";

let dir: string;
let h: Handlers;
const ctx = { sender: { send: vi.fn() } };
const openPath = vi.fn(async () => "");
const call = (name: keyof Handlers, args: Record<string, unknown> = {}) => h[name](args, ctx);

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "multishell-handlers-"));
  secrets.clear();
  h = createHandlers({ store: new Store(dir), pty: { spawn: vi.fn(), write: vi.fn(), resize: vi.fn(), kill: vi.fn(), cwd: vi.fn(async () => "/x") } as any, userDataDir: dir, openPath });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("registerHandlers", () => {
  it("registra todos os commands do contrato em ipcMain.handle", () => {
    ipcHandles.clear();
    registerHandlers({ store: new Store(dir), pty: {} as any, userDataDir: dir });
    for (const c of COMMANDS) expect(ipcHandles.has(c), c).toBe(true);
    expect(ipcHandles.size).toBe(COMMANDS.length);
  });
});

describe("store_*", () => {
  it("round-trip", async () => {
    expect(await call("store_get", { name: "ui-state" })).toBeNull();
    await call("store_set", { name: "ui-state", value: { a: 1 } });
    expect(await call("store_get", { name: "ui-state" })).toEqual({ a: 1 });
  });
});

describe("providers", () => {
  it("providers_list devolve presets quando vazio e persiste", async () => {
    expect(await call("providers_list")).toEqual([claude]);
    expect(new Store(dir).get("providers")).toEqual([claude]);
  });

  it("provider_save adiciona, atualiza e limpa segredos", async () => {
    const p = { ...claude, id: "pv-2", name: "Codex", executable: "codex", extra_env: [{ key: "T", value: "x", is_secret: true }] };
    const saved: any = await call("provider_save", { provider: p });
    expect(saved.extra_env[0].value).toBe("");
    expect((await call("providers_list")) as any[]).toHaveLength(2);
    await call("provider_save", { provider: { ...p, name: "Codex 2" } });
    const list = (await call("providers_list")) as any[];
    expect(list).toHaveLength(2);
    expect(list[1].name).toBe("Codex 2");
    await call("provider_delete", { providerId: "pv-2" });
    expect((await call("providers_list")) as any[]).toHaveLength(1);
  });

  it("provider_save rejeita nome e executável vazios", async () => {
    await expect(async () => call("provider_save", { provider: { ...claude, name: " " } })).rejects.toThrow(/nome/);
    await expect(async () => call("provider_save", { provider: { ...claude, executable: "" } })).rejects.toThrow(/execut/);
  });

  it("provider_command_line e provider_resume_line", async () => {
    expect(await call("provider_command_line", { provider: claude, bypass: true })).toBe("claude --dangerously-skip-permissions");
    expect(await call("provider_resume_line", { provider: claude, bypass: false })).toBe("claude --continue");
    expect(await call("provider_presets")).toEqual([claude]);
  });
});

describe("spaces", () => {
  it("spaces_list devolve defaultSpaces quando vazio", async () => {
    expect(await call("spaces_list")).toEqual([spaceA]);
  });

  it("space_save gera directory_name (slug) quando vazio e evita colisão", async () => {
    const saved: any = await call("space_save", { space: { ...spaceA, id: "sp-b", name: "Pessoal", directory_name: "" } });
    expect(saved.directory_name).toBe("pessoal");
    const again: any = await call("space_save", { space: { ...spaceA, id: "sp-c", name: "Pessoal", directory_name: "" } });
    expect(again.directory_name).toBe("pessoal-2");
    expect((await call("spaces_list")) as any[]).toHaveLength(3);
  });

  it("space_save mantém directory_name ao renomear e limpa segredos", async () => {
    await call("spaces_list");
    const saved: any = await call("space_save", {
      space: { ...spaceA, name: "Novo nome", directory_name: "", custom_env: [{ key: "TOKEN", value: "abc", is_secret: true }, { key: "A", value: "1", is_secret: false }] },
    });
    expect(saved.directory_name).toBe("personal");
    expect(saved.custom_env).toEqual([{ key: "TOKEN", value: "", is_secret: true }, { key: "A", value: "1", is_secret: false }]);
    expect((await call("spaces_list")) as any[]).toHaveLength(1);
  });

  it("space_save rejeita nome vazio", async () => {
    await expect(async () => call("space_save", { space: { ...spaceA, name: "" } })).rejects.toThrow(/nome/);
  });

  it("space_delete remove sem apagar pasta", async () => {
    await call("space_delete", { spaceId: "sp-a" });
    // Lista vazia volta aos padrões (mesmo comportamento do Rust).
    expect(new Store(dir).get("spaces")).toEqual([]);
  });

  it("space_open_folder abre spaceRoot", async () => {
    await call("space_open_folder", { spaceId: "sp-a" });
    expect(openPath).toHaveBeenCalledWith(`${spacesRoot}/personal`);
    rmSync(spacesRoot, { recursive: true, force: true });
  });

  it("path_open abre qualquer caminho válido", async () => {
    await call("path_open", { path: "/Users/fulano/projeto" });
    expect(openPath).toHaveBeenCalledWith("/Users/fulano/projeto");
  });

  it("space_spawn_plan resolve espaço e provider e repassa cwd", async () => {
    const plan: any = await call("space_spawn_plan", { spaceId: "sp-a", providerId: "pv-claude", cwd: "/tmp" });
    expect(plan.cwd).toBe("/tmp");
    expect(plan.env.PROVIDER).toBe("pv-claude");
    expect(spawnPlanFor).toHaveBeenCalledWith(spaceA, claude, "/tmp", expect.any(Function), null);
    await expect(async () => call("space_spawn_plan", { spaceId: "nope", providerId: null, cwd: null })).rejects.toThrow(/espaço/);
    await expect(async () => call("space_spawn_plan", { spaceId: "sp-a", providerId: "nope", cwd: null })).rejects.toThrow(/provider/);
  });

  it("space_spawn_plan repassa o default_cwd das configurações do terminal", async () => {
    const store = new Store(dir);
    store.set("settings", { shell: null, default_cwd: "/Users/gs/dev", font_family: "Menlo", font_size: 13, theme: "dark", language: "pt-BR" });
    h = createHandlers({ store, pty: {} as any, userDataDir: dir, openPath });
    await call("space_spawn_plan", { spaceId: "sp-a", providerId: null, cwd: null });
    expect(spawnPlanFor).toHaveBeenLastCalledWith(spaceA, null, null, expect.any(Function), "/Users/gs/dev");
  });
});

describe("secrets e migração", () => {
  it("secret_set/get/delete", async () => {
    expect(await call("secret_get", { spaceId: "sp-a", key: "T" })).toBeNull();
    await call("secret_set", { spaceId: "sp-a", key: "T", value: "v" });
    expect(await call("secret_get", { spaceId: "sp-a", key: "T" })).toBe("v");
    await call("secret_delete", { spaceId: "sp-a", key: "T" });
    expect(await call("secret_get", { spaceId: "sp-a", key: "T" })).toBeNull();
  });

  it("migrate_from_swift usa userDataDir", async () => {
    const r: any = await call("migrate_from_swift");
    expect(r.notes).toEqual([dir]);
  });
});

describe("guardrail de comandos destrutivos", () => {
  const space = {
    id: "sp-guard", name: "Guardado", color_hex: "#fff", directory_name: "guardado", custom_env: [], created_at: "2026-01-01T00:00:00Z",
    security: { load_user_shell_profile: false, share_keychain: false, share_ssh: false, share_git_config: false, inherit_process_env: false, block_destructive_commands: true },
  };
  const makeHandlers = (pty: Record<string, unknown>) => {
    const store = new Store(dir);
    store.set("spaces", [space]);
    store.set("ui-state", { sessions: [{ id: "s1", space_id: space.id }], selectedSessionId: "s1" });
    return createHandlers({ store, pty: pty as any, userDataDir: dir, openPath });
  };

  it("barra o Enter do comando destrutivo e avisa no terminal", async () => {
    const pty = { spawn: vi.fn(), write: vi.fn(), resize: vi.fn(), kill: vi.fn(), notify: vi.fn(), cwd: vi.fn(async () => "/x") };
    h = makeHandlers(pty);
    await call("pty_write", { sessionId: "s1", data: "rm -rf /" });
    await call("pty_write", { sessionId: "s1", data: "\r" });
    expect(pty.write).toHaveBeenLastCalledWith("s1", "\x15");
    expect(pty.notify).toHaveBeenCalledWith("s1", expect.stringContaining("Remoção recursiva"));
  });

  it("passa a bloquear assim que o espaço liga o guardrail, sem reiniciar", async () => {
    const pty = { spawn: vi.fn(), write: vi.fn(), resize: vi.fn(), kill: vi.fn(), notify: vi.fn(), cwd: vi.fn(async () => "/x") };
    const store = new Store(dir);
    const off = { ...space, security: { ...space.security, block_destructive_commands: false } };
    store.set("spaces", [off]);
    store.set("ui-state", { sessions: [{ id: "s1", space_id: space.id }], selectedSessionId: "s1" });
    h = createHandlers({ store, pty: pty as any, userDataDir: dir, openPath });

    await call("pty_write", { sessionId: "s1", data: "rm -rf /\r" });
    expect(pty.notify).not.toHaveBeenCalled();

    await call("space_save", { space: { ...off, security: { ...off.security, block_destructive_commands: true } } });
    await call("pty_write", { sessionId: "s1", data: "rm -rf /" });
    await call("pty_write", { sessionId: "s1", data: "\r" });
    expect(pty.notify).toHaveBeenCalled();
  });

  it("deixa passar comando comum com o guardrail ligado", async () => {
    const pty = { spawn: vi.fn(), write: vi.fn(), resize: vi.fn(), kill: vi.fn(), notify: vi.fn(), cwd: vi.fn(async () => "/x") };
    h = makeHandlers(pty);
    await call("pty_write", { sessionId: "s1", data: "git status\r" });
    expect(pty.write).toHaveBeenCalledWith("s1", "git status\r");
    expect(pty.notify).not.toHaveBeenCalled();
  });

  it("não filtra nada quando o espaço não liga o guardrail", async () => {
    const pty = { spawn: vi.fn(), write: vi.fn(), resize: vi.fn(), kill: vi.fn(), notify: vi.fn(), cwd: vi.fn(async () => "/x") };
    const store = new Store(dir);
    store.set("spaces", [{ ...space, security: { ...space.security, block_destructive_commands: false } }]);
    store.set("ui-state", { sessions: [{ id: "s1", space_id: space.id }], selectedSessionId: "s1" });
    h = createHandlers({ store, pty: pty as any, userDataDir: dir, openPath });
    await call("pty_write", { sessionId: "s1", data: "rm -rf /\r" });
    expect(pty.write).toHaveBeenCalledWith("s1", "rm -rf /\r");
    expect(pty.notify).not.toHaveBeenCalled();
  });
});

describe("auth_sessions", () => {
  it("consulta as CLIs no ambiente isolado do espaço", async () => {
    process.env.GH_TOKEN = "token-do-host";
    try {
      const listAuth = vi.fn(async (_opts: any) => [
        { id: "gh", name: "GitHub CLI", installed: true, logged_in: true, account: "guistela", detail: null, login_command: "gh auth login", logout_command: "gh auth logout" },
      ]);
      h = createHandlers({ store: new Store(dir), pty: {} as any, userDataDir: dir, openPath, listAuth });

      const res: any = await call("auth_sessions", { spaceId: spaceA.id });
      expect(res[0].account).toBe("guistela");

      const passed = listAuth.mock.calls[0][0] as any;
      expect(passed.env.GH_TOKEN).toBeUndefined();
      expect(passed.env.HOME).toContain("personal");
    } finally {
      delete process.env.GH_TOKEN;
    }
  });

  it("espaço inexistente falha com mensagem clara", async () => {
    h = createHandlers({ store: new Store(dir), pty: {} as any, userDataDir: dir, openPath });
    await expect(call("auth_sessions", { spaceId: "sumiu" })).rejects.toThrow(/espaço não existe/i);
  });
});

describe("mcp_*", () => {
  const servers = [
    { id: "1", name: "sqlite", command: "uvx", args: ["mcp-server-sqlite"], enabled: true },
    { id: "2", name: "off", command: "npx", args: [], enabled: false },
  ];

  it("mcp_list devolve lista vazia quando o espaço nunca salvou", async () => {
    expect(await call("mcp_list", { spaceId: spaceA.id })).toEqual([]);
  });

  it("mcp_save persiste a lista e grava o manifesto, devolvendo o caminho", async () => {
    const res: any = await call("mcp_save", { spaceId: spaceA.id, servers });
    expect(res.path.endsWith(".mcp.json")).toBe(true);
    expect(await call("mcp_list", { spaceId: spaceA.id })).toEqual(servers);

    const manifest = JSON.parse(readFileSync(res.path, "utf8"));
    expect(Object.keys(manifest.mcpServers)).toEqual(["sqlite"]);
  });

  it("mcp_save recusa servidor sem nome ou sem comando", async () => {
    await expect(call("mcp_save", { spaceId: spaceA.id, servers: [{ id: "x", name: "", command: "uvx", args: [], enabled: true }] }))
      .rejects.toThrow(/nome/i);
    await expect(call("mcp_save", { spaceId: spaceA.id, servers: [{ id: "x", name: "s", command: "  ", args: [], enabled: true }] }))
      .rejects.toThrow(/comando/i);
  });

  it("mcp_save recusa nomes repetidos: o manifesto perderia um servidor", async () => {
    const dup = [
      { id: "1", name: "same", command: "a", args: [], enabled: true },
      { id: "2", name: "same", command: "b", args: [], enabled: true },
    ];
    await expect(call("mcp_save", { spaceId: spaceA.id, servers: dup })).rejects.toThrow(/repetido|duplicad/i);
  });
});

describe("pty e util", () => {
  it("pty_* repassa args no formato do api.ts", async () => {
    const pty = { spawn: vi.fn(), write: vi.fn(), resize: vi.fn(), kill: vi.fn(), cwd: vi.fn(async () => "/x") };
    h = createHandlers({ store: new Store(dir), pty: pty as any, userDataDir: dir, openPath });
    const req = { session_id: "s1", shell: "/bin/sh" };
    await call("pty_spawn", { req });
    expect(pty.spawn).toHaveBeenCalledWith({ webContents: ctx.sender }, req);
    await call("pty_write", { sessionId: "s1", data: [104, 105] });
    expect(pty.write).toHaveBeenCalledWith("s1", [104, 105]);
    await call("pty_resize", { sessionId: "s1", cols: 80, rows: 24 });
    expect(pty.resize).toHaveBeenCalledWith("s1", 80, 24);
    await call("pty_kill", { sessionId: "s1" });
    expect(pty.kill).toHaveBeenCalledWith("s1");
    expect(await call("pty_cwd", { sessionId: "s1" })).toBe("/x");
  });

  it("default_shell devolve string e log_front escreve em console.error", async () => {
    expect(typeof (await call("default_shell"))).toBe("string");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await call("log_front", { level: "error", message: "boom" });
    expect(spy).toHaveBeenCalledWith("[front:error] boom");
    spy.mockRestore();
  });
});

describe("fase 8 — janelas destacadas", () => {
  const windows = {
    dropTarget: vi.fn(() => ({ action: "none", point: { x: 1500, y: 200 } })),
    openDetached: vi.fn(),
    reattach: vi.fn(),
    roleOf: vi.fn((wc: any) => (wc.id === 7 ? { role: "detached", session_id: "s7" } : { role: "main" })),
  };
  const broadcast = vi.fn();
  const pty = { spawn: vi.fn(() => ({ attached: false })), attach: vi.fn(() => new Uint8Array([1, 2])), write: vi.fn(), resize: vi.fn(), kill: vi.fn(), cwd: vi.fn(async () => "/x") };

  beforeEach(() => {
    vi.clearAllMocks();
    h = createHandlers({ store: new Store(dir), pty: pty as any, userDataDir: dir, openPath, windows: windows as any, broadcast });
  });

  it("pty_spawn devolve o objeto do contrato", async () => {
    const req = { session_id: "s1", shell: "/bin/sh" };
    expect(await call("pty_spawn", { req })).toEqual({ attached: false });
    pty.spawn.mockReturnValueOnce({ attached: true, replay: new Uint8Array([9]) } as any);
    expect(await call("pty_spawn", { req })).toEqual({ attached: true, replay: new Uint8Array([9]) });
  });

  it("pty_attach registra o sender e devolve o replay", async () => {
    expect(await call("pty_attach", { sessionId: "s1" })).toEqual(new Uint8Array([1, 2]));
    expect(pty.attach).toHaveBeenCalledWith("s1", ctx.sender);
    await expect(async () => call("pty_attach", { sessionId: "" })).rejects.toThrow(/session_id/);
  });

  it("session_detach e session_reattach delegam ao WindowManager", async () => {
    await call("session_detach", { sessionId: "s1" });
    expect(windows.openDetached).toHaveBeenCalledWith("s1");
    await call("session_reattach", { sessionId: "s1" });
    expect(windows.reattach).toHaveBeenCalledWith("s1");
  });

  it("window_role devolve o papel da janela chamadora", async () => {
    expect(await call("window_role")).toEqual({ role: "main" });
    expect(await h.window_role({}, { sender: { id: 7, send: vi.fn() } })).toEqual({ role: "detached", session_id: "s7" });
  });

  it("store_set emite store-changed para as outras janelas", async () => {
    await call("store_set", { name: "ui-state", value: { a: 1 } });
    expect(broadcast).toHaveBeenCalledWith("store-changed", { name: "ui-state" }, ctx.sender);
  });

  it("sem WindowManager, detach falha com erro claro", async () => {
    h = createHandlers({ store: new Store(dir), pty: pty as any, userDataDir: dir, openPath });
    await expect(async () => call("session_detach", { sessionId: "s1" })).rejects.toThrow(/janela/);
    expect(await call("window_role")).toEqual({ role: "main" });
  });
});


describe("session_drop persistence", () => {
  const ui = { sessions: [{ id: "s1", space_id: "sp-a", detached: false }, { id: "s2", space_id: "sp-b", detached: false }], selectedSessionId: "s2" };
  function setup(action: "detach" | "reattach" | "none") {
    const store = new Store(dir);
    store.set("ui-state", ui);
    const windows = { dropTarget: vi.fn(() => ({ action, point: { x: 1500, y: 200 } })), openDetached: vi.fn(), reattach: vi.fn(), roleOf: vi.fn() };
    const broadcast = vi.fn();
    const pty = { kill: vi.fn() };
    h = createHandlers({ store, windows: windows as any, pty: pty as any, broadcast, userDataDir: dir, openPath });
    return { store, windows, broadcast, pty };
  }
  it("persists detached before the new renderer loads and broadcasts to both windows", () => {
    const { store, windows, broadcast, pty } = setup("detach");
    windows.openDetached.mockImplementation(() => {
      expect(store.get<any>("ui-state").sessions[0].detached).toBe(true);
    });
    expect(call("session_drop", { sessionId: "s1" })).toBe("detach");
    expect(windows.openDetached).toHaveBeenCalledWith("s1", { x: 1500, y: 200 });
    expect(broadcast).toHaveBeenCalledWith("store-changed", { name: "ui-state" });
    expect(pty.kill).not.toHaveBeenCalled();
  });
  it("returns to the original space, selects it, and leaves other sessions intact", () => {
    const { store, windows } = setup("reattach");
    expect(call("session_drop", { sessionId: "s1" })).toBe("reattach");
    expect(store.get("ui-state")).toEqual({ ...ui, selectedSessionId: "s1" });
    expect(windows.reattach).toHaveBeenCalledWith("s1");
  });
  it("no-op drops leave windows and storage unchanged", () => {
    const { store, windows, broadcast } = setup("none");
    expect(call("session_drop", { sessionId: "s1" })).toBe("none");
    expect(store.get("ui-state")).toEqual(ui);
    expect(windows.openDetached).not.toHaveBeenCalled();
    expect(broadcast).not.toHaveBeenCalled();
  });
  it("rolls back if window creation fails and rejects missing sessions", () => {
    const { store, windows } = setup("detach");
    windows.openDetached.mockImplementation(() => { throw new Error("failed"); });
    expect(() => call("session_drop", { sessionId: "s1" })).toThrow("failed");
    expect(store.get("ui-state")).toEqual(ui);
    expect(() => call("session_drop", { sessionId: "missing" })).toThrow("sessão não existe");
  });
});


describe("base folder handlers", () => {
  it("validates and persists the chosen base folder", () => {
    const saved = call("space_save", { space: { ...spaceA, base_path: dir } });
    expect(saved).toMatchObject({ base_path: dir });
    expect(() => call("space_save", { space: { ...spaceA, base_path: "relative/path" } })).toThrow(/pasta base/);
    expect(() => call("space_save", { space: { ...spaceA, base_path: join(dir, "missing") } })).toThrow(/pasta base/);
  });
  it("returns native dialog selection or cancellation", async () => {
    const pickDirectory = vi.fn(async () => dir as string | null);
    h = createHandlers({ store: new Store(dir), pty: {} as any, userDataDir: dir, openPath, pickDirectory });
    expect(await call("directory_pick", { defaultPath: dir })).toBe(dir);
    expect(pickDirectory).toHaveBeenCalledWith(dir, ctx.sender);
    pickDirectory.mockResolvedValue(null);
    expect(await call("directory_pick")).toBeNull();
  });
});

describe("session_metrics: memória por sessão", () => {
  const stats = [
    { session_id: "s1", pid: 100, bytes_in: 1, bytes_out: 2, started_at: "2026-01-01T00:00:00.000Z" },
    { session_id: "s2", pid: 200, bytes_in: 3, bytes_out: 4, started_at: "2026-01-01T00:00:00.000Z" },
  ];

  it("anexa a memória da árvore de processos de cada sessão", async () => {
    const readMemory = vi.fn(async () => ({ 100: 50 * 1024 * 1024, 200: 8 * 1024 * 1024 }));
    const pty = { allStats: vi.fn(() => stats), stats: vi.fn() };
    h = createHandlers({ store: new Store(dir), pty: pty as any, userDataDir: dir, openPath, readMemory });

    const res: any = await call("session_metrics");
    expect(readMemory).toHaveBeenCalledWith([100, 200]);
    expect(res[0].memory_bytes).toBe(50 * 1024 * 1024);
    expect(res[1].memory_bytes).toBe(8 * 1024 * 1024);
  });

  it("sessão sem leitura de memória vem com o campo nulo, sem quebrar", async () => {
    const readMemory = vi.fn(async () => ({}));
    const pty = { allStats: vi.fn(() => stats), stats: vi.fn() };
    h = createHandlers({ store: new Store(dir), pty: pty as any, userDataDir: dir, openPath, readMemory });

    const res: any = await call("session_metrics");
    expect(res[0].memory_bytes).toBeNull();
  });
});

describe("session_metrics", () => {
  const stats = [
    { session_id: "s1", pid: 11, bytes_in: 10, bytes_out: 200, started_at: "2026-01-01T00:00:00.000Z" },
    { session_id: "s2", pid: 12, bytes_in: 3, bytes_out: 7, started_at: "2026-01-01T00:01:00.000Z" },
  ];
  const ptyMock = () => ({
    allStats: vi.fn(() => stats),
    stats: vi.fn((id: string) => stats.find((s) => s.session_id === id) ?? null),
  });

  it("sem sessionId devolve as métricas de todas as sessões vivas", async () => {
    const pty = ptyMock();
    h = createHandlers({ store: new Store(dir), pty: pty as any, userDataDir: dir, openPath });
    expect(await call("session_metrics")).toEqual(stats.map((s) => ({ ...s, memory_bytes: null })));
  });

  it("com sessionId devolve só a sessão pedida", async () => {
    const pty = ptyMock();
    h = createHandlers({ store: new Store(dir), pty: pty as any, userDataDir: dir, openPath });
    expect(await call("session_metrics", { sessionId: "s2" })).toEqual([{ ...stats[1], memory_bytes: null }]);
  });

  it("sessão inexistente devolve lista vazia", async () => {
    const pty = ptyMock();
    h = createHandlers({ store: new Store(dir), pty: pty as any, userDataDir: dir, openPath });
    expect(await call("session_metrics", { sessionId: "sumiu" })).toEqual([]);
  });
});

describe("snapshots", () => {
  const meta = { id: "snap-1", spaceId: "sp-a", timestamp: "2026-01-01T00:00:00.000Z", label: "antes", fileCount: 1 };
  let work: string;
  let snapshots: any;
  let collectGitFiles: any;

  beforeEach(() => {
    work = realpathSync(mkdtempSync(join(tmpdir(), "multishell-snapwork-")));
    snapshots = {
      createSnapshot: vi.fn(async () => meta),
      listSnapshots: vi.fn(async () => [meta]),
      restoreSnapshot: vi.fn(async () => ({ id: "snap-1", cwd: work, restored: 1, files: ["a.ts"] })),
      deleteSnapshot: vi.fn(async () => {}),
    };
    collectGitFiles = vi.fn(async () => ({
      files: [{ relativePath: "a.ts", content: "const a = 1;" }],
      skipped: ["b.png (binário)"],
      truncated: false,
    }));
    h = createHandlers({ store: new Store(dir), pty: {} as any, userDataDir: dir, openPath, snapshots, collectGitFiles });
  });
  afterEach(() => rmSync(work, { recursive: true, force: true }));

  it("snapshot_create captura o git do cwd e devolve o que ficou de fora", async () => {
    const out: any = await call("snapshot_create", { spaceId: "sp-a", label: "antes", cwd: work });
    expect(collectGitFiles.mock.calls[0][0].cwd).toBe(await assertWorkDir(work));
    expect(snapshots.createSnapshot).toHaveBeenCalledWith("sp-a", "antes", [{ relativePath: "a.ts", content: "const a = 1;" }]);
    expect(out.id).toBe("snap-1");
    expect(out.skipped).toEqual(["b.png (binário)"]);
    expect(out.truncated).toBe(false);
  });

  it("snapshot_create recusa cwd relativo ou inexistente sem chamar o git", async () => {
    await expect(async () => call("snapshot_create", { spaceId: "sp-a", label: "x", cwd: "relativo" })).rejects.toThrow(/caminho absoluto/i);
    await expect(async () => call("snapshot_create", { spaceId: "sp-a", label: "x", cwd: "/nao/existe/mesmo-123" })).rejects.toThrow(/não existe/i);
    await expect(async () => call("snapshot_create", { spaceId: "sp-a", label: "x" })).rejects.toThrow();
    expect(collectGitFiles).not.toHaveBeenCalled();
  });

  it("snapshot_create roda o git no ambiente isolado do espaço", async () => {
    process.env.GH_TOKEN = "token-do-host";
    try {
      await call("snapshot_create", { spaceId: "sp-a", label: "x", cwd: work });
      const env = collectGitFiles.mock.calls[0][0].env;
      expect(env.GH_TOKEN).toBeUndefined();
      expect(env.HOME).toContain("personal");
    } finally {
      delete process.env.GH_TOKEN;
    }
  });

  it("snapshot_create rejeita espaço inexistente", async () => {
    await expect(async () => call("snapshot_create", { spaceId: "sumiu", label: "x", cwd: work })).rejects.toThrow(/espaço não existe/i);
  });

  it("snapshot_list devolve os snapshots do espaço", async () => {
    expect(await call("snapshot_list", { spaceId: "sp-a" })).toEqual([meta]);
    expect(snapshots.listSnapshots).toHaveBeenCalledWith("sp-a");
  });

  it("snapshot_restore exige cwd absoluto existente e repassa ao manager", async () => {
    await expect(async () => call("snapshot_restore", { spaceId: "sp-a", snapshotId: "snap-1" })).rejects.toThrow(/pasta/i);
    await expect(async () => call("snapshot_restore", { spaceId: "sp-a", snapshotId: "snap-1", cwd: "relativo" })).rejects.toThrow(/caminho absoluto/i);
    expect(snapshots.restoreSnapshot).not.toHaveBeenCalled();

    const out: any = await call("snapshot_restore", { spaceId: "sp-a", snapshotId: "snap-1", cwd: work });
    // O handler resolve o caminho antes de repassar: no Windows o temp vem em formato curto (RUNNER~1).
    expect(snapshots.restoreSnapshot).toHaveBeenCalledWith("sp-a", "snap-1", await assertWorkDir(work));
    expect(out.restored).toBe(1);
  });

  it("snapshot_delete repassa ao manager", async () => {
    await call("snapshot_delete", { spaceId: "sp-a", snapshotId: "snap-1" });
    expect(snapshots.deleteSnapshot).toHaveBeenCalledWith("sp-a", "snap-1");
    await expect(async () => call("snapshot_delete", { spaceId: "sp-a" })).rejects.toThrow(/snapshot_id/i);
  });
});

import { mkdtempSync, rmSync } from "node:fs";
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
    expect(spawnPlanFor).toHaveBeenCalledWith(spaceA, claude, "/tmp", expect.any(Function));
    await expect(async () => call("space_spawn_plan", { spaceId: "nope", providerId: null, cwd: null })).rejects.toThrow(/espaço/);
    await expect(async () => call("space_spawn_plan", { spaceId: "sp-a", providerId: "nope", cwd: null })).rejects.toThrow(/provider/);
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

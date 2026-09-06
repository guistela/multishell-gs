// Handlers dos commands do contrato. `createHandlers` é puro (testável sem electron);
// `registerHandlers` liga cada um em `ipcMain.handle`.
import { ipcMain, shell, dialog, BrowserWindow, type WebContents } from "electron";
import { isAbsolute, join } from "node:path";
import { mkdirSync, statSync } from "node:fs";
import { COMMANDS, EVENTS, type Command, type StoreChangedEvent, type WindowRole } from "./ipc";
import { Store } from "./store";
import { PtyManager, defaultShell, type PtySender, type SpawnRequest } from "./pty";
import { commandLine, normalizeProvider, presets, resumeLine, type Provider } from "./provider";
import { defaultSpaces, makeDirectoryName, spaceRoot, spawnPlanFor, type Space } from "./space";
import { secretDelete, secretGetValue, secretSet } from "./secrets";
import { migrateFromSwift } from "./migration";
import type { WindowManager } from "./windows";
import { SpaceSnapshotManager, assertWorkDir, collectGitChangedFiles } from "./snapshot";
import { WriteGuard } from "./write-guard";
import { readProcessMemory } from "./process-memory";
import { listAuthSessions } from "./auth-sessions";
import { syncSpaceMcpConfig, type McpServerConfig } from "./mcp";

export const SPACES_STORE = "spaces";
export const MCP_STORE = "mcp-servers";
export const PROVIDERS_STORE = "providers";

export interface HandlerDeps {
  store: Store;
  pty: PtyManager;
  /** app.getPath("userData") */
  userDataDir: string;
  /** Consulta das CLIs autenticadas. Injetável para teste. */
  listAuth?: typeof listAuthSessions;
  /** Memória das árvores de processo. Injetável para teste. */
  readMemory?: (roots: number[]) => Promise<Record<number, number>>;
  /** shell.openPath. Injetável para teste. */
  openPath: (path: string) => Promise<string>;
  /** Janelas (fase 8). Sem ele, `session_detach`/`session_reattach` falham e `window_role` é sempre main. */
  pickDirectory?: (defaultPath: string | undefined, sender: PtySender) => Promise<string | null>;
  windows?: Pick<WindowManager, "openDetached" | "reattach" | "roleOf" | "dropTarget">;
  /** Armazenamento dos snapshots. Padrão: `<userData>/time-machine`. Injetável para teste. */
  snapshots?: Pick<SpaceSnapshotManager, "createSnapshot" | "listSnapshots" | "restoreSnapshot" | "deleteSnapshot">;
  /** Leitura do git para o snapshot. Injetável para teste. */
  collectGitFiles?: typeof collectGitChangedFiles;
  /** Evento para todas as janelas menos `except`. Padrão: `windows.broadcast`. Injetável para teste. */
  broadcast?: (channel: string, payload: unknown, except?: PtySender) => void;
}

export interface HandlerContext {
  sender: PtySender;
}

type Args = Record<string, any>;
export type Handler = (args: Args, ctx: HandlerContext) => unknown;
export type Handlers = Record<Command, Handler>;

function str(v: unknown, what: string): string {
  if (typeof v !== "string" || !v) throw new Error(`${what} inválido`);
  return v;
}

export function createHandlers(deps: HandlerDeps): Handlers {
  const { store, pty } = deps;
  const broadcast = deps.broadcast ?? (() => {});
  let previewExpiry: ReturnType<typeof setTimeout> | undefined;
  const windows = (): NonNullable<HandlerDeps["windows"]> => {
    if (!deps.windows) throw new Error("gerenciador de janelas indisponível");
    return deps.windows;
  };

  const writeGuard = new WriteGuard();
  const snapshots = deps.snapshots ?? new SpaceSnapshotManager(join(deps.userDataDir, "time-machine"));
  const collectGitFiles = deps.collectGitFiles ?? collectGitChangedFiles;

  /** pty_write roda a cada tecla: a decisão do guardrail fica em cache até algo mudar. */
  const guardCache = new Map<string, boolean>();
  const invalidateGuardCache = () => guardCache.clear();

  /** O guardrail é por espaço: descobre o espaço da sessão pelo ui-state. */
  const guardEnabledFor = (sessionId: string): boolean => {
    const cached = guardCache.get(sessionId);
    if (cached !== undefined) return cached;
    const value = readGuardEnabled(sessionId);
    guardCache.set(sessionId, value);
    return value;
  };

  const readGuardEnabled = (sessionId: string): boolean => {
    const ui = store.get<{ sessions?: Array<{ id: string; space_id?: string }> }>("ui-state");
    const spaceId = ui?.sessions?.find((x) => x.id === sessionId)?.space_id;
    if (!spaceId) return false;
    const space = loadSpaces().find((x) => x.id === spaceId);
    return space?.security?.block_destructive_commands === true;
  };

  /**
   * Ambiente dos subprocessos do espaço (gh, git). Espaço isolado não vê o ambiente do
   * host: senão GH_TOKEN/GITHUB_TOKEN da máquina agiriam no lugar da conta do espaço.
   */
  const spaceEnv = (space: Space): Record<string, string> => {
    const base: Record<string, string> = space.security.inherit_process_env
      ? (Object.fromEntries(Object.entries(process.env).filter(([, v]) => typeof v === "string")) as Record<string, string>)
      : { LANG: process.env.LANG ?? "en_US.UTF-8", TERM: "xterm-256color" };
    return {
      ...base,
      HOME: spaceRoot(space),
      PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || ""}`,
    };
  };

  const loadSpaces = (): Space[] => {
    const list = store.get<Space[]>(SPACES_STORE);
    if (Array.isArray(list) && list.length > 0) return list;
    const defaults = defaultSpaces();
    store.set(SPACES_STORE, defaults);
    return defaults;
  };
  const findSpace = (id: string): Space => {
    const s = loadSpaces().find((x) => x.id === id);
    if (!s) throw new Error(`espaço não existe: ${id}`);
    return s;
  };
  const loadProviders = (): Provider[] => {
    const list = store.get<Provider[]>(PROVIDERS_STORE);
    if (Array.isArray(list) && list.length > 0) {
      let updated = false;
      const normalized = list.map((p) => {
        const norm = normalizeProvider(p);
        if (JSON.stringify(norm) !== JSON.stringify(p)) updated = true;
        return norm;
      });
      if (updated) store.set(PROVIDERS_STORE, normalized);
      return normalized;
    }
    const defaults = presets();
    store.set(PROVIDERS_STORE, defaults);
    return defaults;
  };

  return {
    store_get: ({ name }) => store.get(str(name, "name")),
    store_set: ({ name, value }, ctx) => {
      const n = str(name, "name");
      store.set(n, value ?? null);
      if (n === "ui-state" || n === SPACES_STORE) invalidateGuardCache();
      const payload: StoreChangedEvent = { name: n };
      broadcast(EVENTS.storeChanged, payload, ctx.sender);
    },

    directory_pick: ({ defaultPath }, ctx) => {
      if (!deps.pickDirectory) throw new Error("seletor de pasta indisponível");
      return deps.pickDirectory(typeof defaultPath === "string" && defaultPath ? defaultPath : undefined, ctx.sender);
    },
    spaces_list: () => loadSpaces(),
    space_save: ({ space }) => {
      invalidateGuardCache();
      const s: Space = { ...(space as Space) };
      if (!s.name?.trim()) throw new Error("nome do espaço vazio");
      if (s.base_path != null) {
        if (typeof s.base_path !== "string") throw new Error("pasta base inválida");
        s.base_path = s.base_path.trim() || null;
        if (s.base_path) {
          let valid = false;
          try { valid = isAbsolute(s.base_path) && statSync(s.base_path).isDirectory(); } catch { /* missing directory */ }
          if (!valid) throw new Error("A pasta base precisa ser uma pasta existente com caminho absoluto.");
        }
      }
      // Segredos nunca ficam no JSON.
      s.custom_env = (s.custom_env ?? []).map((v) => (v.is_secret ? { ...v, value: "" } : v));
      const spaces = loadSpaces();
      const pos = spaces.findIndex((x) => x.id === s.id);
      if (pos >= 0) {
        // directory_name é estável: não muda ao renomear.
        if (!s.directory_name) s.directory_name = spaces[pos].directory_name;
        spaces[pos] = s;
      } else {
        if (!s.directory_name) {
          s.directory_name = makeDirectoryName(s.name, spaces.map((x) => x.directory_name));
        }
        spaces.push(s);
      }
      store.set(SPACES_STORE, spaces);
      return s;
    },
    space_delete: ({ spaceId }) => {
      invalidateGuardCache();
      const id = str(spaceId, "space_id");
      store.set(SPACES_STORE, loadSpaces().filter((s) => s.id !== id));
    },
    space_open_folder: async ({ spaceId }) => {
      const root = spaceRoot(findSpace(str(spaceId, "space_id")));
      mkdirSync(root, { recursive: true });
      const err = await deps.openPath(root);
      if (err) throw new Error(err);
    },
    path_open: async ({ path: targetPath }) => {
      if (typeof targetPath !== "string" || !targetPath) return;
      const err = await deps.openPath(targetPath);
      if (err) throw new Error(err);
    },
    space_spawn_plan: ({ spaceId, providerId, cwd }) => {
      const space = findSpace(str(spaceId, "space_id"));
      let provider: Provider | null = null;
      if (providerId) {
        provider = loadProviders().find((p) => p.id === providerId) ?? null;
        if (!provider) throw new Error(`provider não existe: ${providerId}`);
      }
      // A pasta padrão das configurações vale quando o espaço não define pasta base.
      const settings = store.get<{ default_cwd?: string | null }>("settings");
      return spawnPlanFor(space, provider, cwd ?? null, secretGetValue, settings?.default_cwd?.trim() || null);
    },

    providers_list: () => loadProviders(),
    provider_save: ({ provider }) => {
      const p: Provider = { ...(provider as Provider) };
      if (!p.name?.trim()) throw new Error("nome do provider vazio");
      if (!p.executable?.trim()) throw new Error("executável do provider vazio");
      p.extra_env = (p.extra_env ?? []).map((v) => (v.is_secret ? { ...v, value: "" } : v));
      const list = loadProviders();
      const pos = list.findIndex((x) => x.id === p.id);
      if (pos >= 0) list[pos] = p;
      else list.push(p);
      store.set(PROVIDERS_STORE, list);
      return p;
    },
    provider_delete: ({ providerId }) => {
      const id = str(providerId, "provider_id");
      store.set(PROVIDERS_STORE, loadProviders().filter((p) => p.id !== id));
    },
    provider_presets: () => presets(),
    provider_command_line: ({ provider, bypass }) => commandLine(provider as Provider, Boolean(bypass)),
    provider_resume_line: ({ provider, bypass }) => resumeLine(provider as Provider, Boolean(bypass)),

    secret_set: ({ spaceId, key, value }) => {
      secretSet(str(spaceId, "space_id"), str(key, "key"), String(value ?? ""));
    },
    secret_get: ({ spaceId, key }) => secretGetValue(str(spaceId, "space_id"), str(key, "key")),
    secret_delete: ({ spaceId, key }) => {
      secretDelete(str(spaceId, "space_id"), str(key, "key"));
    },

    migrate_from_swift: () => migrateFromSwift(deps.userDataDir),

    pty_spawn: ({ req }, ctx) => pty.spawn({ webContents: ctx.sender }, req as SpawnRequest),
    pty_attach: ({ sessionId }, ctx) => pty.attach(str(sessionId, "session_id"), ctx.sender),
    pty_write: ({ sessionId, data }) => {
      const id = str(sessionId, "session_id");
      if (!guardEnabledFor(id)) {
        pty.write(id, data ?? "");
        return;
      }
      const text = typeof data === "string" ? data : Buffer.from(data ?? []).toString("utf8");
      const decision = writeGuard.inspect(id, text);
      if (decision.blocked) {
        pty.notify(id, `\r\n\x1b[1;31m⛔ Multishell bloqueou: ${decision.blocked.reason}\x1b[0m\r\n`);
      }
      if (decision.allow) pty.write(id, decision.allow);
    },
    pty_resize: ({ sessionId, cols, rows }) => {
      pty.resize(str(sessionId, "session_id"), Number(cols), Number(rows));
    },
    pty_kill: ({ sessionId }) => {
      const id = str(sessionId, "session_id");
      writeGuard.reset(id);
      pty.kill(id);
    },
    pty_cwd: ({ sessionId }) => pty.cwd(str(sessionId, "session_id")),

    /** Uso real por sessão viva. Sem sessionId, devolve todas. */
    session_metrics: async ({ sessionId }) => {
      const base = sessionId == null || sessionId === ""
        ? pty.allStats()
        : ((s) => (s ? [s] : []))(pty.stats(str(sessionId, "session_id")));
      // Uma leitura de `ps` cobre todas as sessões de uma vez.
      const memory = await (deps.readMemory ?? readProcessMemory)(base.map((s) => s.pid));
      return base.map((s) => ({ ...s, memory_bytes: memory[s.pid] ?? null }));
    },

    session_drag_preview: ({ sessionId }, ctx) => {
      clearTimeout(previewExpiry);
      if (sessionId === null) { broadcast(EVENTS.sessionDrag, null); return; }
      const id = str(sessionId, "session_id");
      const { action } = windows().dropTarget(id, ctx.sender);
      broadcast(EVENTS.sessionDrag, { session_id: id, action, detached: windows().roleOf(ctx.sender).role === "detached" });
      previewExpiry = setTimeout(() => broadcast(EVENTS.sessionDrag, null), 500);
      previewExpiry.unref?.();
    },
    session_drop: ({ sessionId }, ctx) => {
      const id = str(sessionId, "session_id");
      const ui = store.get<{ sessions: Array<{ id: string; detached?: boolean }>; selectedSessionId: string | null }>("ui-state");
      if (!ui?.sessions?.some((s) => s.id === id)) throw new Error("sessão não existe");
      const { action, point } = windows().dropTarget(id, ctx.sender);
      if (action === "none") return action;
      const next = { ...ui, sessions: ui.sessions.map((s) => s.id === id ? { ...s, detached: action === "detach" } : s),
        selectedSessionId: action === "reattach" ? id : ui.selectedSessionId };
      store.set("ui-state", next);
      try {
        if (action === "detach") windows().openDetached(id, point);
        else windows().reattach(id);
      } catch (error) {
        store.set("ui-state", ui);
        throw error;
      }
      broadcast(EVENTS.storeChanged, { name: "ui-state" });
      return action;
    },
    session_detach: ({ sessionId }) => {
      windows().openDetached(str(sessionId, "session_id"));
    },
    session_reattach: ({ sessionId }) => {
      windows().reattach(str(sessionId, "session_id"));
    },
    window_role: (_args, ctx): WindowRole => deps.windows?.roleOf(ctx.sender) ?? { role: "main" },
    default_shell: () => defaultShell(),

    /** Erros do renderer chegam aqui e saem no terminal do `electron-vite dev`. */
    log_front: ({ level, message }) => {
      console.error(`[front:${level ?? "error"}] ${message ?? ""}`);
    },

    snapshot_create: async ({ spaceId, label, cwd }) => {
      const space = findSpace(str(spaceId, "space_id"));
      const workDir = await assertWorkDir(cwd);
      const capture = await collectGitFiles({ cwd: workDir, env: spaceEnv(space) });
      const meta = await snapshots.createSnapshot(space.id, String(label ?? "").trim(), capture.files);
      return { ...meta, skipped: capture.skipped, truncated: capture.truncated };
    },
    snapshot_list: async ({ spaceId }) => snapshots.listSnapshots(findSpace(str(spaceId, "space_id")).id),
    /** Sobrescreve arquivos do usuário: o cwd é obrigatório e validado aqui. */
    snapshot_restore: async ({ spaceId, snapshotId, cwd }) => {
      const space = findSpace(str(spaceId, "space_id"));
      const id = str(snapshotId, "snapshot_id");
      const workDir = await assertWorkDir(cwd);
      return snapshots.restoreSnapshot(space.id, id, workDir);
    },
    /** Sessões de login das CLIs, sempre no HOME do próprio espaço. */
    auth_sessions: async ({ spaceId }) => {
      const space = findSpace(str(spaceId, "space_id"));
      return (deps.listAuth ?? listAuthSessions)({
        env: spaceEnv(space),
        cwd: space.base_path || spaceRoot(space),
      });
    },
    mcp_list: ({ spaceId }) => {
      const space = findSpace(str(spaceId, "space_id"));
      const all = store.get<Record<string, McpServerConfig[]>>(MCP_STORE) ?? {};
      return all[space.id] ?? [];
    },
    /** Salva a lista do espaço e regrava o manifesto que os harnesses leem. */
    mcp_save: async ({ spaceId, servers }) => {
      const space = findSpace(str(spaceId, "space_id"));
      const list = Array.isArray(servers) ? (servers as McpServerConfig[]) : [];
      const seen = new Set<string>();
      for (const server of list) {
        const name = String(server?.name ?? "").trim();
        if (!name) throw new Error("Cada servidor MCP precisa de um nome.");
        if (!String(server?.command ?? "").trim()) throw new Error(`O servidor "${name}" precisa de um comando.`);
        if (seen.has(name)) throw new Error(`Nome repetido no MCP: "${name}". Cada servidor precisa de nome único.`);
        seen.add(name);
      }
      const all = store.get<Record<string, McpServerConfig[]>>(MCP_STORE) ?? {};
      all[space.id] = list;
      store.set(MCP_STORE, all);
      const path = await syncSpaceMcpConfig(spaceRoot(space), list, space.base_path ?? null);
      return { path, enabled: list.filter((s) => s.enabled).length };
    },
    snapshot_delete: async ({ spaceId, snapshotId }) => {
      const space = findSpace(str(spaceId, "space_id"));
      await snapshots.deleteSnapshot(space.id, str(snapshotId, "snapshot_id"));
    },
  };
}

/** Liga todos os commands do contrato. Erros viram rejeição no renderer. */
export function registerHandlers(deps: Omit<HandlerDeps, "openPath"> & Partial<Pick<HandlerDeps, "openPath">>): Handlers {
  const windows = deps.windows as WindowManager | undefined;
  const handlers = createHandlers({
    openPath: (p) => shell.openPath(p),
    pickDirectory: async (defaultPath, sender) => {
      const owner = BrowserWindow.fromWebContents(sender as WebContents);
      const options = { defaultPath, properties: ["openDirectory", "createDirectory"] as Array<"openDirectory" | "createDirectory"> };
      const result = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options);
      return result.canceled ? null : result.filePaths[0] ?? null;
    },
    broadcast: windows?.broadcast ? (ch, payload, except) => windows.broadcast(ch, payload, except) : undefined,
    ...deps,
  });
  for (const name of COMMANDS) {
    const fn = handlers[name];
    ipcMain.handle(name, (e, args) => fn(args ?? {}, { sender: e.sender }));
  }
  return handlers;
}

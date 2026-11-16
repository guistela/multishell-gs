import { beforeEach, describe, expect, it, vi } from "vitest";

const { FakeBrowserWindow, created } = vi.hoisted(() => {
  let nextId = 1;
  const created: any[] = [];
  class FakeBrowserWindow {
    static all: FakeBrowserWindow[] = [];
    readonly opts: any;
    readonly listeners = new Map<string, Array<(...a: any[]) => void>>();
    readonly webContents: any;
    loaded: { url?: string; file?: string; options?: any } = {};
    title = "";
    destroyed = false;
    constructor(opts: any) {
      this.opts = opts;
      const wcListeners = new Map<string, Array<(...a: any[]) => void>>();
      this.webContents = {
        id: nextId++,
        send: vi.fn(),
        isDestroyed: () => this.destroyed,
        windowOpenHandler: null,
        setWindowOpenHandler(fn: (d: any) => any) { this.windowOpenHandler = fn; },
        on(ev: string, fn: (...a: any[]) => void) { wcListeners.set(ev, [...(wcListeners.get(ev) ?? []), fn]); return this; },
        emit(ev: string, ...a: any[]) { for (const fn of wcListeners.get(ev) ?? []) fn(...a); },
      };
      FakeBrowserWindow.all.push(this);
      created.push(this);
    }
    static getAllWindows() { return FakeBrowserWindow.all.filter((w) => !w.destroyed); }
    static getFocusedWindow() { return null; }
    on(ev: string, fn: (...a: any[]) => void) { this.listeners.set(ev, [...(this.listeners.get(ev) ?? []), fn]); return this; }
    once(ev: string, fn: (...a: any[]) => void) { return this.on(ev, fn); }
    emit(ev: string, ...a: any[]) { for (const fn of this.listeners.get(ev) ?? []) fn(...a); }
    loadURL(url: string) { this.loaded = { url }; return Promise.resolve(); }
    loadFile(file: string, options?: any) { this.loaded = { file, options }; return Promise.resolve(); }
    setTitle(t: string) { this.title = t; }
    show() { this.shown = "ativa"; }
    showInactive() { this.shown = "inativa"; }
    shown: string | null = null;
    alwaysOnTop: any = null;
    setAlwaysOnTop(on: boolean, level?: string) { this.alwaysOnTop = { on, level }; }
    espacos: any = null;
    setVisibleOnAllWorkspaces(on: boolean, o?: any) { this.espacos = { on, ...o }; }
    isVisible() { return !this.destroyed; }
    focus() { this.focused = true; }
    focused = false;
    isDestroyed() { return this.destroyed; }
    /** Simula o fechamento: `close` (cancelável) → `closed`. */
    close() {
      const e = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
      this.emit("close", e);
      if (e.defaultPrevented) return;
      this.destroyed = true;
      this.emit("closed");
    }
  }
  return { FakeBrowserWindow, created };
});

const tela = { workArea: { x: 0, y: 25, width: 1440, height: 875 } };
vi.mock("electron", () => ({
  BrowserWindow: FakeBrowserWindow,
  screen: { getPrimaryDisplay: () => tela, getDisplayNearestPoint: () => tela },
}));

import { FLOATER_MARGIN, FLOATER_SIZE, WindowManager, floaterBounds } from "../windows";

const opts = { preload: "/p/index.cjs", indexHtml: "/r/index.html" };

beforeEach(() => {
  FakeBrowserWindow.all.length = 0;
  created.length = 0;
  delete process.env.ELECTRON_RENDERER_URL;
});

describe("WindowManager", () => {
  it("createMainWindow carrega o index e roleOf devolve main", () => {
    const wm = new WindowManager(opts);
    const main = wm.createMainWindow();
    expect(created[0].loaded.file).toBe("/r/index.html");
    expect(wm.roleOf(main.webContents as any)).toEqual({ role: "main" });
    expect(wm.roleOf({ id: 999 } as any)).toEqual({ role: "main" });
  });

  it("openDetached carrega hash #/detached/<id> (dev usa ELECTRON_RENDERER_URL) e roleOf devolve detached", () => {
    const wm = new WindowManager(opts);
    wm.createMainWindow();
    const w = wm.openDetached("s1") as any;
    expect(w.loaded.options?.hash).toBe("/detached/s1");
    expect(w.opts.width).toBe(900);
    expect(w.opts.height).toBe(600);
    expect(w.opts.title).toBe("Multishell");
    expect(w.opts.webPreferences).toMatchObject({ preload: "/p/index.cjs", contextIsolation: true, nodeIntegration: false, sandbox: true });
    expect(wm.roleOf(w.webContents)).toEqual({ role: "detached", session_id: "s1" });
    // Idempotente: mesma sessão devolve a mesma janela.
    expect(wm.openDetached("s1")).toBe(w);

    process.env.ELECTRON_RENDERER_URL = "http://localhost:5173/";
    const w2 = wm.openDetached("s2") as any;
    expect(w2.loaded.url).toBe("http://localhost:5173/#/detached/s2");
  });

  it("reattach fecha a janela destacada e avisa a principal uma vez só", () => {
    const wm = new WindowManager(opts);
    const main = wm.createMainWindow() as any;
    const w = wm.openDetached("s1") as any;
    wm.reattach("s1");
    expect(w.destroyed).toBe(true);
    expect(wm.detached.has("s1")).toBe(false);
    expect(main.webContents.send).toHaveBeenCalledTimes(1);
    expect(main.webContents.send).toHaveBeenCalledWith("session-reattached", { session_id: "s1" });
    // Sem janela: não faz nada.
    wm.reattach("s1");
    expect(main.webContents.send).toHaveBeenCalledTimes(1);
  });

  it("fechar a janela destacada pelo sistema equivale a reattach", () => {
    const wm = new WindowManager(opts);
    const main = wm.createMainWindow() as any;
    const w = wm.openDetached("s1") as any;
    w.close();
    expect(wm.detached.has("s1")).toBe(false);
    expect(main.webContents.send).toHaveBeenCalledWith("session-reattached", { session_id: "s1" });
  });

  it("fechar a principal chama onMainClosed e fecha as destacadas sem reattach", () => {
    const onMainClosed = vi.fn();
    const wm = new WindowManager({ ...opts, onMainClosed });
    const main = wm.createMainWindow() as any;
    const w = wm.openDetached("s1") as any;
    main.close();
    expect(onMainClosed).toHaveBeenCalledTimes(1);
    expect(w.destroyed).toBe(true);
    expect(wm.detached.size).toBe(0);
    expect(main.webContents.send).not.toHaveBeenCalled();
  });

  it("broadcast manda para todas as janelas vivas menos `except`", () => {
    const wm = new WindowManager(opts);
    const main = wm.createMainWindow() as any;
    const w1 = wm.openDetached("s1") as any;
    const w2 = wm.openDetached("s2") as any;
    w2.destroyed = true;
    wm.broadcast("store-changed", { name: "ui-state" }, main.webContents);
    expect(main.webContents.send).not.toHaveBeenCalled();
    expect(w1.webContents.send).toHaveBeenCalledWith("store-changed", { name: "ui-state" });
    expect(w2.webContents.send).not.toHaveBeenCalled();
  });
});

describe("navegação e janelas novas", () => {
  it("bloqueia window.open em toda janela criada", () => {
    const wm = new WindowManager(opts);
    wm.createMainWindow();
    wm.openDetached("s1");
    for (const win of created) {
      expect(win.webContents.windowOpenHandler).toBeTypeOf("function");
      expect(win.webContents.windowOpenHandler({ url: "https://exemplo.com" })).toEqual({ action: "deny" });
    }
  });

  it("bloqueia navegação para fora do app", () => {
    const wm = new WindowManager(opts);
    const win = wm.createMainWindow() as any;
    const ev = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    win.webContents.emit("will-navigate", ev, "https://exemplo.com");
    expect(ev.defaultPrevented).toBe(true);
  });
});

// A janela flutuante das perguntas: fica sobre tudo, não rouba o foco e só
// existe enquanto há pergunta esperando.
describe("janela flutuante das perguntas", () => {
  it("floaterBounds põe a janela no canto inferior direito da área útil", () => {
    const b = floaterBounds({ x: 0, y: 25, width: 1440, height: 875 });
    expect(b).toEqual({
      x: 1440 - FLOATER_SIZE.width - FLOATER_MARGIN,
      y: 25 + 875 - FLOATER_SIZE.height - FLOATER_MARGIN,
      width: FLOATER_SIZE.width,
      height: FLOATER_SIZE.height,
    });
  });

  // Monitor pequeno não pode jogar a janela para fora da tela.
  it("floaterBounds cabe numa área útil menor que a janela", () => {
    const b = floaterBounds({ x: 100, y: 0, width: 200, height: 150 });
    expect(b).toEqual({ x: 100, y: 0, width: 200, height: 150 });
  });

  it("openFloater abre sem roubar o foco, sobre tudo, com o hash /asks", () => {
    const wm = new WindowManager(opts);
    wm.createMainWindow();
    const w = wm.openFloater() as any;
    expect(w.loaded.options?.hash).toBe("/asks");
    expect(w.opts).toMatchObject({ frame: false, skipTaskbar: true, alwaysOnTop: true, resizable: false });
    expect(w.opts.webPreferences).toMatchObject({ preload: "/p/index.cjs", contextIsolation: true, sandbox: true });
    // Nunca `show()`: ela não pode tirar o foco do que eu estou fazendo.
    expect(w.shown).toBeNull();
    w.emit("ready-to-show");
    expect(w.shown).toBe("inativa");
    expect(w.alwaysOnTop).toEqual({ on: true, level: "floating" });
    // Sobre app em tela cheia também, senão ela não serve para nada.
    expect(w.espacos).toEqual({ on: true, visibleOnFullScreen: true });
  });

  it("openFloater é idempotente: a segunda chamada não abre outra", () => {
    const wm = new WindowManager(opts);
    wm.createMainWindow();
    const w = wm.openFloater();
    expect(wm.openFloater()).toBe(w);
    expect(created.filter((c) => c.loaded.options?.hash === "/asks")).toHaveLength(1);
  });

  it("closeFloater fecha e deixa abrir de novo depois", () => {
    const wm = new WindowManager(opts);
    wm.createMainWindow();
    const w = wm.openFloater() as any;
    wm.closeFloater();
    expect(w.destroyed).toBe(true);
    expect(wm.floater).toBeNull();
    wm.closeFloater();
    expect(wm.openFloater()).not.toBe(w);
  });

  // Fechar no X da janela não pode fazer ela voltar sozinha na mesma pergunta.
  it("fechar a flutuante na mão solta a referência", () => {
    const wm = new WindowManager(opts);
    wm.createMainWindow();
    const w = wm.openFloater() as any;
    w.close();
    expect(wm.floater).toBeNull();
  });

  it("fechar a principal fecha a flutuante", () => {
    const wm = new WindowManager(opts);
    const main = wm.createMainWindow() as any;
    const w = wm.openFloater() as any;
    main.close();
    expect(w.destroyed).toBe(true);
    expect(wm.floater).toBeNull();
  });
});

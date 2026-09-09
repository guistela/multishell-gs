// Janelas do app: a principal e uma por sessão destacada (fase 8).
// O PTY vive no main; janelas só se anexam a ele. Fechar a destacada = devolver ao espaço.
import { dropAction, detachedPosition, type Point, type DropAction } from "./session-drag";
import { BrowserWindow, screen, type BrowserWindowConstructorOptions, type WebContents } from "electron";
import { EVENTS, type SessionReattachedEvent, type WindowRole } from "./ipc";

export interface WindowManagerOptions {
  /** Caminho do preload compilado (`out/preload/index.cjs`). */
  preload: string;
  /** `out/renderer/index.html` (produção). Em dev usa `ELECTRON_RENDERER_URL`. */
  indexHtml: string;
  /** Chamado quando a janela principal fecha. */
  onMainClosed?: () => void;
  onReattached?: (sessionId: string) => void;
}

/** Só o que `roleOf`/`broadcast` precisam de um `WebContents`. */
export interface WindowSender {
  id?: number;
  send(channel: string, payload: unknown): void;
  isDestroyed?(): boolean;
}

const isMac = process.platform === "darwin";

export class WindowManager {
  main: BrowserWindow | null = null;
  readonly detached = new Map<string, BrowserWindow>();
  /** Janelas em fechamento programático: o `close` delas não dispara reattach. */
  private readonly closingProgrammatically = new Set<string>();
  private quitting = false;

  constructor(private readonly opts: WindowManagerOptions) {}

  private webPreferences(): BrowserWindowConstructorOptions["webPreferences"] {
    return {
      preload: this.opts.preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    };
  }

  /**
   * O renderer só carrega o próprio bundle. `window.open` e navegação para fora
   * ficam negados: nenhuma origem externa herda este preload.
   */
  private lockNavigation(win: BrowserWindow): void {
    const wc = win.webContents;
    wc.setWindowOpenHandler?.(() => ({ action: "deny" as const }));
    wc.on("will-navigate", (event: { preventDefault(): void }, url: string) => {
      const allowed = process.env.ELECTRON_RENDERER_URL;
      if (allowed && url.startsWith(allowed)) return;
      if (url.startsWith("file://")) return;
      event.preventDefault();
    });
  }

  createMainWindow(): BrowserWindow {
    const win = new BrowserWindow({
      width: 1200,
      height: 760,
      minWidth: 640,
      minHeight: 400,
      show: false,
      titleBarStyle: isMac ? "hiddenInset" : "default",
      trafficLightPosition: isMac ? { x: 12, y: 14 } : undefined,
      resizable: true,
      movable: true,
      backgroundColor: "#1e1e1e",
      webPreferences: this.webPreferences(),
    });
    this.main = win;
    this.lockNavigation(win);

    win.once("ready-to-show", () => win.show());
    win.on("closed", () => {
      this.quitting = true;
      if (this.main === win) this.main = null;
      this.closeAllDetached();
      this.opts.onMainClosed?.();
    });

    if (process.env.ELECTRON_RENDERER_URL) {
      void win.loadURL(process.env.ELECTRON_RENDERER_URL);
    } else {
      void win.loadFile(this.opts.indexHtml);
    }
    return win;
  }

  /** Abre (ou foca) a janela própria da sessão. Idempotente por sessão. */
  openDetached(sessionId: string, point?: Point): BrowserWindow {
    const existing = this.detached.get(sessionId);
    if (existing && !existing.isDestroyed()) {
      existing.focus?.();
      return existing;
    }
    const win = new BrowserWindow({
      ...(point ? detachedPosition(point, screen.getDisplayNearestPoint(point).workArea) : {}),
      width: 900,
      height: 600,
      minWidth: 480,
      minHeight: 300,
      title: "Multishell",
      show: false,
      resizable: true,
      movable: true,
      backgroundColor: "#1e1e1e",
      webPreferences: this.webPreferences(),
    });
    this.detached.set(sessionId, win);
    this.lockNavigation(win);

    win.once("ready-to-show", () => win.show());
    win.on("close", () => {
      // Botão do sistema: devolve ao espaço. Fechamento programático (reattach/quit) não repete o aviso.
      if (this.closingProgrammatically.has(sessionId) || this.quitting) return;
      this.closingProgrammatically.add(sessionId);
      this.detached.delete(sessionId);
      this.notifyReattached(sessionId);
    });
    win.on("closed", () => {
      this.closingProgrammatically.delete(sessionId);
      if (this.detached.get(sessionId) === win) this.detached.delete(sessionId);
    });

    const hash = `/detached/${sessionId}`;
    if (process.env.ELECTRON_RENDERER_URL) {
      void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}#${hash}`);
    } else {
      void win.loadFile(this.opts.indexHtml, { hash });
    }
    return win;
  }

  /** Fecha a janela destacada (se houver) e avisa a principal. O PTY continua vivo. */
  reattach(sessionId: string): void {
    const win = this.detached.get(sessionId);
    if (!win) return;
    this.detached.delete(sessionId);
    this.closingProgrammatically.add(sessionId);
    if (!win.isDestroyed()) win.close();
    this.notifyReattached(sessionId);
  }

  dropTarget(sessionId: string, sender: WindowSender): { action: DropAction; point: Point } {
    const role = this.roleOf(sender);
    const source = role.role === "detached" ? this.detached.get(sessionId) : this.main;
    if (!source || source.isDestroyed() || !sameSender(source.webContents, sender)) {
      throw new Error("janela de origem inválida");
    }
    const point = screen.getCursorScreenPoint();
    const main = this.main && !this.main.isDestroyed() && this.main.isVisible() && !this.main.isMinimized()
      ? this.main.getContentBounds() : null;
    return { action: dropAction(point, source.getBounds(), main, role.role === "detached"), point };
  }

  roleOf(wc: WindowSender): WindowRole {
    for (const [session_id, win] of this.detached) {
      if (!win.isDestroyed() && sameSender(win.webContents, wc)) return { role: "detached", session_id };
    }
    return { role: "main" };
  }

  /** Manda `payload` para todas as janelas vivas, menos `except`. */
  broadcast(channel: string, payload: unknown, except?: WindowSender): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed()) continue;
      const wc = win.webContents;
      if (wc.isDestroyed?.()) continue;
      if (except && sameSender(wc, except)) continue;
      wc.send(channel, payload);
    }
  }

  private notifyReattached(sessionId: string): void {
    this.opts.onReattached?.(sessionId);
    const main = this.main;
    if (!main || main.isDestroyed() || main.webContents.isDestroyed?.()) return;
    const payload: SessionReattachedEvent = { session_id: sessionId };
    main.webContents.send(EVENTS.sessionReattached, payload);
  }

  private closeAllDetached(): void {
    for (const [id, win] of [...this.detached]) {
      this.detached.delete(id);
      this.closingProgrammatically.add(id);
      if (!win.isDestroyed()) win.close();
    }
  }
}

function sameSender(a: WebContents | WindowSender, b: WindowSender): boolean {
  if (a === b) return true;
  return a.id !== undefined && b.id !== undefined && a.id === b.id;
}

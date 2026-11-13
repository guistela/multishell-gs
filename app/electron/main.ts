// Processo main: janelas, menu, IPC. O renderer é sandbox puro; tudo passa pelo preload.
import { app, BrowserWindow, Menu, Notification, type MenuItemConstructorOptions } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { registerHandlers } from "./handlers";
import { EVENTS, type Shortcut } from "./ipc";
import { PtyManager } from "./pty";
import { NotificationCenter } from "./notifications";
import { NotifyServer, socketPathFor } from "./notify-server";
import { Store } from "./store";
import { WindowManager } from "./windows";

const here = dirname(fileURLToPath(import.meta.url));
const isMac = process.platform === "darwin";

// A central e o servidor nascem antes das janelas: o PTY já pode avisar.
const notifications = new NotificationCenter();
const notifyServer = new NotifyServer(notifications, { onAdded: (id) => anunciar(id) });
// OSC 9 / 777 na saída do shell: notificação sem o agente saber de nada.
const pty = new PtyManager({
  onNotice: (sessionId, notice) => {
    try {
      const n = notifications.add({
        session_id: sessionId,
        space_id: spaceDaSessao(sessionId),
        title: notice.title,
        body: notice.body,
      });
      anunciar(n.id);
    } catch {
      // Título vazio. Não é motivo para derrubar a saída do terminal.
    }
  },
});
let store: Store;

// Fechar a principal encerra o app: os PTYs morrem e as destacadas fecham junto.
const windows = new WindowManager({
  preload: join(here, "../preload/index.cjs"),
  indexHtml: join(here, "../renderer/index.html"),
  onReattached: (sessionId) => {
    const ui = store?.get<{ sessions: Array<{ id: string; detached?: boolean }>; selectedSessionId: string | null }>("ui-state");
    if (!ui) return;
    store.set("ui-state", { ...ui, sessions: ui.sessions.map((s) => s.id === sessionId ? { ...s, detached: false } : s),
      selectedSessionId: ui.sessions.some((s) => s.id === sessionId) ? sessionId : ui.selectedSessionId });
    windows.broadcast(EVENTS.storeChanged, { name: "ui-state" });
  },
  onMainClosed: () => {
    pty.killAll();
    app.quit();
  },
});

/** Espaço da sessão, lido do ui-state. O PTY só conhece o id da sessão. */
function spaceDaSessao(sessionId: string): string | null {
  const ui = store?.get<{ sessions: Array<{ id: string; space_id?: string }> }>("ui-state");
  return ui?.sessions.find((s) => s.id === sessionId)?.space_id ?? null;
}

/** Guarda em disco, acende o badge do dock e avisa todas as janelas. */
function anunciar(id: string): void {
  const n = notifications.find(id);
  store?.set("notifications", notifications.toJSON());
  const counts = notifications.counts();
  windows.broadcast(EVENTS.notificationsChanged, counts);
  // Badge do dock só existe no macOS e no Linux.
  if (process.platform !== "win32") app.setBadgeCount(counts.total);
  // Dentro do app o painel e o badge bastam. Fora dele, o macOS avisa.
  if (n && !windows.main?.isFocused() && Notification.isSupported()) {
    const aviso = new Notification({ title: n.title, body: n.body ?? "", silent: n.level === "info" });
    aviso.on("click", () => {
      windows.main?.show();
      windows.main?.focus();
    });
    aviso.show();
  }
}

/** Atalhos vão para a janela focada (principal ou destacada). */
function sendShortcut(name: Shortcut): void {
  const win = BrowserWindow.getFocusedWindow() ?? windows.main ?? BrowserWindow.getAllWindows()[0];
  win?.webContents.send(EVENTS.shortcut, name);
}

/** Menu mínimo. No mac, copiar/colar só funcionam com os itens de Edit no menu. */
function buildMenu(): Menu {
  const appMenu: MenuItemConstructorOptions[] = isMac
    ? [{ role: "appMenu" as const }]
    : [];
  const template: MenuItemConstructorOptions[] = [
    ...appMenu,
    {
      label: "File",
      submenu: [
        { label: "New Terminal", accelerator: "CmdOrCtrl+T", click: () => sendShortcut("new") },
        { label: "Close Terminal", accelerator: "CmdOrCtrl+W", click: () => sendShortcut("close") },
        { label: "Search…", accelerator: "CmdOrCtrl+P", click: () => sendShortcut("search") },
        { type: "separator" },
        { label: "Settings…", accelerator: "CmdOrCtrl+,", click: () => sendShortcut("settings") },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
  ];
  return Menu.buildFromTemplate(template);
}

app.whenReady().then(() => {
  store = new Store(app.getPath("userData"));
  // O que eu não vi antes de fechar continua me esperando.
  notifications.restore(store.get("notifications"));
  notifyServer.listen(socketPathFor(app.getPath("userData"), process.platform));
  registerHandlers({
    store, pty, userDataDir: app.getPath("userData"), windows,
    notifications, notifyServer, notifySocket: socketPathFor(app.getPath("userData"), process.platform),
  });
  Menu.setApplicationMenu(buildMenu());
  windows.createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) windows.createMainWindow();
  });
});

// É um terminal: sem janela não há razão de viver. Vale também no macOS.
app.on("window-all-closed", () => {
  pty.killAll();
  app.quit();
});

app.on("before-quit", () => {
  // Ninguém fica pendurado esperando uma resposta que não vem mais.
  notifyServer.close();
  pty.killAll();
});

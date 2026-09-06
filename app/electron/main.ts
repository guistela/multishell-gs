// Processo main: janelas, menu, IPC. O renderer é sandbox puro; tudo passa pelo preload.
import { app, BrowserWindow, Menu, type MenuItemConstructorOptions } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { registerHandlers } from "./handlers";
import { EVENTS, type Shortcut } from "./ipc";
import { PtyManager } from "./pty";
import { Store } from "./store";
import { WindowManager } from "./windows";

const here = dirname(fileURLToPath(import.meta.url));
const isMac = process.platform === "darwin";
const pty = new PtyManager();
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
  registerHandlers({ store, pty, userDataDir: app.getPath("userData"), windows });
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

app.on("before-quit", () => pty.killAll());

// Ponte renderer ⇄ main. Só o que o contrato expõe em `window.multishell`.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import {
  EVENTS,
  type PtyExitEvent,
  type PtyOutputEvent,
  type SessionReattachedEvent,
  type Shortcut,
  type StoreChangedEvent,
  type SessionDragEvent,
} from "./ipc";

export interface MultishellBridge {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
  onPtyOutput(sessionId: string, cb: (bytes: Uint8Array) => void): () => void;
  onPtyExit(cb: (exit: PtyExitEvent) => void): () => void;
  onShortcut(cb: (name: Shortcut) => void): () => void;
  /** Fase 8: a janela destacada da sessão fechou; a principal volta a renderizar o Terminal. */
  onSessionReattached(cb: (ev: SessionReattachedEvent) => void): () => void;
  /** Fase 8: outra janela fez `store_set(name)`; recarregue esse store. */
  onStoreChanged(cb: (ev: StoreChangedEvent) => void): () => void;
  onSessionDrag(cb: (ev: SessionDragEvent | null) => void): () => void;
  platform: "darwin" | "win32" | "linux";
}

const bridge: MultishellBridge = {
  invoke: <T,>(command: string, args?: Record<string, unknown>) =>
    ipcRenderer.invoke(command, args ?? {}) as Promise<T>,

  onPtyOutput(sessionId, cb) {
    const listener = (_e: IpcRendererEvent, payload: PtyOutputEvent) => {
      if (payload.session_id === sessionId) cb(payload.data);
    };
    ipcRenderer.on(EVENTS.ptyOutput, listener);
    return () => ipcRenderer.removeListener(EVENTS.ptyOutput, listener);
  },

  onPtyExit(cb) {
    const listener = (_e: IpcRendererEvent, payload: PtyExitEvent) => cb(payload);
    ipcRenderer.on(EVENTS.ptyExit, listener);
    return () => ipcRenderer.removeListener(EVENTS.ptyExit, listener);
  },

  onShortcut(cb) {
    const listener = (_e: IpcRendererEvent, name: Shortcut) => cb(name);
    ipcRenderer.on(EVENTS.shortcut, listener);
    return () => ipcRenderer.removeListener(EVENTS.shortcut, listener);
  },

  onSessionReattached(cb) {
    const listener = (_e: IpcRendererEvent, payload: SessionReattachedEvent) => cb(payload);
    ipcRenderer.on(EVENTS.sessionReattached, listener);
    return () => ipcRenderer.removeListener(EVENTS.sessionReattached, listener);
  },

  onStoreChanged(cb) {
    const listener = (_e: IpcRendererEvent, payload: StoreChangedEvent) => cb(payload);
    ipcRenderer.on(EVENTS.storeChanged, listener);
    return () => ipcRenderer.removeListener(EVENTS.storeChanged, listener);
  },

  onSessionDrag(cb) {
    const listener = (_e: IpcRendererEvent, payload: SessionDragEvent | null) => cb(payload);
    ipcRenderer.on(EVENTS.sessionDrag, listener);
    return () => ipcRenderer.removeListener(EVENTS.sessionDrag, listener);
  },
  platform: process.platform as MultishellBridge["platform"],
};

contextBridge.exposeInMainWorld("multishell", bridge);

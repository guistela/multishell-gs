import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { emitSessionReattached, emitShortcut, emitStoreChanged, invokeMock, resetBridge, sessionReattachedListeners, shortcutListeners, spaceA, storeChangedListeners } from "../test/bridge-mocks";
import "../i18n";
import { DEFAULT_SETTINGS, useAppStore } from "../store";
import { applyShortcut, shortcutFromKey } from "../features/sessions/shortcuts";
import type { Session } from "../types";

vi.mock("../features/terminal/Terminal", () => ({ Terminal: ({ session }: { session: Session }) => <div data-testid={`terminal-${session.id}`} /> }));

import App, { detachedSessionIdFromHash } from "../App";

const s1: Session = { id: "s1", title: "Shell 1", space_id: spaceA.id, provider_id: null, bypass: false, cwd: null, harness_running: false, detached: false };

beforeEach(() => {
  localStorage.removeItem("multishell.sidebarCollapsed");
  useAppStore.setState({ selectedSpaceId: spaceA.id, spaceLayouts: {} });
  window.location.hash = "";
  document.title = "";
  resetBridge();
  invokeMock.mockResolvedValue(undefined);
  useAppStore.setState({ spaces: [spaceA], providers: [], sessions: [s1], selectedSessionId: "s1", settings: DEFAULT_SETTINGS, loaded: true, loadError: null, migration: null, restoredSessionIds: new Set() });
  useAppStore.setState({ load: async () => {} });
});

describe("shortcutFromKey", () => {
  it("Cmd/Ctrl + t/w/,/p/k → new/close/settings/search", () => {
    expect(shortcutFromKey({ metaKey: true, ctrlKey: false, key: "t" })).toBe("new");
    expect(shortcutFromKey({ metaKey: false, ctrlKey: true, key: "w" })).toBe("close");
    expect(shortcutFromKey({ metaKey: true, ctrlKey: false, key: "," })).toBe("settings");
    expect(shortcutFromKey({ metaKey: true, ctrlKey: false, key: "p" })).toBe("search");
    expect(shortcutFromKey({ metaKey: true, ctrlKey: false, key: "k" })).toBe("search");
  });
  it("sem modificador ou tecla desconhecida: null", () => {
    expect(shortcutFromKey({ metaKey: false, ctrlKey: false, key: "t" })).toBeNull();
    expect(shortcutFromKey({ metaKey: true, ctrlKey: false, key: "x" })).toBeNull();
  });
});

describe("applyShortcut", () => {
  it("new cria sessão no espaço da atual", () => {
    applyShortcut("new", () => {});
    const st = useAppStore.getState();
    expect(st.sessions).toHaveLength(2);
    expect(st.sessions[1].space_id).toBe(spaceA.id);
    expect(st.selectedSessionId).toBe(st.sessions[1].id);
  });
  it("close fecha a atual", () => {
    applyShortcut("close", () => {});
    expect(useAppStore.getState().sessions).toHaveLength(0);
  });
  it("settings chama openSettings", () => {
    const open = vi.fn();
    applyShortcut("settings", open);
    expect(open).toHaveBeenCalledOnce();
  });
});

describe("App: atalhos", () => {
  it("registra onShortcut na bridge e desregistra ao desmontar", () => {
    const { unmount } = render(<App />);
    expect(shortcutListeners.size).toBe(1);
    unmount();
    expect(shortcutListeners.size).toBe(0);
  });

  it("menu nativo: new cria sessão", () => {
    render(<App />);
    act(() => emitShortcut("new"));
    expect(useAppStore.getState().sessions).toHaveLength(2);
  });

  it("menu nativo: settings abre as configurações", () => {
    render(<App />);
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => emitShortcut("settings"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("menu nativo: search abre a busca rápida de terminais e espaços", () => {
    render(<App />);
    expect(screen.queryByTestId("quick-search-palette")).toBeNull();
    act(() => emitShortcut("search"));
    expect(screen.getByTestId("quick-search-palette")).toBeInTheDocument();
  });

  it("botão de busca na barra de título abre a busca rápida", () => {
    render(<App />);
    expect(screen.queryByTestId("quick-search-palette")).toBeNull();
    fireEvent.click(screen.getByTestId("titlebar-search-btn"));
    expect(screen.getByTestId("quick-search-palette")).toBeInTheDocument();
  });

  it("keydown Cmd+W fecha a última sessão e mantém o estado vazio", () => {
    render(<App />);
    fireEvent.keyDown(window, { key: "w", metaKey: true });
    expect(useAppStore.getState().sessions).toHaveLength(0);
    expect(screen.getByRole("heading", { name: "Pronto quando você estiver" })).toBeInTheDocument();
  });
});

describe("App: Fase 8 (janelas)", () => {
  it("detachedSessionIdFromHash lê #/detached/<id>", () => {
    expect(detachedSessionIdFromHash("#/detached/abc")).toBe("abc");
    expect(detachedSessionIdFromHash("")).toBeNull();
    expect(detachedSessionIdFromHash("#/settings")).toBeNull();
  });

  it("registra onStoreChanged e onSessionReattached e desregistra ao desmontar", () => {
    const { unmount } = render(<App />);
    expect(storeChangedListeners.size).toBe(1);
    expect(sessionReattachedListeners.size).toBe(1);
    unmount();
    expect(storeChangedListeners.size).toBe(0);
    expect(sessionReattachedListeners.size).toBe(0);
  });

  it("store-changed de ui-state recarrega as sessões", async () => {
    render(<App />);
    invokeMock.mockImplementation(async (cmd: string, args?: { name?: string }) =>
      cmd === "store_get" && args?.name === "ui-state" ? { sessions: [{ ...s1, title: "Renomeada" }], selectedSessionId: "s1" } : undefined,
    );
    await act(async () => { emitStoreChanged("ui-state"); await Promise.resolve(); await Promise.resolve(); });
    expect(useAppStore.getState().sessions[0].title).toBe("Renomeada");
  });

  it("store-changed de outro nome não recarrega", async () => {
    render(<App />);
    invokeMock.mockClear();
    await act(async () => { emitStoreChanged("settings"); await Promise.resolve(); });
    expect(invokeMock).not.toHaveBeenCalledWith("store_get", expect.anything());
  });

  it("session-reattached zera detached", () => {
    useAppStore.setState({ sessions: [{ ...s1, detached: true }] });
    render(<App />);
    act(() => emitSessionReattached("s1"));
    expect(useAppStore.getState().sessions[0].detached).toBe(false);
  });

  it("sessão detached: não renderiza Terminal e mostra painel com Trazer de volta", () => {
    useAppStore.setState({ sessions: [{ ...s1, detached: true }] });
    render(<App />);
    expect(screen.queryByTestId("terminal-s1")).toBeNull();
    expect(screen.getByText("Este terminal está em outra janela")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Trazer de volta" }));
    expect(useAppStore.getState().sessions[0].detached).toBe(false);
    expect(invokeMock).toHaveBeenCalledWith("session_reattach", { sessionId: "s1" });
  });

  it("sessão normal renderiza o Terminal", () => {
    render(<App />);
    expect(screen.getByTestId("terminal-s1")).toBeInTheDocument();
  });

  it("#/detached/<id> renderiza a DetachedApp: sem sidebar, com Terminal, título e Devolver ao espaço", () => {
    window.location.hash = "#/detached/s1";
    render(<App />);
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(screen.getByTestId("terminal-s1")).toBeInTheDocument();
    expect(document.title).toBe("Shell 1");
    expect(screen.getByRole("combobox", { name: "Espaço" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Devolver ao espaço" }));
    expect(invokeMock).toHaveBeenCalledWith("session_reattach", { sessionId: "s1" });
  });

  it("#/detached/<id> com sessão inexistente: mostra aviso e botão que chama session_reattach", () => {
    window.location.hash = "#/detached/nope";
    render(<App />);
    expect(screen.getByText("Esta sessão não existe mais")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Devolver ao espaço" }));
    expect(invokeMock).toHaveBeenCalledWith("session_reattach", { sessionId: "nope" });
  });
});


describe("home and sidebar", () => {
  it("loads an empty workspace without creating a shell, until requested", () => {
    useAppStore.setState({ sessions: [], selectedSessionId: null });
    render(<App />);
    expect(useAppStore.getState().sessions).toHaveLength(0);
    expect(screen.queryByTestId("terminal-s1")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Criar terminal" }));
    expect(useAppStore.getState().sessions).toHaveLength(1);
    expect(useAppStore.getState().sessions[0].space_id).toBe(spaceA.id);
  });
  it("collapses the sidebar without unmounting terminals and remembers the choice", () => {
    const { unmount } = render(<App />);
    const terminal = screen.getByTestId("terminal-s1");
    fireEvent.click(screen.getByRole("button", { name: "Recolher barra lateral" }));
    expect(screen.getByRole("complementary")).toHaveClass("collapsed");
    expect(screen.getByTestId("terminal-s1")).toBe(terminal);
    expect(screen.getByRole("button", { name: "Pessoal" })).toBeInTheDocument();
    unmount();
    render(<App />);
    expect(screen.getByRole("button", { name: "Expandir barra lateral" })).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(screen.getByRole("button", { name: "Expandir barra lateral" }));
    expect(screen.getByRole("complementary")).not.toHaveClass("collapsed");
  });
  it("provides a settings entry point when there are no spaces", () => {
    useAppStore.setState({ sessions: [], spaces: [], selectedSessionId: null, selectedSpaceId: null });
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Configurar espaços" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

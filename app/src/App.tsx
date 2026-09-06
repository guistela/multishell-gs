import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SessionDropOverlay } from "./features/sessions/SessionDropOverlay";
import { Workspace } from "./features/sessions/Workspace";
import { DetachedApp } from "./features/sessions/DetachedApp";
import { pollCwds } from "./features/terminal/useCwdTracker";
import { Sidebar } from "./features/sessions/Sidebar";
import { applyShortcut, shortcutFromKey } from "./features/sessions/shortcuts";
import { SessionBar } from "./features/sessions/SessionBar";
import SettingsView from "./features/settings/SettingsView";
import { QuickSearchModal } from "./features/sessions/QuickSearchModal";
import { bridge } from "./bridge";
import { useAppStore } from "./store";
import "./App.css";

export function detachedSessionIdFromHash(hash: string): string | null {
  return /^#\/detached\/([^/]+)$/.exec(hash)?.[1] ?? null;
}

export default function App() {
  useEffect(() => {
    const offStore = bridge().onStoreChanged(({ name }) => {
      if (name === "ui-state") void useAppStore.getState().reloadUiState();
      if (name === "workspace-layouts") void useAppStore.getState().reloadLayouts();
    });
    const offReattach = bridge().onSessionReattached(({ session_id }) => {
      useAppStore.setState((state) => ({ sessions: state.sessions.map((s) => s.id === session_id ? { ...s, detached: false } : s) }));
    });
    return () => { offStore(); offReattach(); };
  }, []);
  const id = detachedSessionIdFromHash(window.location.hash);
  return <>{id ? <DetachedApp sessionId={id} /> : <MainApp />}<SessionDropOverlay detachedSessionId={id} /></>;
}

function MainApp() {
  const { t } = useTranslation("session");
  const loaded = useAppStore((s) => s.loaded);
  const loadError = useAppStore((s) => s.loadError);
  const sessions = useAppStore((s) => s.sessions);
  const selectedSessionId = useAppStore((s) => s.selectedSessionId);
  const migration = useAppStore((s) => s.migration);
  const dismissMigration = useAppStore((s) => s.dismissMigration);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"providers" | "spaces" | "terminal">("providers");
  const [initialCreateSpace, setInitialCreateSpace] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem("multishell.sidebarCollapsed") === "true"; } catch { return false; }
  });
  const toggleSidebar = () => setSidebarCollapsed((collapsed) => {
    try { localStorage.setItem("multishell.sidebarCollapsed", String(!collapsed)); } catch { /* storage unavailable */ }
    return !collapsed;
  });

  const openSettings = (tab?: "providers" | "spaces" | "terminal", createSpace?: boolean) => {
    if (tab) setSettingsTab(tab);
    setInitialCreateSpace(Boolean(createSpace));
    setSettingsOpen(true);
  };

  const closeSettings = () => {
    setSettingsOpen(false);
    setInitialCreateSpace(false);
  };

  const openSearch = () => setSearchModalOpen(true);

  useEffect(() => { void useAppStore.getState().load(); }, []);

  // Sessão selecionada sumiu (ex.: reinício): seleciona a primeira.
  useEffect(() => {
    if (!loaded || sessions.length === 0) return;
    const state = useAppStore.getState();
    if (!sessions.some((s) => s.id === selectedSessionId)) {
      const first = sessions.find((s) => !state.selectedSpaceId || s.space_id === state.selectedSpaceId);
      if (first) state.selectSession(first.id);
    }
  }, [loaded, sessions, selectedSessionId]);

  // Salva o cwd ao sair; o processo main encerra os PTYs ao fechar o app.
  useEffect(() => {
    const onUnload = () => {
      void pollCwds();
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);

  // Atalhos: keydown (foco no renderer) e menu nativo (bridge.onShortcut). O menu
  // intercepta o acelerador antes do keydown, então nunca dispara duas vezes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const action = shortcutFromKey(e);
      if (!action) return;
      e.preventDefault();
      applyShortcut(action, () => openSettings(), openSearch);
    };
    window.addEventListener("keydown", onKey);
    const unsubscribe = bridge().onShortcut((action) => applyShortcut(action, () => openSettings(), openSearch));
    return () => {
      window.removeEventListener("keydown", onKey);
      unsubscribe();
    };
  }, []);

  if (!loaded) return null;
  if (loadError) return <pre style={{ padding: 16, color: "#ff6b6b", whiteSpace: "pre-wrap" }}>{loadError}</pre>;
  const current = sessions.find((s) => s.id === selectedSessionId);

  return (
    <div className="app-window">
      <header className="app-titlebar">
        <button className="sidebar-toggle" aria-label={t(sidebarCollapsed ? "sidebar.expand" : "sidebar.collapse")}
          aria-expanded={!sidebarCollapsed} aria-controls="workspace-sidebar" onClick={toggleSidebar}>
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="2" y="3" width="16" height="14" rx="3" stroke="currentColor" strokeWidth="1.5"/><path d="M7 3v14" stroke="currentColor" strokeWidth="1.5"/></svg>
        </button>
        <span className="app-wordmark">Multishell</span>
        <button
          className="titlebar-search-btn"
          data-testid="titlebar-search-btn"
          aria-label={t("shortcuts.search")}
          title={t("shortcuts.search")}
          onClick={openSearch}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span className="titlebar-search-label">{t("search.buttonLabel")}</span>
          <kbd>{typeof navigator !== "undefined" && navigator.platform.toLowerCase().includes("mac") ? "⌘" : "Ctrl+"}P</kbd>
        </button>
        <span className="app-titlebar-caption">{t("home.caption")}</span>
      </header>
      <div className="app">
      <Sidebar collapsed={sidebarCollapsed} onOpenSettings={openSettings} onOpenSearch={openSearch} />
      <main>
        {current && !current.detached && <SessionBar session={current} onOpenSettings={openSettings} />}
        <Workspace onOpenSettings={openSettings} />
      </main>
      </div>
      <SettingsView open={settingsOpen} initialTab={settingsTab} initialCreateSpace={initialCreateSpace} onClose={closeSettings} />
      <QuickSearchModal open={searchModalOpen} onClose={() => setSearchModalOpen(false)} />
      {migration && (
        <div className="toast" role="status">
          <span>{t("migration.toast", { spaces: migration.spaces, sessions: migration.sessions })}</span>
          <button className="icon" aria-label={t("migration.dismiss")} onClick={dismissMigration}>✕</button>
        </div>
      )}
    </div>
  );
}

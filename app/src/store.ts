// Estado global (zustand). Dono: agente front-shell. Outros agentes só consomem.
import { create } from "zustand";
import { pty } from "./features/terminal/pty";
import { api } from "./api";
import { setLanguage } from "./i18n";
import { LAYOUT_MODES, type LayoutMode } from "./types";
import type { MigrationReport, Provider, Session, Space, TerminalSettings } from "./types";

export const DEFAULT_SETTINGS: TerminalSettings = {
  shell: null, default_cwd: null, font_family: "SF Mono, Menlo, Consolas, monospace",
  font_size: 13, theme: "dark", language: "pt-BR",
};

interface UiState { sessions: Array<Omit<Session, "harness_running"> & { harness_running?: boolean }>; selectedSessionId: string | null }

interface AppState {
  spaces: Space[];
  providers: Provider[];
  sessions: Session[];
  selectedSessionId: string | null;
  selectedSpaceId: string | null;
  spaceLayouts: Record<string, LayoutMode>;
  selectSpace: (id: string) => void;
  setSpaceLayout: (id: string, layout: LayoutMode) => Promise<void>;
  reloadLayouts: () => Promise<void>;
  settings: TerminalSettings;
  loaded: boolean;
  loadError: string | null;
  /** Relatório da migração do app Swift. Só na primeira carga. */
  migration: MigrationReport | null;
  /** Ids das sessões restauradas em load(). O Terminal consome ao fazer o resume. */
  restoredSessionIds: Set<string>;

  load: () => Promise<void>;
  reloadUiState: () => Promise<void>;
  detachSession: (id: string) => Promise<void>;
  reattachSession: (id: string) => Promise<void>;
  saveSpace: (space: Space) => Promise<void>;
  deleteSpace: (spaceId: string) => Promise<void>;
  saveProvider: (provider: Provider) => Promise<void>;
  deleteProvider: (providerId: string) => Promise<void>;
  saveSettings: (settings: TerminalSettings) => Promise<void>;
  addSession: (partial: Partial<Session> & { space_id: string }) => Session;
  updateSession: (id: string, patch: Partial<Session>) => void;
  /** Aplica vários patches de uma vez. Persiste ui-state uma única vez. */
  patchSessions: (patches: Record<string, Partial<Session>>) => void;
  removeSession: (id: string) => void;
  closeSpaceSessions: (spaceId: string) => void;
  duplicateSession: (id: string) => Session | null;
  selectSession: (id: string | null) => void;
  /** Recria a sessão com id novo (mesma posição, mesmo título). Usado em "Reiniciar" e troca de Espaço. */
  restartSession: (id: string, patch?: Partial<Session>) => Session | null;
  markHarnessStarted: (id: string) => void;
  /** Remove o id de restoredSessionIds. Devolve true se estava lá. */
  consumeRestored: (id: string) => boolean;
  dismissMigration: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  spaces: [], providers: [], sessions: [], selectedSessionId: null, settings: DEFAULT_SETTINGS, loaded: false, loadError: null,
  migration: null, restoredSessionIds: new Set(), selectedSpaceId: null, spaceLayouts: {},

  selectSpace: (id) => {
    const current = get().sessions.find((s) => s.id === get().selectedSessionId && s.space_id === id);
    set({ selectedSpaceId: id, selectedSessionId: current?.id ?? get().sessions.find((s) => s.space_id === id)?.id ?? null });
    void persistUi(get);
  },
  setSpaceLayout: async (id, layout) => {
    if (!LAYOUT_MODES.includes(layout)) return;
    const spaceLayouts = { ...get().spaceLayouts, [id]: layout };
    set({ spaceLayouts });
    await api.storeSet("workspace-layouts", spaceLayouts);
  },
  reloadLayouts: async () => {
    set({ spaceLayouts: normalizeLayouts(await api.storeGet("workspace-layouts")) });
  },

  load: async () => {
    try {
      await loadInner(set);
    } catch (e) {
      set({ loadError: String((e as Error)?.message ?? e), loaded: true });
    }
  },
  reloadUiState: async () => {
    const ui = await api.storeGet<UiState>("ui-state");
    if (!ui) return;
    set((state) => ({
      sessions: ui.sessions.map((saved) => {
        const old = state.sessions.find((s) => s.id === saved.id);
        const next: Session = { ...saved, harness_running: saved.harness_running ?? false, detached: saved.detached ?? false };
        if (old?.exit_code !== undefined) next.exit_code = old.exit_code;
        return old && Object.keys(next).every((key) => old[key as keyof Session] === next[key as keyof Session]) ? old : next;
      }),
      selectedSessionId: ui.selectedSessionId,
      selectedSpaceId: ui.sessions.find((s) => s.id === ui.selectedSessionId)?.space_id ?? state.selectedSpaceId,
    }));
  },
  detachSession: async (id) => {
    set((state) => ({ sessions: state.sessions.map((s) => s.id === id ? { ...s, detached: true } : s) }));
    try { await persistUi(get); await api.sessionDetach(id); }
    catch (error) { get().updateSession(id, { detached: false }); throw error; }
  },
  reattachSession: async (id) => {
    get().updateSession(id, { detached: false });
    await api.sessionReattach(id);
  },
  saveSpace: async (space) => {
    const saved = await api.spaceSave(space);
    set((s) => ({ spaces: s.spaces.some((x) => x.id === saved.id) ? s.spaces.map((x) => (x.id === saved.id ? saved : x)) : [...s.spaces, saved] }));
  },
  deleteSpace: async (spaceId) => { await api.spaceDelete(spaceId); set((s) => ({ spaces: s.spaces.filter((x) => x.id !== spaceId) })); },
  saveProvider: async (provider) => {
    const saved = await api.providerSave(provider);
    set((s) => ({ providers: s.providers.some((x) => x.id === saved.id) ? s.providers.map((x) => (x.id === saved.id ? saved : x)) : [...s.providers, saved] }));
  },
  deleteProvider: async (providerId) => { await api.providerDelete(providerId); set((s) => ({ providers: s.providers.filter((x) => x.id !== providerId) })); },
  saveSettings: async (settings) => { await api.storeSet("settings", settings); set({ settings }); },
  addSession: (partial) => {
    const session: Session = { id: crypto.randomUUID(), title: partial.title ?? "Shell", provider_id: null, bypass: false, cwd: null, harness_running: false, detached: false, ...partial };
    set((s) => ({ sessions: [...s.sessions, session], selectedSessionId: session.id, selectedSpaceId: session.space_id }));
    persistUi(get);
    return session;
  },
  updateSession: (id, patch) => { set((s) => ({ sessions: s.sessions.map((x) => (x.id === id ? { ...x, ...patch } : x)) })); persistUi(get); },
  patchSessions: (patches) => {
    set((s) => ({ sessions: s.sessions.map((x) => (patches[x.id] ? { ...x, ...patches[x.id] } : x)) }));
    persistUi(get);
  },
  removeSession: (id) => {
    void pty.kill(id).catch(() => {});
    if (get().sessions.find((s) => s.id === id)?.detached) void api.sessionReattach(id);
    set((s) => {
      const closing = s.sessions.find((x) => x.id === id);
      const targetSpaceId = closing?.space_id ?? s.selectedSpaceId;
      const sessions = s.sessions.filter((x) => x.id !== id);
      const remainingInSpace = sessions.filter((x) => x.space_id === targetSpaceId);
      const selectedSessionId =
        s.selectedSessionId === id
          ? (remainingInSpace[0]?.id ?? null)
          : (sessions.some((x) => x.id === s.selectedSessionId) ? s.selectedSessionId : (remainingInSpace[0]?.id ?? null));
      return { sessions, selectedSessionId, selectedSpaceId: targetSpaceId };
    });
    persistUi(get);
  },
  closeSpaceSessions: (spaceId) => {
    const toRemove = get().sessions.filter((s) => s.space_id === spaceId);
    for (const s of toRemove) {
      void pty.kill(s.id).catch(() => {});
      if (s.detached) void api.sessionReattach(s.id);
    }
    set((s) => {
      const sessions = s.sessions.filter((x) => x.space_id !== spaceId);
      const targetSpaceId = s.selectedSpaceId;
      const remainingInSpace = sessions.filter((x) => x.space_id === targetSpaceId);
      const selectedSessionId = remainingInSpace[0]?.id ?? null;
      return { sessions, selectedSessionId, selectedSpaceId: targetSpaceId };
    });
    persistUi(get);
  },
  duplicateSession: (id) => {
    const old = get().sessions.find((x) => x.id === id);
    if (!old) return null;
    const count = get().sessions.filter((s) => s.title.startsWith(old.title)).length;
    const title = count > 1 ? `${old.title} (${count + 1})` : `${old.title} (2)`;
    const duplicate: Session = {
      id: crypto.randomUUID(),
      title,
      space_id: old.space_id,
      provider_id: old.provider_id,
      bypass: old.bypass,
      cwd: old.cwd,
      harness_running: false,
      detached: false,
    };
    set((s) => ({
      sessions: [...s.sessions, duplicate],
      selectedSessionId: duplicate.id,
      selectedSpaceId: duplicate.space_id,
    }));
    persistUi(get);
    return duplicate;
  },
  selectSession: (id) => { set({ selectedSessionId: id, selectedSpaceId: get().sessions.find((s) => s.id === id)?.space_id ?? get().selectedSpaceId }); persistUi(get); },
  restartSession: (id, patch) => {
    const old = get().sessions.find((x) => x.id === id);
    if (!old) return null;
    void pty.kill(id).catch(() => {});
    if (old.detached) void api.sessionReattach(id);
    const { exit_code: _e, ...base } = old;
    const fresh: Session = { ...base, harness_running: false, detached: false, ...patch, id: crypto.randomUUID() };
    set((s) => ({
      sessions: s.sessions.map((x) => (x.id === id ? fresh : x)),
      selectedSessionId: s.selectedSessionId === id ? fresh.id : s.selectedSessionId,
    }));
    persistUi(get);
    return fresh;
  },
  markHarnessStarted: (id) => get().updateSession(id, { harness_running: true }),
  consumeRestored: (id) => {
    const ids = get().restoredSessionIds;
    if (!ids.has(id)) return false;
    const next = new Set(ids);
    next.delete(id);
    set({ restoredSessionIds: next });
    return true;
  },
  dismissMigration: () => set({ migration: null }),
}));

function persistUi(get: () => AppState) {
  const { sessions, selectedSessionId } = get();
  return api.storeSet("ui-state", { sessions: sessions.map(({ exit_code: _e, ...s }) => s), selectedSessionId });
}

async function loadInner(set: (partial: Partial<AppState>) => void) {
    let ui = await api.storeGet<UiState>("ui-state");
    let migration: MigrationReport | null = null;
    if (ui === null) {
      try {
        const report = await api.migrateFromSwift();
        if (report.spaces + report.sessions > 0) {
          migration = report;
          ui = await api.storeGet<UiState>("ui-state");
        }
      } catch { /* sem app antigo */ }
    }
    const [spaces, providers, settings, layouts] = await Promise.all([
      api.spacesList(), api.providersList(), api.storeGet<TerminalSettings>("settings"), api.storeGet("workspace-layouts"),
    ]);
    const sessions: Session[] = (ui?.sessions ?? []).map((s) => ({ ...s, harness_running: s.harness_running ?? false, detached: s.detached ?? false }));
    const merged = { ...DEFAULT_SETTINGS, ...(settings ?? {}) };
    void setLanguage(merged.language);
    set({ spaces, providers, settings: merged, spaceLayouts: normalizeLayouts(layouts),
      selectedSpaceId: sessions.find((s) => s.id === ui?.selectedSessionId)?.space_id ?? spaces[0]?.id ?? null,
      sessions, selectedSessionId: ui?.selectedSessionId ?? null, loaded: true, migration,
      restoredSessionIds: new Set(sessions.map((s) => s.id)) });
}

function normalizeLayouts(value: unknown): Record<string, LayoutMode> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, mode]) => LAYOUT_MODES.includes(mode as LayoutMode)));
}

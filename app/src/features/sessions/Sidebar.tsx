import { SessionDragHandle } from "./SessionDragHandle";
import { ProviderIcon } from "../providers/ProviderIcon";
import { agentState } from "../terminal/agentActivity";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ContextMenu, type MenuItem } from "../../components/ContextMenu";
import { useAppStore } from "../../store";
import type { Session, Space } from "../../types";
import { useSessionMenuItems } from "./useSessionMenuItems";
import { useSpaceMenuItems } from "../spaces/useSpaceMenuItems";
import { nextTitle } from "./sessionTitles";

export function Sidebar({
  onOpenSettings,
  onOpenSearch,
  collapsed = false,
}: {
  onOpenSettings: (tab?: "providers" | "spaces" | "terminal", initialCreate?: boolean) => void;
  onOpenSearch?: () => void;
  collapsed?: boolean;
}) {
  const { t } = useTranslation(["session", "common"]);
  const spaces = useAppStore((s) => s.spaces);
  const sessions = useAppStore((s) => s.sessions);
  const providers = useAppStore((s) => s.providers);
  const addSession = useAppStore((s) => s.addSession);
  const activeSpace = useAppStore((s) => s.sessions.find((session) => session.id === s.selectedSessionId)?.space_id ?? s.selectedSpaceId);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsedSpaces, setCollapsedSpaces] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem("multishell.collapsedSpaces");
      return stored ? new Set(JSON.parse(stored)) : new Set<string>();
    } catch {
      return new Set<string>();
    }
  });

  const toggleSpaceCollapse = (spaceId: string) => {
    setCollapsedSpaces((prev) => {
      const next = new Set(prev);
      if (next.has(spaceId)) next.delete(spaceId);
      else next.add(spaceId);
      try {
        localStorage.setItem("multishell.collapsedSpaces", JSON.stringify([...next]));
      } catch {}
      return next;
    });
  };

  const q = searchQuery.trim().toLowerCase();

  const filteredGroups = useMemo(() => {
    return spaces.map((space) => {
      const spaceSessions = sessions.filter((s) => s.space_id === space.id);
      if (!q) {
        return { space, sessions: spaceSessions, match: true };
      }
      const spaceMatches =
        space.name.toLowerCase().includes(q) ||
        space.directory_name.toLowerCase().includes(q);

      const matchingSessions = spaceSessions.filter((s) => {
        const provider = providers.find((p) => p.id === s.provider_id);
        return (
          s.title.toLowerCase().includes(q) ||
          (s.cwd && s.cwd.toLowerCase().includes(q)) ||
          (provider && provider.name.toLowerCase().includes(q))
        );
      });

      if (spaceMatches) {
        return {
          space,
          sessions: matchingSessions.length > 0 ? matchingSessions : spaceSessions,
          match: true,
        };
      }

      if (matchingSessions.length > 0) {
        return { space, sessions: matchingSessions, match: true };
      }

      return { space, sessions: [], match: false };
    }).filter((g) => g.match);
  }, [spaces, sessions, providers, q]);

  return (
    <aside id="workspace-sidebar" className={`sidebar${collapsed ? " collapsed" : ""}`}>
      <header>
        {!collapsed && <h1>{t("session:sidebar.spaces")}</h1>}
        <div className="sidebar-header-actions">
          <button
            className="icon"
            data-testid="sidebar-add-space"
            aria-label={t("session:sidebar.newSpace")}
            title={t("session:sidebar.newSpace")}
            onClick={() => onOpenSettings("spaces", true)}
          >
            +
          </button>
          <button
            className="icon"
            aria-label={t("common:settings.title")}
            title={t("session:shortcuts.settings")}
            onClick={() => onOpenSettings()}
          >
            ⚙
          </button>
        </div>
      </header>

      {!collapsed && (
        <div className="sidebar-search">
          <svg className="sidebar-search-icon" width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            className="sidebar-search-input"
            placeholder={t("session:sidebar.searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label={t("session:sidebar.searchPlaceholder")}
          />
          {searchQuery && (
            <button
              type="button"
              className="sidebar-search-clear"
              aria-label={t("session:sidebar.clearSearch")}
              onClick={() => setSearchQuery("")}
            >
              ✕
            </button>
          )}
        </div>
      )}

      <div className="groups">
        {collapsed ? (
          <>
            {onOpenSearch && (
              <button
                type="button"
                className="space-avatar search-avatar"
                data-testid="sidebar-search-avatar"
                aria-label={t("session:shortcuts.search")}
                title={t("session:shortcuts.search")}
                onClick={onOpenSearch}
              >
                🔍
              </button>
            )}
            {spaces.map((space) => (
              <CollapsedSpaceAvatar
                key={space.id}
                space={space}
                active={activeSpace === space.id}
                onOpenSettings={onOpenSettings}
                onContextMenu={(e, items) => {
                  e.preventDefault();
                  setContextMenu({ x: e.clientX, y: e.clientY, items });
                }}
              />
            ))}
            <button
              type="button"
              className="space-avatar add-space-avatar"
              data-testid="sidebar-add-space-avatar"
              aria-label={t("session:sidebar.newSpace")}
              title={t("session:sidebar.newSpace")}
              onClick={() => onOpenSettings("spaces", true)}
            >
              +
            </button>
          </>
        ) : (
          <>
            {filteredGroups.length === 0 && q ? (
              <div className="sidebar-no-results">{t("session:sidebar.noResults")}</div>
            ) : (
              filteredGroups.map(({ space, sessions: groupSessions }) => (
                <SpaceGroup
                  key={space.id}
                  space={space}
                  sessions={groupSessions}
                  collapsed={Boolean(!q && collapsedSpaces.has(space.id))}
                  onToggleCollapse={() => toggleSpaceCollapse(space.id)}
                  onAdd={() => addSession({ space_id: space.id, title: nextTitle(sessions) })}
                  onOpenSettings={onOpenSettings}
                  onContextMenu={(e, items) => {
                    e.preventDefault();
                    setContextMenu({ x: e.clientX, y: e.clientY, items });
                  }}
                />
              ))
            )}
            {!q && (
              <button
                type="button"
                className="sidebar-new-space-btn"
                data-testid="sidebar-new-space-btn"
                onClick={() => onOpenSettings("spaces", true)}
              >
                <span className="plus">+</span>
                <span>{t("session:sidebar.newSpace")}</span>
              </button>
            )}
          </>
        )}
      </div>

      {!collapsed && (
        <>
          <div className="sidebar-section-title">{t("sidebar.availableHarnesses")}</div>
          <div className="sidebar-harness-list">
            {providers.map((p) => (
              <button
                key={p.id}
                type="button"
                className="sidebar-harness-btn"
                onClick={() => {
                  const targetSpaceId = activeSpace ?? spaces[0]?.id;
                  if (targetSpaceId) {
                    addSession({
                      space_id: targetSpaceId,
                      title: p.name,
                      provider_id: p.id,
                      bypass: false,
                      auto_start_harness: true,
                    });
                  }
                }}
              >
                <span className="harness-btn-label"><ProviderIcon provider={p} /> {p.name}</span>

              </button>
            ))}
          </div>
        </>
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}
    </aside>
  );
}

function CollapsedSpaceAvatar({
  space,
  active,
  onOpenSettings,
  onContextMenu,
}: {
  space: Space;
  active: boolean;
  onOpenSettings: (tab?: "providers" | "spaces" | "terminal") => void;
  onContextMenu: (e: React.MouseEvent, items: MenuItem[]) => void;
}) {
  const items = useSpaceMenuItems({ space, onOpenSettings });
  return (
    <button
      className={`space-avatar${active ? " active" : ""}`}
      aria-label={space.name}
      aria-pressed={active}
      title={space.name}
      style={{ borderColor: active ? space.color_hex : undefined }}
      onClick={() => useAppStore.getState().selectSpace(space.id)}
      onContextMenu={(e) => onContextMenu(e, items)}
    >
      <span style={{ color: space.color_hex }}>{space.name.trim().slice(0, 2).toUpperCase()}</span>
    </button>
  );
}

function SpaceGroup({
  space,
  sessions,
  collapsed = false,
  onToggleCollapse,
  onAdd,
  onOpenSettings,
  onContextMenu,
}: {
  space: Space;
  sessions: Session[];
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onAdd: () => void;
  onOpenSettings: (tab?: "providers" | "spaces" | "terminal") => void;
  onContextMenu: (e: React.MouseEvent, items: MenuItem[]) => void;
}) {
  const { t } = useTranslation("session");
  const spaceItems = useSpaceMenuItems({ space, onOpenSettings });

  return (
    <section className={`space-group${collapsed ? " is-collapsed" : ""}`} data-testid={`space-${space.id}`}>
      <h2 onContextMenu={(e) => onContextMenu(e, spaceItems)}>
        {onToggleCollapse && (
          <button
            type="button"
            className="icon space-collapse-btn"
            data-testid={`collapse-space-${space.id}`}
            aria-label={collapsed ? t("sidebar.expandSpace", { space: space.name }) : t("sidebar.collapseSpace", { space: space.name })}
            aria-expanded={!collapsed}
            title={collapsed ? t("sidebar.expandSpace", { space: space.name }) : t("sidebar.collapseSpace", { space: space.name })}
            onClick={onToggleCollapse}
          >
            <svg
              className={`chevron ${collapsed ? "collapsed" : ""}`}
              width="11"
              height="11"
              viewBox="0 0 12 12"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M3 4.5L6 7.5L9 4.5"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
        <span className="dot" style={{ background: space.color_hex }} />
        <button className="name space-select" onClick={() => useAppStore.getState().selectSpace(space.id)}>
          {space.name}
        </button>
        {collapsed && sessions.length > 0 && (
          <span className="space-collapsed-badge" title={t("layout.count", { count: sessions.length })}>
            {sessions.length}
          </span>
        )}
        <button
          className="icon"
          aria-label={t("sidebar.newInSpace", { space: space.name })}
          onClick={() => {
            if (collapsed && onToggleCollapse) onToggleCollapse();
            onAdd();
          }}
        >
          +
        </button>
      </h2>
      {!collapsed && (
        <ul>
          {sessions.map((s) => (
            <SessionItem
              key={s.id}
              session={s}
              onOpenSettings={onOpenSettings}
              onContextMenu={onContextMenu}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function SessionItem({
  session,
  onOpenSettings,
  onContextMenu,
}: {
  session: Session;
  onOpenSettings: (tab?: "providers" | "spaces" | "terminal") => void;
  onContextMenu: (e: React.MouseEvent, items: MenuItem[]) => void;
}) {
  const { t } = useTranslation("session");
  const selected = useAppStore((s) => s.selectedSessionId === session.id);
  const provider = useAppStore((s) => s.providers.find((p) => p.id === session.provider_id));
  const selectSession = useAppStore((s) => s.selectSession);
  const updateSession = useAppStore((s) => s.updateSession);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(session.title);
  // Reavalia junto com o restante da sidebar; o output em si não passa pelo React.
  const [, tickState] = useState(0);
  useEffect(() => {
    if (!session.harness_running) return;
    const timer = setInterval(() => tickState((n) => n + 1), 500);
    return () => clearInterval(timer);
  }, [session.harness_running]);
  const state = agentState(session.id, session.harness_running);

  const startRename = () => {
    setDraft(session.title);
    setEditing(true);
  };

  const commit = () => {
    const title = draft.trim();
    if (title && title !== session.title) updateSession(session.id, { title });
    setEditing(false);
  };

  const sessionItems = useSessionMenuItems({
    session,
    onRename: startRename,
    onOpenSettings,
  });

  return (
    <li
      className={selected ? "selected" : ""}
      onClick={() => selectSession(session.id)}
      onDoubleClick={(e) => {
        e.stopPropagation();
        startRename();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu(e, sessionItems);
      }}
      title={t("sidebar.rename")}
    >
      <SessionDragHandle session={session} compact />
      <span className="provider-glyph">
        <ProviderIcon provider={provider} title={provider?.name ?? t("layout.shell")} />
        {session.harness_running && (
          <span
            className={`harness-dot ${state}`}
            data-testid="harness-dot"
            data-state={state}
            title={state === "working" ? t("sidebar.agentWorking") : t("sidebar.agentIdle")}
          />
        )}
      </span>
      {editing ? (
        <input
          autoFocus
          value={draft}
          aria-label={t("sidebar.rename")}
          onFocus={(e) => e.target.select()}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="title">{session.title}</span>
      )}
      {session.detached && <span className="detached-glyph" title={t("detached.detachedHere")}>⧉</span>}
      {session.bypass && <span className="bypass-dot" data-testid="bypass-dot" title={t("sidebar.bypassOn")} />}
    </li>
  );
}

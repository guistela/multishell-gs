import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ContextMenu, type MenuItem } from "../../components/ContextMenu";
import { useAppStore } from "../../store";
import { LAYOUT_MODES, type Session } from "../../types";
import { useSessionMenuItems } from "./useSessionMenuItems";
import { useSpaceMenuItems } from "../spaces/useSpaceMenuItems";
import { Terminal } from "../terminal/Terminal";
import { SessionDragHandle } from "./SessionDragHandle";
import { nextTitle } from "./Sidebar";

/** Keep terminal instances mounted across layout and space changes. */
export function Workspace({ onOpenSettings }: { onOpenSettings?: (tab?: "providers" | "spaces" | "terminal") => void } = {}) {
  const { t } = useTranslation("session");
  const sessions = useAppStore((s) => s.sessions);
  const spaces = useAppStore((s) => s.spaces);
  const selected = useAppStore((s) => s.selectedSessionId);
  const selectedSpace = useAppStore((s) => s.selectedSpaceId);
  const layouts = useAppStore((s) => s.spaceLayouts);
  const current = sessions.find((s) => s.id === selected);
  const spaceId = current?.space_id ?? selectedSpace ?? spaces[0]?.id;
  const space = spaces.find((s) => s.id === spaceId);
  const mode = (spaceId && layouts[spaceId]) || "single";
  const inSpace = sessions.filter((s) => s.space_id === spaceId);
  const tiled = mode === "grid" || mode === "vertical" || mode === "horizontal";
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);

  const spaceMenuItems = space ? useSpaceMenuItems({ space, onOpenSettings }) : [];

  const toggleLayoutMaximize = (clickedSessionId?: string) => {
    if (!spaceId) return;
    if (clickedSessionId && clickedSessionId !== selected) {
      useAppStore.getState().selectSession(clickedSessionId);
    }
    const nextMode = mode === "single" ? (inSpace.length > 1 ? "grid" : "single") : "single";
    void useAppStore.getState().setSpaceLayout(spaceId, nextMode);
  };

  return (
    <section className="workspace" aria-label={t("layout.workspace")}>
      <div
        className="workspace-toolbar"
        onContextMenu={(e) => {
          if (spaceMenuItems.length > 0) {
            e.preventDefault();
            setContextMenu({ x: e.clientX, y: e.clientY, items: spaceMenuItems });
          }
        }}
        onDoubleClick={() => toggleLayoutMaximize()}
      >
        <span className="workspace-space-dot" style={{ background: space?.color_hex }} />
        <strong>{space?.name ?? t("sidebar.spaces")}</strong>
        <span className="session-count">{t("layout.count", { count: inSpace.length })}</span>
        <label onDoubleClick={(e) => e.stopPropagation()}>
          {t("layout.label")}
          <select
            aria-label={t("layout.label")}
            value={mode}
            disabled={!spaceId || inSpace.length === 0}
            onChange={(event) => {
              if (spaceId) void useAppStore.getState().setSpaceLayout(spaceId, event.target.value as typeof mode);
            }}
          >
            {LAYOUT_MODES.map((value) => <option key={value} value={value}>{t(`layout.${value}`)}</option>)}
          </select>
        </label>
        <button
          className="primary"
          disabled={!spaceId}
          onDoubleClick={(e) => e.stopPropagation()}
          onClick={() => {
            if (spaceId) useAppStore.getState().addSession({ space_id: spaceId, title: nextTitle(sessions) });
          }}
        >
          {t("layout.new")}
        </button>
      </div>

      {mode === "list" && inSpace.length > 0 && (
        <div className="session-overview" aria-label={t("layout.list")}>
          {inSpace.map((s) => (
            <OverviewRow
              key={s.id}
              session={s}
              isSelected={s.id === selected}
              onOpenSettings={onOpenSettings}
              onDoubleClick={() => toggleLayoutMaximize(s.id)}
              onContextMenu={(e, items) => {
                e.preventDefault();
                setContextMenu({ x: e.clientX, y: e.clientY, items });
              }}
            />
          ))}
        </div>
      )}

      {inSpace.length === 0 && (
        <div className="workspace-empty" role="status">
          <div className="empty-terminal-icon" aria-hidden="true">
            <svg width="36" height="36" viewBox="0 0 32 32" fill="none">
              <path d="m7 9 7 7-7 7M18 23h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span className="empty-eyebrow">{space?.name ?? "Multishell"}</span>
          <h2>{t(spaceId ? "home.emptyTitle" : "home.noSpacesTitle")}</h2>
          <p>{t(spaceId ? "home.emptyDescription" : "home.noSpacesDescription")}</p>
          <button
            className="primary empty-create"
            onClick={() => {
              if (spaceId) useAppStore.getState().addSession({ space_id: spaceId, title: nextTitle(sessions) });
              else onOpenSettings?.("spaces");
            }}
          >
            {t(spaceId ? "home.createTerminal" : "home.configureSpaces")}
          </button>
          {spaceId && (
            <span className="empty-shortcut">
              <kbd>{typeof navigator !== "undefined" && navigator.platform.toLowerCase().includes("mac") ? "⌘" : "Ctrl"}</kbd> + <kbd>T</kbd>
              <span>{t("home.shortcutHint")}</span>
            </span>
          )}
        </div>
      )}

      <div className={`terminals workspace-terminals layout-${mode}${inSpace.length === 0 ? " empty" : ""}`} data-testid="workspace-terminals">
        {sessions.map((s) => (
          <WorkspaceTerminalTile
            key={s.id}
            session={s}
            spaceId={spaceId}
            isSelected={s.id === selected}
            isTiled={tiled}
            inSpaceCount={inSpace.length}
            onOpenSettings={onOpenSettings}
            onToggleMaximize={() => toggleLayoutMaximize(s.id)}
            onContextMenu={(e, items) => {
              e.preventDefault();
              setContextMenu({ x: e.clientX, y: e.clientY, items });
            }}
          />
        ))}
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}
    </section>
  );
}

function OverviewRow({
  session,
  isSelected,
  onOpenSettings,
  onDoubleClick,
  onContextMenu,
}: {
  session: Session;
  isSelected: boolean;
  onOpenSettings?: (tab?: "providers" | "spaces" | "terminal") => void;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent, items: MenuItem[]) => void;
}) {
  const { t } = useTranslation("session");
  const items = useSessionMenuItems({ session, onOpenSettings });

  return (
    <div
      className={`overview-row${isSelected ? " selected" : ""}`}
      onContextMenu={(e) => onContextMenu(e, items)}
      onDoubleClick={onDoubleClick}
    >
      <SessionDragHandle session={session} compact />
      <button
        aria-label={t("layout.select", { title: session.title })}
        aria-pressed={isSelected}
        onClick={() => useAppStore.getState().selectSession(session.id)}
      >
        <span>{session.title}</span>
        <span className="overview-cwd">{session.cwd || "—"}</span>
        <span>{session.detached ? t("detached.detachedHere") : session.harness_running ? t("sidebar.harnessRunning") : t("layout.shell")}</span>
      </button>
    </div>
  );
}

function WorkspaceTerminalTile({
  session,
  spaceId,
  isSelected,
  isTiled,
  inSpaceCount,
  onOpenSettings,
  onToggleMaximize,
  onContextMenu,
}: {
  session: Session;
  spaceId: string | null | undefined;
  isSelected: boolean;
  isTiled: boolean;
  inSpaceCount: number;
  onOpenSettings?: (tab?: "providers" | "spaces" | "terminal") => void;
  onToggleMaximize: () => void;
  onContextMenu: (e: React.MouseEvent, items: MenuItem[]) => void;
}) {
  const { t } = useTranslation("session");
  const sessionItems = useSessionMenuItems({ session, onOpenSettings });

  return (
    <article
      className={`terminal-host terminal-tile${isSelected ? " active" : ""}`}
      hidden={session.space_id !== spaceId || (!isTiled && !isSelected)}
      aria-label={session.title}
      onPointerDown={() => { if (!isSelected) useAppStore.getState().selectSession(session.id); }}
      onFocusCapture={() => { if (!isSelected) useAppStore.getState().selectSession(session.id); }}
    >
      <header
        className="terminal-tile-header"
        onContextMenu={(e) => onContextMenu(e, sessionItems)}
        onDoubleClick={onToggleMaximize}
      >
        <SessionDragHandle session={session} />
        {isTiled ? (
          <button
            type="button"
            className="icon"
            aria-label={t("layout.focus", { title: session.title })}
            title={t("layout.focus", { title: session.title })}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              useAppStore.getState().selectSession(session.id);
              void useAppStore.getState().setSpaceLayout(session.space_id, "single");
            }}
          >
            ⛶
          </button>
        ) : inSpaceCount > 1 ? (
          <button
            type="button"
            className="icon"
            aria-label={t("layout.restore", { title: session.title })}
            title={t("layout.restore", { title: session.title })}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              void useAppStore.getState().setSpaceLayout(session.space_id, "grid");
            }}
          >
            ❐
          </button>
        ) : null}
        <button
          type="button"
          className="icon terminal-tile-close"
          aria-label={t("layout.close", { title: session.title })}
          title={t("layout.close", { title: session.title })}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            useAppStore.getState().removeSession(session.id);
          }}
        >
          ✕
        </button>
      </header>
      <div className="terminal-tile-body">
        {session.detached ? (
          <div className="detached-panel">
            <span>{t("detached.detachedHere")}</span>
            <button onClick={() => void useAppStore.getState().reattachSession(session.id)}>
              {t("detached.bringBack")}
            </button>
          </div>
        ) : (
          <Terminal session={session} onOpenSettings={onOpenSettings} />
        )}
      </div>
    </article>
  );
}

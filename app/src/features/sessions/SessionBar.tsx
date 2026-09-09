import { SessionDragHandle } from "./SessionDragHandle";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api";
import { ContextMenu } from "../../components/ContextMenu";
import { useAppStore } from "../../store";
import { pty } from "../terminal/pty";
import type { Session } from "../../types";
import { useSessionMenuItems } from "./useSessionMenuItems";

export function SessionBar({
  session,
  detachedWindow = false,
  onOpenSettings,
}: {
  session: Session;
  detachedWindow?: boolean;
  onOpenSettings?: (tab?: "providers" | "spaces" | "terminal") => void;
}) {
  const { t } = useTranslation("session");
  const spaces = useAppStore((s) => s.spaces);
  const providers = useAppStore((s) => s.providers);
  const layouts = useAppStore((s) => s.spaceLayouts);
  const setSpaceLayout = useAppStore((s) => s.setSpaceLayout);
  const harnessRunning = session.harness_running;
  const updateSession = useAppStore((s) => s.updateSession);
  const restartSession = useAppStore((s) => s.restartSession);
  const removeSession = useAppStore((s) => s.removeSession);
  const markHarnessStarted = useAppStore((s) => s.markHarnessStarted);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const provider = providers.find((p) => p.id === session.provider_id);
  const sessionItems = useSessionMenuItems({ session, onOpenSettings });

  const start = async () => {
    if (!provider || harnessRunning) return;
    const line = await api.providerCommandLine(provider, session.bypass);
    await pty.write(session.id, line + "\n");
    markHarnessStarted(session.id);
  };

  const toggleMaximize = () => {
    if (detachedWindow) return;
    const current = layouts[session.space_id] || "single";
    const next = current === "single" ? "grid" : "single";
    void setSpaceLayout(session.space_id, next);
  };

  return (
    <div
      className="session-bar"
      onContextMenu={(e) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY });
      }}
      onDoubleClick={toggleMaximize}
    >
      {detachedWindow && <SessionDragHandle session={session} />}
      <select
        aria-label={t("bar.space")}
        title={useAppStore.getState().settings.language === "en" ? "Restart terminal in another space" : "Reiniciar terminal em outro espaço"}
        disabled={detachedWindow}
        value={session.space_id}
        onChange={(e) => restartSession(session.id, { space_id: e.target.value })}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        {spaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <select
        aria-label={t("bar.provider")}
        disabled={harnessRunning}
        value={session.provider_id ?? ""}
        onChange={(e) => updateSession(session.id, { provider_id: e.target.value || null })}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <option value="">{t("bar.noProvider")}</option>
        {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <button
        className={session.bypass ? "bypass on" : "bypass"}
        aria-label={t("bar.bypass")}
        aria-pressed={session.bypass}
        title={harnessRunning ? t("bar.bypassNextStart") : t("bar.bypass")}
        onClick={() => updateSession(session.id, { bypass: !session.bypass })}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        bypass
      </button>
      <button className="primary" disabled={!provider || harnessRunning} onClick={() => void start()} onDoubleClick={(e) => e.stopPropagation()}>
        ▶ {t("bar.start")}
      </button>
      <span className="spacer" />
      <button
        onDoubleClick={(e) => e.stopPropagation()}
        onClick={() => void (detachedWindow || session.detached
          ? useAppStore.getState().reattachSession(session.id)
          : useAppStore.getState().detachSession(session.id))}
      >
        {t(detachedWindow ? "detached.reattach" : session.detached ? "detached.bringBack" : "detached.detach")}
      </button>
      <button className="icon" aria-label={t("bar.close")} onClick={() => removeSession(session.id)} onDoubleClick={(e) => e.stopPropagation()}>
        ✕
      </button>
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={sessionItems}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { bridge, type SessionDrag } from "../../bridge";
import { useAppStore } from "../../store";

export function SessionDropOverlay({ detachedSessionId }: { detachedSessionId: string | null }) {
  const { t } = useTranslation("session");
  const [drag, setDrag] = useState<SessionDrag | null>(null);
  const title = useAppStore((s) => s.sessions.find((session) => session.id === drag?.session_id)?.title);
  useEffect(() => bridge().onSessionDrag(setDrag), []);
  if (!drag || (detachedSessionId && detachedSessionId !== drag.session_id)) return null;
  const ready = drag.action !== "none";
  const message = ready ? (drag.action === "detach" ? "drag.releaseOutside" : "drag.releaseInside")
    : drag.detached ? "drag.moveInside" : "drag.moveOutside";
  return <div className={`session-drop-overlay${ready ? " ready" : ""}`} role="status" aria-live="polite">
    <div className="drop-message">
      <span className="drop-symbol" aria-hidden="true">{drag.detached ? "↙" : "↗"}</span>
      <span className="drop-session-title">{title}</span>
      <strong>{t(message)}</strong>
      <span>{t("drag.cancel")}</span>
    </div>
  </div>;
}

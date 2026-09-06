import { useEffect, useRef, useState, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api";
import { useAppStore } from "../../store";
import type { Session } from "../../types";

/** Pointer capture keeps the gesture alive beyond this window. Electron resolves
 * the final cursor position in DIP coordinates; Escape/cancellation never drops. */
export function SessionDragHandle({ session, compact = false }: { session: Session; compact?: boolean }) {
  const { t } = useTranslation("session");
  const gesture = useRef<{ pointer: number; x: number; y: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const previewTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearPreview = () => {
    if (previewTimer.current !== null) {
      clearInterval(previewTimer.current);
      previewTimer.current = null;
      void api.sessionDragPreview(null).catch(() => {});
    }
  };
  const cancel = () => { gesture.current = null; setDragging(false); clearPreview(); };
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") cancel(); };
    window.addEventListener("keydown", escape);
    return () => { window.removeEventListener("keydown", escape); clearPreview(); };
  }, []);

  const finish = async (event: PointerEvent<HTMLButtonElement>) => {
    const start = gesture.current;
    if (!start || start.pointer !== event.pointerId) return;
    suppressClick.current = start.moved;
    cancel();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!start.moved) return;
    try {
      const action = await api.sessionDrop(session.id);
      if (action !== "none") await useAppStore.getState().reloadUiState();
    } catch (e) { setError(String((e as Error).message ?? e)); }
  };

  return <>
    <button
      className={`session-drag-handle${compact ? " compact" : ""}${dragging ? " dragging" : ""}`}
      aria-label={t("drag.handle", { title: session.title })}
      title={t(session.detached ? "drag.into" : "drag.out")}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.stopPropagation();
        suppressClick.current = false;
        setError(null);
        gesture.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const start = gesture.current;
        if (!start || start.pointer !== event.pointerId) return;
        if (Math.hypot(event.clientX - start.x, event.clientY - start.y) >= 8) {
          if (!start.moved) {
            const preview = () => { void api.sessionDragPreview(session.id).catch(() => {}); };
            preview();
            previewTimer.current = setInterval(preview, 80);
          }
          start.moved = true;
          setDragging(true);
        }
      }}
      onPointerUp={(event) => void finish(event)}
      onPointerCancel={cancel}
      onLostPointerCapture={cancel}
      onClick={(event) => { event.stopPropagation(); if (!suppressClick.current) useAppStore.getState().selectSession(session.id); }}
    >
      <span aria-hidden="true">⠿</span>{!compact && <span className="drag-title">{session.title}</span>}
    </button>
    {error && <button className="drag-error" role="alert" onClick={() => setError(null)}>{t("drag.failed")} {error} ×</button>}
  </>;
}

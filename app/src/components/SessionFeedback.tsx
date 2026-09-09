import { useEffect, useRef } from "react";
import { useAppStore } from "../store";
import "./session-feedback.css";

export function SessionFeedback() {
  const confirmation = useAppStore((s) => s.confirmation);
  const notice = useAppStore((s) => s.notice);
  const en = useAppStore((s) => s.settings.language === "en");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (confirmation) dialog.current?.showModal?.();
    else dialog.current?.close?.();
  }, [confirmation]);
  const cancel = () => useAppStore.setState({ confirmation: null });
  return <>
    <dialog ref={dialog} className="session-dialog" onCancel={cancel} aria-labelledby="session-confirm-title">
      {confirmation && <>
        <h2 id="session-confirm-title">{en ? "Interrupt running agent?" : "Interromper agente em execução?"}</h2>
        <p>{confirmation.message}</p>
        <div className="session-dialog-actions">
          <button autoFocus onClick={cancel}>{en ? "Keep working" : "Continuar trabalhando"}</button>
          <button className="danger" onClick={confirmation.action}>{en ? "Confirm interruption" : "Confirmar interrupção"}</button>
        </div>
      </>}
    </dialog>
    {notice && <div className="session-notice" role="status">
      <span>{notice.message}</span>
      {notice.retry && <button onClick={() => { useAppStore.setState({ notice: null }); notice.retry?.(); }}>{en ? "Retry" : "Tentar novamente"}</button>}
      <button aria-label={en ? "Dismiss" : "Dispensar"} onClick={() => useAppStore.setState({ notice: null })}>✕</button>
    </div>}
  </>;
}

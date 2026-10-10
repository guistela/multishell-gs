import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type UpdateInfo } from "../../api";

/** Consulta o GitHub ao abrir e a cada 6 h. */
export const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

/** Aviso de nova versão na barra de status. Baixar abre o instalador no navegador. */
export function UpdateNotice() {
  const { t } = useTranslation("common");
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const notified = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      const next = await api.updateCheck().catch(() => null);
      if (!alive) return;
      setInfo(next ?? null);
      if (next && notified.current !== next.version) {
        notified.current = next.version;
        notify(t("update.notifyTitle", { version: next.version }), t("update.notifyBody"));
      }
    };
    void check();
    const timer = setInterval(() => void check(), CHECK_EVERY_MS);
    return () => { alive = false; clearInterval(timer); };
  }, [t]);

  if (!info) return null;
  return (
    <span className="status-item status-update" data-testid="update-notice">
      {t("update.available", { version: info.version })}
      <button type="button" className="status-link" onClick={() => void api.updateOpen(info.download_url)}>{t("update.download")}</button>
      <button
        type="button"
        className="status-link"
        onClick={() => { void api.updateIgnore(info.version); setInfo(null); }}
      >
        {t("update.ignore")}
      </button>
    </span>
  );
}

/** Notificação do sistema. Sem permissão ou sem API, fica só o aviso na barra. */
function notify(title: string, body: string) {
  if (typeof Notification === "undefined" || Notification.permission === "denied") return;
  try {
    new Notification(title, { body });
  } catch {
    // Alguns ambientes bloqueiam o construtor. O aviso na barra basta.
  }
}

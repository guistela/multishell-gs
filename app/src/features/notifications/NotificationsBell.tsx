// O sino da barra de título. O número é o que eu perdi mais o que me espera.
import { useTranslation } from "react-i18next";
import { useAppStore } from "../../store";

/** Acima de 99 o número não cabe no sino. */
function rotulo(total: number): string {
  return total > 99 ? "99+" : String(total);
}

export function NotificationsBell() {
  const { t } = useTranslation("notifications");
  const counts = useAppStore((s) => s.notifyCounts);
  const open = useAppStore((s) => s.notificationsOpen);
  const setOpen = useAppStore((s) => s.setNotificationsOpen);

  // Pergunta esperando é mais urgente que novidade: o sino muda de cor.
  const classe = ["titlebar-bell", counts.pending > 0 ? "has-pending" : "", open ? "is-open" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={classe}
      data-testid="notify-bell"
      aria-label={counts.total > 0 ? t("bellWith", { count: counts.total }) : t("bell")}
      title={counts.total > 0 ? t("bellWith", { count: counts.total }) : t("bell")}
      aria-expanded={open}
      onClick={() => void setOpen(!open)}
    >
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M8 2a3.5 3.5 0 0 0-3.5 3.5c0 2.5-1 3.5-1 3.5h9s-1-1-1-3.5A3.5 3.5 0 0 0 8 2Z"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <path d="M6.6 11.5a1.5 1.5 0 0 0 2.8 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
      {counts.total > 0 && (
        <span className="notify-badge" data-testid="notify-badge">
          {rotulo(counts.total)}
        </span>
      )}
    </button>
  );
}

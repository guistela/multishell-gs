// O painel dos avisos dos agentes.
//
// Pergunta pendente vem primeiro: é o que me trava. Aviso comum fica embaixo,
// da mais nova para a mais velha.
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../../store";
import type { AgentNotification } from "../../types";
import "./notifications.css";

/** Pergunta que ainda espera por mim. */
function pendente(n: AgentNotification): boolean {
  return n.ask !== null && n.answer === undefined;
}

/** Pendentes no topo. Dentro de cada grupo, a ordem que veio do main. */
export function ordenar(items: AgentNotification[]): AgentNotification[] {
  return [...items.filter(pendente), ...items.filter((n) => !pendente(n))];
}

function Horario({ iso }: { iso: string }) {
  const d = new Date(iso);
  const texto = Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return <time dateTime={iso}>{texto}</time>;
}

/** Campo de resposta livre. Estado local: cada pergunta tem o seu. */
function CampoResposta({ id, placeholder }: { id: string; placeholder: string }) {
  const { t } = useTranslation("notifications");
  const [texto, setTexto] = useState("");
  const responder = useAppStore((s) => s.answerNotification);

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    // Resposta em branco não vai: o agente ficaria sem saber o que fazer.
    if (!texto.trim()) return;
    void responder(id, texto.trim());
  };

  return (
    <form className="notify-answer" onSubmit={enviar}>
      <input
        value={texto}
        placeholder={placeholder}
        aria-label={t("answerPlaceholder")}
        onChange={(e) => setTexto(e.target.value)}
      />
      <button type="submit" className="notify-send">{t("answer")}</button>
    </form>
  );
}

function Item({ n }: { n: AgentNotification }) {
  const { t } = useTranslation("notifications");
  const sessao = useAppStore((s) => s.sessions.find((x) => x.id === n.session_id));
  const responder = useAppStore((s) => s.answerNotification);
  const dispensar = useAppStore((s) => s.dismissNotification);
  const esperando = pendente(n);

  const irParaSessao = () => {
    if (!sessao) return;
    useAppStore.getState().selectSession(sessao.id);
    void useAppStore.getState().setNotificationsOpen(false);
  };

  return (
    <li className={`notify-item level-${n.level} ${esperando ? "is-pending" : ""}`} data-testid={`notify-item-${n.id}`}>
      <div className="notify-head">
        <strong className="notify-title">{n.title}</strong>
        <Horario iso={n.created_at} />
        <button
          type="button"
          className="icon notify-dismiss"
          aria-label={t("dismiss")}
          title={t("dismiss")}
          onClick={() => void dispensar(n.id)}
        >
          ✕
        </button>
      </div>
      {n.body && <p className="notify-body">{n.body}</p>}
      <div className="notify-foot">
        <button
          type="button"
          className="notify-source"
          data-testid={`notify-goto-${n.id}`}
          title={t("goToSession")}
          disabled={!sessao}
          onClick={irParaSessao}
        >
          {sessao ? sessao.title : t("unknownSession")}
        </button>
        {esperando && <span className="notify-pending-tag">{t("pending")}</span>}
        {!esperando && n.ask && n.answer != null && <span className="notify-answered">{n.answer}</span>}
      </div>
      {esperando && (
        <div className="notify-actions">
          {n.ask!.options.map((o) => (
            <button key={o} type="button" className="notify-option" onClick={() => void responder(n.id, o)}>
              {o}
            </button>
          ))}
          {/* Placeholder presente = texto livre vale, mesmo com botão. É assim que
              eu nego uma ferramenta dizendo o que fazer em vez dela. */}
          {(n.ask!.options.length === 0 || n.ask!.placeholder) && (
            <CampoResposta id={n.id} placeholder={n.ask!.placeholder ?? t("answerPlaceholder")} />
          )}
          <button type="button" className="notify-cancel" onClick={() => void responder(n.id, null)}>
            {t("cancel")}
          </button>
        </div>
      )}
    </li>
  );
}

export function NotificationsPanel() {
  const { t } = useTranslation("notifications");
  const open = useAppStore((s) => s.notificationsOpen);
  const items = useAppStore((s) => s.notifications);
  const setOpen = useAppStore((s) => s.setNotificationsOpen);
  const dispensarTudo = useAppStore((s) => s.dismissAllNotifications);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") void setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (!open) return null;

  return (
    <>
      <div className="notify-backdrop" onClick={() => void setOpen(false)} />
      <section className="notify-panel" data-testid="notify-panel" role="dialog" aria-label={t("title")}>
        <header className="notify-panel-head">
          <strong>{t("title")}</strong>
          {items.length > 0 && (
            <button type="button" className="notify-dismiss-all" data-testid="notify-dismiss-all" onClick={() => void dispensarTudo()}>
              {t("dismissAll")}
            </button>
          )}
        </header>
        {items.length === 0 ? (
          <p className="notify-empty" data-testid="notify-empty">
            {t("empty")}
            <code>{t("emptyHint")}</code>
          </p>
        ) : (
          <ul className="notify-list">
            {ordenar(items).map((n) => <Item key={n.id} n={n} />)}
          </ul>
        )}
      </section>
    </>
  );
}

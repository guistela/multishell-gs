// A janela flutuante das perguntas.
//
// Vive fora do app, sobre as outras janelas, e só enquanto alguma pergunta
// espera resposta. O main abre e fecha ela pela contagem (ver `windows.ts`).
//
// Não é o painel: aqui só entra o que me trava. Aviso comum fica no sino.
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../../store";
import type { AgentNotification } from "../../types";
import { CampoResposta, pendente } from "./NotificationsPanel";
import { watchNotifications } from "./watch";
import "./notifications.css";

function Pergunta({ n }: { n: AgentNotification }) {
  const { t } = useTranslation("notifications");
  const sessao = useAppStore((s) => s.sessions.find((x) => x.id === n.session_id));
  const responder = useAppStore((s) => s.answerNotification);

  return (
    <li className={`floating-ask level-${n.level}`} data-testid={`floating-ask-${n.id}`}>
      <strong className="floating-ask-title">{n.title}</strong>
      <span className="floating-ask-source">{sessao ? sessao.title : t("unknownSession")}</span>
      {n.body && <p className="notify-body">{n.body}</p>}
      <div className="notify-actions">
        {n.ask!.options.map((o) => (
          <button key={o} type="button" className="notify-option" onClick={() => void responder(n.id, o)}>
            {o}
          </button>
        ))}
        {(n.ask!.options.length === 0 || n.ask!.placeholder) && (
          <CampoResposta id={n.id} placeholder={n.ask!.placeholder ?? t("answerPlaceholder")} />
        )}
        <button type="button" className="notify-cancel" onClick={() => void responder(n.id, null)}>
          {t("cancel")}
        </button>
      </div>
    </li>
  );
}

export function FloatingAsks() {
  const { t } = useTranslation("notifications");
  const items = useAppStore((s) => s.notifications);

  useEffect(() => {
    // `true`: esta janela não tem painel para abrir, a lista é tudo que ela mostra.
    const off = watchNotifications(true);
    void useAppStore.getState().loadNotifications();
    // Só para saber o nome do terminal que perguntou. Leitura, nada mais.
    void useAppStore.getState().reloadUiState();
    return off;
  }, []);

  const perguntas = items.filter(pendente);

  return (
    <div className="floating-asks">
      {/* Sem moldura, o arraste é daqui. `no-drag` em tudo que é clicável. */}
      <header className="floating-asks-head drag" data-testid="floating-asks-head">
        <span className="floating-asks-label">{t("floatingTitle")}</span>
        <span className="floating-asks-count" data-testid="floating-asks-count">{perguntas.length}</span>
      </header>
      {perguntas.length === 0 ? (
        <p className="floating-asks-empty" data-testid="floating-asks-empty">{t("floatingEmpty")}</p>
      ) : (
        <ul className="floating-asks-list">
          {perguntas.map((n) => <Pergunta key={n.id} n={n} />)}
        </ul>
      )}
    </div>
  );
}

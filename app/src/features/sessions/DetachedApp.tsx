import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../../store";
import { Terminal } from "../terminal/Terminal";
import { SessionBar } from "./SessionBar";

/**
 * Raiz da janela destacada (`#/detached/<id>`): só a barra da sessão, o terminal
 * e "Devolver ao espaço". Sem sidebar, sem settings. O PTY vive no main; o
 * Terminal daqui só se anexa (pty_spawn idempotente → replay).
 */
export function DetachedApp({ sessionId }: { sessionId: string }) {
  const { t } = useTranslation("session");
  const loaded = useAppStore((s) => s.loaded);
  const loadError = useAppStore((s) => s.loadError);
  const session = useAppStore((s) => s.sessions.find((x) => x.id === sessionId));
  const reattachSession = useAppStore((s) => s.reattachSession);
  const title = session?.title;

  useEffect(() => { void useAppStore.getState().load(); }, []);
  useEffect(() => { if (title) document.title = title; }, [title]);

  if (!loaded) return null;
  if (loadError) return <pre style={{ padding: 16, color: "#ff6b6b", whiteSpace: "pre-wrap" }}>{loadError}</pre>;

  if (!session) {
    return (
      <div className="detached-missing" role="status">
        <span>{t("detached.sessionMissing")}</span>
        <button className="primary" onClick={() => void reattachSession(sessionId)}>{t("detached.reattach")}</button>
      </div>
    );
  }

  return (
    <div className="app detached">
      <main>
        <SessionBar session={session} detachedWindow />
        <div className="terminals">
          <div className="terminal-host">
            <Terminal session={session} />
          </div>
        </div>
      </main>
    </div>
  );
}

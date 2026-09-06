import { useCallback, useEffect, useState } from "react";
import { api, type AuthSessionStatus } from "../../../api";
import { useAppStore } from "../../../store";
import type { Session } from "../../../types";
import { pty } from "../../terminal/pty";

/**
 * Terminal que recebe o comando de login.
 * Login de CLI é comando de shell: num terminal com agente rodando o texto viraria prompt do agente.
 * Por isso só terminais sem harness entram na escolha; o ativo tem preferência.
 */
export function pickLoginTarget(inSpace: Session[], selectedSessionId: string | null): Session | null {
  const livres = inSpace.filter((s) => !s.harness_running);
  return livres.find((s) => s.id === selectedSessionId) ?? livres[0] ?? null;
}

/**
 * Sessões de login das CLIs dentro do espaço.
 * A consulta roda as CLIs de verdade e demora segundos, então só acontece ao abrir,
 * ao trocar de espaço e no botão Atualizar.
 */
export function AccountsTab() {
  const sessions = useAppStore((s) => s.sessions);
  const spaces = useAppStore((s) => s.spaces);
  const selectedSessionId = useAppStore((s) => s.selectedSessionId);
  const selectedSpaceId = useAppStore((s) => s.selectedSpaceId) ?? spaces[0]?.id;
  const space = spaces.find((s) => s.id === selectedSpaceId);
  const inSpace = sessions.filter((s) => s.space_id === selectedSpaceId && !s.detached);

  const [items, setItems] = useState<AuthSessionStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!selectedSpaceId) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      // Sem resposta do main a lista fica vazia, nunca undefined.
      setItems((await api.authSessions(selectedSpaceId)) ?? []);
    } catch (err: any) {
      setItems([]);
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }, [selectedSpaceId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const ativas = items.filter((i) => i.installed && i.logged_in);
  const semSessao = items.filter((i) => i.installed && !i.logged_in);
  const naoInstaladas = items.filter((i) => !i.installed);

  /** Digita o comando no terminal escolhido e foca aquele terminal. */
  const runInTerminal = async (command: string, cliName: string) => {
    setError(null);
    setMessage(null);
    if (inSpace.length === 0) {
      setError("Este espaço não tem nenhum terminal aberto. Abra um terminal para entrar ou sair das CLIs.");
      return;
    }
    const target = pickLoginTarget(inSpace, selectedSessionId);
    if (!target) {
      setError("Todos os terminais deste espaço estão com um agente rodando. Abra um terminal comum: num agente o comando viraria texto do prompt.");
      return;
    }
    await pty.write(target.id, command + "\n").catch(() => {});
    useAppStore.getState().selectSession(target.id);
    setMessage(`Comando de ${cliName} enviado para "${target.title}". Continue no terminal.`);
  };

  const entrar = (item: AuthSessionStatus) => void runInTerminal(item.login_command, item.name);

  const sair = (item: AuthSessionStatus) => {
    if (!item.logout_command) return;
    // Sair desloga de verdade dentro do espaço: confirma antes.
    if (!window.confirm(`Sair de ${item.name} no espaço ${space?.name ?? "atual"}? O comando "${item.logout_command}" vai rodar no terminal.`)) return;
    void runInTerminal(item.logout_command, item.name);
  };

  return (
    <div className="accounts-view">
      <div className="accounts-bar">
        <span className="accounts-bar-label">
          Contas do espaço {space?.name ?? "—"} • {ativas.length} com sessão ativa
        </span>
        <button type="button" className="accounts-refresh" onClick={() => void reload()} disabled={loading || !selectedSpaceId}>
          {loading ? "Consultando…" : "Atualizar"}
        </button>
      </div>

      <p className="accounts-hint" data-testid="accounts-scope-hint">
        Os logins são por espaço: cada espaço tem HOME próprio. O mesmo <code>gh</code> pode estar em contas
        diferentes em espaços diferentes.
      </p>

      {inSpace.length === 0 && (
        <p className="accounts-hint warn" data-testid="accounts-no-terminal">
          Abra um terminal neste espaço para entrar ou sair das CLIs. Os comandos são digitados num terminal.
        </p>
      )}

      {error && <div className="feedback-msg error" role="alert">{error}</div>}
      {message && <div className="feedback-msg" role="status">{message}</div>}

      {loading && (
        <div className="accounts-loading" data-testid="accounts-loading" role="status">
          Consultando as CLIs do espaço… isso leva alguns segundos.
        </div>
      )}

      {!loading && items.length === 0 && !error && (
        <div className="accounts-empty" data-testid="accounts-empty" role="status">
          Nenhuma CLI conhecida foi verificada neste espaço.
        </div>
      )}

      {!loading && ativas.length > 0 && (
        <section className="accounts-section" data-testid="accounts-active">
          <h4 className="accounts-section-title">Sessões ativas</h4>
          {ativas.map((item) => (
            <AccountRow key={item.id} item={item} onEnter={entrar} onExit={sair} />
          ))}
        </section>
      )}

      {!loading && semSessao.length > 0 && (
        <section className="accounts-section" data-testid="accounts-logged-out">
          <h4 className="accounts-section-title">Sem sessão neste espaço</h4>
          {semSessao.map((item) => (
            <AccountRow key={item.id} item={item} onEnter={entrar} onExit={sair} />
          ))}
        </section>
      )}

      {!loading && naoInstaladas.length > 0 && (
        <section className="accounts-section muted" data-testid="accounts-missing">
          <h4 className="accounts-section-title">Não instaladas neste espaço</h4>
          <ul className="accounts-missing-list">
            {naoInstaladas.map((item) => (
              <li key={item.id} className="account-missing" data-testid={`account-row-${item.id}`}>
                <span className="account-name">{item.name}</span>
                <span className="account-missing-note">fora do PATH deste espaço</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function AccountRow({
  item,
  onEnter,
  onExit,
}: {
  item: AuthSessionStatus;
  onEnter: (item: AuthSessionStatus) => void;
  onExit: (item: AuthSessionStatus) => void;
}) {
  return (
    <div className={`account-row ${item.logged_in ? "active" : ""}`} data-testid={`account-row-${item.id}`}>
      <span className={`account-dot ${item.logged_in ? "on" : "off"}`} aria-hidden="true" />
      <div className="account-info">
        <span className="account-name">{item.name}</span>
        <span className="account-meta">
          {/* account null não vira placeholder: sem identidade, nada aparece. */}
          {item.account && (
            <span className="account-identity" data-testid={`account-identity-${item.id}`}>{item.account}</span>
          )}
          {item.detail && (
            <span className="account-detail" data-testid={`account-detail-${item.id}`}>{item.detail}</span>
          )}
          {!item.logged_in && <span className="account-detail">sem sessão</span>}
        </span>
      </div>
      <div className="account-actions">
        {!item.logged_in && (
          <button
            type="button"
            className="account-login"
            aria-label={`Entrar em ${item.name}`}
            title={`Digita "${item.login_command}" no terminal do espaço`}
            onClick={() => onEnter(item)}
          >
            Entrar
          </button>
        )}
        {item.logged_in && item.logout_command && (
          <button
            type="button"
            className="account-logout"
            aria-label={`Sair de ${item.name}`}
            title={`Digita "${item.logout_command}" no terminal do espaço`}
            onClick={() => onExit(item)}
          >
            Sair
          </button>
        )}
      </div>
    </div>
  );
}

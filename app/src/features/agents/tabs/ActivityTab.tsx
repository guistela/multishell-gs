import { useEffect, useState } from "react";
import { api, type SessionMetrics } from "../../../api";
import { useAppStore } from "../../../store";

/** Bytes em unidade legível. Sem casas decimais além de uma: é telemetria, não contabilidade. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = value >= 10 || Number.isInteger(value) ? Math.round(value) : Number(value.toFixed(1));
  return `${rounded} ${units[unit]}`;
}

/** Tempo decorrido desde o início da sessão, em passo grosso. */
export function formatUptime(startedAt: string): string {
  const ms = Date.now() - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const min = Math.floor(ms / 60000);
  if (min < 1) return "menos de 1 min";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h} h ${min % 60} min`;
}

const REFRESH_MS = 5000;
/** Acima disso o terminal vira suspeito de estar pesando no app. */
export const HEAVY_MEMORY_BYTES = 1024 * 1024 * 1024;

/**
 * Atividade real das sessões vivas: bytes trafegados e tempo de vida.
 * Não existe contagem de tokens — os CLIs não expõem isso pelo PTY, e estimar seria inventar.
 */
export function ActivityTab() {
  const sessions = useAppStore((s) => s.sessions);
  const spaces = useAppStore((s) => s.spaces);
  const selectedSpaceId = useAppStore((s) => s.selectedSpaceId) ?? spaces[0]?.id;
  const [metrics, setMetrics] = useState<SessionMetrics[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const data = await api.sessionMetrics();
        if (active) {
          setMetrics(data);
          setError(null);
        }
      } catch (err: any) {
        if (active) setError(err?.message || String(err));
      }
    };
    void load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const inSpace = sessions.filter((s) => s.space_id === selectedSpaceId);
  const rows = inSpace
    .map((session) => ({ session, metric: metrics.find((m) => m.session_id === session.id) }))
    .filter((r) => r.metric);

  const totalIn = rows.reduce((sum, r) => sum + (r.metric?.bytes_in ?? 0), 0);
  const totalOut = rows.reduce((sum, r) => sum + (r.metric?.bytes_out ?? 0), 0);
  const totalMemory = rows.reduce((sum, r) => sum + (r.metric?.memory_bytes ?? 0), 0);
  const heavyCount = rows.filter((r) => (r.metric?.memory_bytes ?? 0) >= HEAVY_MEMORY_BYTES).length;

  return (
    <div className="activity-view">
      {error && <div className="feedback-msg error" role="alert">{error}</div>}

      <div className="metric-cards">
        <div className="metric-card">
          <span className="label">Terminais vivos no espaço</span>
          <span className="value">{rows.length}</span>
          <span className="sub">de {inSpace.length} abertos • {spaces.length} espaços</span>
        </div>
        <div className="metric-card" data-testid="metric-memory">
          <span className="label">Memória dos terminais</span>
          <span className={`value ${heavyCount > 0 ? "warn" : ""}`}>{totalMemory > 0 ? formatBytes(totalMemory) : "—"}</span>
          <span className="sub">
            {heavyCount > 0 ? `${heavyCount} acima de ${formatBytes(HEAVY_MEMORY_BYTES)}` : "shell mais a árvore de filhos"}
          </span>
        </div>
        <div className="metric-card">
          <span className="label">Recebido dos processos</span>
          <span className="value">{formatBytes(totalOut)}</span>
          <span className="sub">saída dos agentes e shells</span>
        </div>
        <div className="metric-card">
          <span className="label">Enviado aos processos</span>
          <span className="value">{formatBytes(totalIn)}</span>
          <span className="sub">digitação, colagens e handoffs</span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="activity-empty" role="status">
          Nenhum terminal vivo neste espaço. Abra um terminal para ver a atividade.
        </div>
      ) : (
        <table className="activity-table">
          <thead>
            <tr>
              <th>Terminal</th>
              <th>Tempo de vida</th>
              <th>Memória</th>
              <th>Recebido</th>
              <th>Enviado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ session, metric }) => (
              <tr key={session.id} data-testid={`activity-row-${session.id}`}>
                <td>{session.title}</td>
                <td>{formatUptime(metric!.started_at)}</td>
                <td>
                  {metric!.memory_bytes == null ? (
                    "—"
                  ) : (
                    <span className={metric!.memory_bytes >= HEAVY_MEMORY_BYTES ? "mem-heavy" : undefined}>
                      {formatBytes(metric!.memory_bytes)}
                    </span>
                  )}
                </td>
                <td>{formatBytes(metric!.bytes_out)}</td>
                <td>{formatBytes(metric!.bytes_in)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

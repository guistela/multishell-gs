import { useCallback, useEffect, useState } from "react";
import { api, type SnapshotMeta } from "../../../api";
import { useAppStore } from "../../../store";

/** Data do snapshot no formato local, curto. */
function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/**
 * Pontos de restauração dos arquivos modificados do repositório do terminal ativo.
 * Tudo vem do processo main: o snapshot é gravado em disco, não no estado da tela.
 */
export function SnapshotsTab() {
  const sessions = useAppStore((s) => s.sessions);
  const spaces = useAppStore((s) => s.spaces);
  const selectedSessionId = useAppStore((s) => s.selectedSessionId);
  const selectedSpaceId = useAppStore((s) => s.selectedSpaceId) ?? spaces[0]?.id;

  const inSpace = sessions.filter((s) => s.space_id === selectedSpaceId && !s.detached);
  const activeSession = inSpace.find((s) => s.id === selectedSessionId) ?? inSpace[0];

  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([]);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!selectedSpaceId) return;
    try {
      setSnapshots(await api.snapshotList(selectedSpaceId));
    } catch (err: any) {
      setError(err?.message || String(err));
    }
  }, [selectedSpaceId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  /** O snapshot precisa da pasta do terminal: sem cwd, não há o que capturar. */
  const resolveCwd = async (): Promise<string | null> => {
    if (!activeSession) return null;
    if (activeSession.cwd) return activeSession.cwd;
    try {
      return await api.ptyCwd(activeSession.id);
    } catch {
      return null;
    }
  };

  const create = async () => {
    if (!label.trim() || !selectedSpaceId || busy) return;
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const cwd = await resolveCwd();
      if (!cwd) {
        setError("Nenhum terminal com pasta conhecida neste espaço. Abra um terminal dentro do repositório antes de capturar.");
        return;
      }
      const res = await api.snapshotCreate(selectedSpaceId, label.trim(), cwd);
      setLabel("");
      const extras = [
        res.truncated ? "lista truncada no limite de arquivos" : null,
        res.skipped.length > 0 ? `${res.skipped.length} ignorados` : null,
      ].filter(Boolean);
      setFeedback(`Snapshot "${res.label}" gravado: ${res.fileCount} arquivos${extras.length ? ` (${extras.join(", ")})` : ""}.`);
      await reload();
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const restore = async (snap: SnapshotMeta) => {
    if (busy) return;
    const cwd = await resolveCwd();
    if (!cwd) {
      setError("Nenhum terminal com pasta conhecida neste espaço para restaurar.");
      return;
    }
    const ok = window.confirm(
      `Restaurar "${snap.label}" sobrescreve ${snap.fileCount} arquivos em ${cwd}. As alterações atuais desses arquivos são perdidas. Continuar?`
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const res = await api.snapshotRestore(snap.spaceId, snap.id, cwd);
      setFeedback(`${res.restored} arquivos restaurados em ${res.cwd}.`);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (snap: SnapshotMeta) => {
    if (busy) return;
    if (!window.confirm(`Apagar o snapshot "${snap.label}"?`)) return;
    setBusy(true);
    setError(null);
    try {
      await api.snapshotDelete(snap.spaceId, snap.id);
      await reload();
      setFeedback(`Snapshot "${snap.label}" apagado.`);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="snapshots-view">
      <div className="snapshot-creator">
        <input
          type="text"
          placeholder="Nome do ponto de restauração (ex: Antes de refatorar PTY)..."
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void create();
          }}
        />
        <button type="button" className="primary" disabled={busy || !label.trim()} onClick={() => void create()}>
          Capturar snapshot
        </button>
      </div>

      <p className="snapshot-hint">
        Guarda o conteúdo dos arquivos modificados e rastreados pelo git na pasta do terminal ativo
        {activeSession?.cwd ? <> (<code>{activeSession.cwd}</code>)</> : null}.
      </p>

      {error && <div className="feedback-msg error" role="alert">{error}</div>}
      {feedback && <div className="feedback-msg" role="status">{feedback}</div>}

      <div className="snapshots-list">
        {snapshots.length === 0 ? (
          <div className="snapshots-empty">Nenhum snapshot gravado neste espaço.</div>
        ) : (
          snapshots.map((s) => (
            <div key={s.id} className="snapshot-row">
              <div>
                <strong>{s.label}</strong>
                <span className="snap-meta">{formatTimestamp(s.timestamp)} • {s.fileCount} arquivos</span>
              </div>
              <div className="snap-actions">
                <button type="button" disabled={busy} onClick={() => void remove(s)}>Apagar</button>
                <button type="button" className="primary" disabled={busy} onClick={() => void restore(s)}>Rollback</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

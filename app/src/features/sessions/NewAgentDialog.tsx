import { useEffect, useRef, useState } from "react";
import { api } from "../../api";
import { useAppStore } from "../../store";
import "../../components/session-feedback.css";

export function NewAgentDialog({ spaceId, onClose }: { spaceId: string; onClose: () => void }) {
  const spaces = useAppStore((s) => s.spaces);
  const providers = useAppStore((s) => s.providers);
  const settings = useAppStore((s) => s.settings);
  const en = settings.language === "en";
  const [targetSpace, setTargetSpace] = useState(spaceId);
  const [providerId, setProviderId] = useState("");
  const [cwd, setCwd] = useState("");
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal?.(); }, []);
  useEffect(() => {
    let saved: { providerId?: string; cwd?: string } = {};
    try { saved = JSON.parse(localStorage.getItem(`multishell.newAgent.${targetSpace}`) || "{}"); } catch { /* optional preferences */ }
    setProviderId(providers.find((p) => p.id === saved?.providerId)?.id ?? providers[0]?.id ?? "");
    const state = useAppStore.getState();
    const current = state.sessions.find((s) => s.id === state.selectedSessionId && s.space_id === targetSpace);
    setCwd(saved?.cwd ?? current?.cwd ?? spaces.find((s) => s.id === targetSpace)?.base_path ?? settings.default_cwd ?? "");
  }, [targetSpace, providers, spaces, settings.default_cwd]);
  return <dialog ref={dialog} className="session-dialog" onCancel={onClose} aria-labelledby="new-agent-title">
    <h2 id="new-agent-title">{en ? "New agent" : "Novo agente"}</h2>
    <form onSubmit={(e) => {
      e.preventDefault();
      const provider = providers.find((p) => p.id === providerId);
      if (!provider || !spaces.some((s) => s.id === targetSpace)) return;
      try { localStorage.setItem(`multishell.newAgent.${targetSpace}`, JSON.stringify({ providerId, cwd: cwd.trim() })); } catch { /* optional preferences */ }
      useAppStore.getState().addSession({ space_id: targetSpace, provider_id: provider.id, cwd: cwd.trim() || null, title: provider.name, bypass: false, auto_start_harness: true });
      useAppStore.getState().setWorkspaceTab("terminals");
      onClose();
    }}>
      <label>{en ? "Space" : "Espaço"}<select autoFocus value={targetSpace} onChange={(e) => setTargetSpace(e.target.value)}>{spaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <label>{en ? "Agent" : "Agente"}<select value={providerId} onChange={(e) => setProviderId(e.target.value)}>{providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label>{en ? "Working folder" : "Pasta de trabalho"}<input value={cwd} onChange={(e) => setCwd(e.target.value)} placeholder={en ? "Space default" : "Padrão do espaço"} /></label>
      <button type="button" onClick={async () => {
        try { const path = await api.pickDirectory(cwd || undefined); if (path) setCwd(path); setError(""); }
        catch { setError(en ? "Could not open folder picker." : "Não foi possível abrir o seletor de pasta."); }
      }}>{en ? "Choose folder…" : "Escolher pasta…"}</button>
      {error && <p role="alert">{error}</p>}
      <div className="session-dialog-actions"><button type="button" onClick={onClose}>{en ? "Cancel" : "Cancelar"}</button><button className="primary" type="submit" disabled={!providerId}>{en ? "Start agent" : "Iniciar agente"}</button></div>
    </form>
  </dialog>;
}

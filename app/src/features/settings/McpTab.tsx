import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type McpServer } from "../../api";
import { useAppStore } from "../../store";
import type { EnvVar } from "../../types";
import KeyValueTable from "./KeyValueTable";

/** Estado de edição: args viram texto (uma linha por argumento) e env vira lista ordenada. */
interface Draft {
  id: string;
  name: string;
  command: string;
  argsText: string;
  env: EnvVar[];
  enabled: boolean;
}

function toDraft(s: McpServer): Draft {
  return {
    id: s.id,
    name: s.name,
    command: s.command,
    argsText: s.args.join("\n"),
    env: Object.entries(s.env ?? {}).map(([key, value]) => ({ key, value, is_secret: false })),
    enabled: s.enabled,
  };
}

function toServer(d: Draft): McpServer {
  // Uma linha = um argumento. Linhas vazias somem; caminho com espaço fica inteiro.
  const args = d.argsText.split("\n").map((a) => a.trim()).filter(Boolean);
  const env: Record<string, string> = {};
  for (const v of d.env) if (v.key.trim()) env[v.key.trim()] = v.value;
  const server: McpServer = { id: d.id, name: d.name.trim(), command: d.command.trim(), args, enabled: d.enabled };
  if (Object.keys(env).length > 0) server.env = env;
  return server;
}

function newDraft(): Draft {
  return { id: crypto.randomUUID(), name: "", command: "", argsText: "", env: [], enabled: true };
}

export default function McpTab() {
  const { t } = useTranslation("settings");
  const spaces = useAppStore((s) => s.spaces);
  const selectedSpaceId = useAppStore((s) => s.selectedSpaceId);
  const [spaceId, setSpaceId] = useState<string | null>(selectedSpaceId ?? spaces[0]?.id ?? null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [saved, setSaved] = useState<{ path: string; enabled: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Recarrega sempre que o espaço muda: a lista é por espaço.
  useEffect(() => {
    if (!spaceId) return;
    let alive = true;
    setSaved(null);
    setError(null);
    api
      .mcpList(spaceId)
      .then((list) => { if (alive) setDrafts(list.map(toDraft)); })
      .catch((e) => { if (alive) setError(String((e as Error).message ?? e)); });
    return () => { alive = false; };
  }, [spaceId]);

  const patch = useCallback((id: string, p: Partial<Draft>) => {
    setDrafts((ds) => ds.map((d) => (d.id === id ? { ...d, ...p } : d)));
    setSaved(null);
  }, []);

  const save = async () => {
    if (!spaceId) return;
    setBusy(true); setError(null); setSaved(null);
    try {
      // Nome e comando vazios não travam aqui: o backend recusa e a mensagem dele aparece.
      const result = await api.mcpSave(spaceId, drafts.map(toServer));
      setSaved(result);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  };

  if (!spaceId) return <div className="settings-editor settings-empty">{t("mcp.noSpace")}</div>;

  return (
    <form className="settings-editor" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      {spaces.length > 1 && (
        <label>
          {t("mcp.space")}
          <select value={spaceId} aria-label={t("mcp.space")} onChange={(e) => setSpaceId(e.target.value)}>
            {spaces.map((s) => <option key={s.id} value={s.id}>{s.name || s.directory_name}</option>)}
          </select>
        </label>
      )}

      <p className="settings-hint">{t("mcp.help")}</p>

      {drafts.length === 0 && <p className="settings-empty">{t("mcp.empty")}</p>}

      <ul className="mcp-list">
        {drafts.map((d) => (
          <li key={d.id} className="mcp-server">
            <div className="settings-row">
              <label className="settings-field mcp-grow">
                {t("mcp.name")}
                <input type="text" value={d.name} aria-label={t("mcp.name")} onChange={(e) => patch(d.id, { name: e.target.value })} />
              </label>
              <label className="toggle mcp-enabled">
                <input type="checkbox" checked={d.enabled} aria-label={t("mcp.enabled")} onChange={(e) => patch(d.id, { enabled: e.target.checked })} />
                {t("mcp.enabled")}
              </label>
              <button type="button" className="danger" aria-label={t("mcp.remove", { name: d.name })} onClick={() => { setDrafts((ds) => ds.filter((x) => x.id !== d.id)); setSaved(null); }}>
                ✕
              </button>
            </div>
            <label className="settings-field">
              {t("mcp.command")}
              <input type="text" value={d.command} aria-label={t("mcp.command")} onChange={(e) => patch(d.id, { command: e.target.value })} />
            </label>
            <label className="settings-field">
              {t("mcp.args")}
              <textarea value={d.argsText} aria-label={t("mcp.args")} onChange={(e) => patch(d.id, { argsText: e.target.value })} />
            </label>
            <div className="settings-field">
              {t("mcp.env")}
              <KeyValueTable rows={d.env} onChange={(rows) => patch(d.id, { env: rows })} />
            </div>
          </li>
        ))}
      </ul>

      <div className="settings-row">
        <button type="button" onClick={() => { setDrafts((ds) => [...ds, newDraft()]); setSaved(null); }}>{t("mcp.add")}</button>
      </div>

      <div className="settings-footer">
        {saved && <span className="settings-saved" role="status">✓ {t("mcp.saved", { path: saved.path, count: saved.enabled })}</span>}
        {error && <span className="settings-error" role="alert">✕ {error}</span>}
        <span className="spacer" />
        <button type="submit" className="primary" disabled={busy}>{busy ? "..." : t("mcp.save")}</button>
      </div>
    </form>
  );
}

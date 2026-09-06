import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api";
import { useAppStore } from "../../store";
import type { Provider } from "../../types";
import ProviderEditor from "./ProviderEditor";

export function newProvider(): Provider {
  return { id: crypto.randomUUID(), name: "", executable: "", args: [], bypass_args: [], config_env_key: null, extra_env: [], icon: "", resume_args: [] };
}

export default function ProvidersTab() {
  const { t } = useTranslation("providers");
  const providers = useAppStore((s) => s.providers);
  const saveProvider = useAppStore((s) => s.saveProvider);
  const deleteProvider = useAppStore((s) => s.deleteProvider);
  const [editing, setEditing] = useState<Provider | null>(null);

  const restorePresets = async () => {
    const presets = await api.providerPresets();
    const names = new Set(providers.map((p) => p.name));
    for (const p of presets) if (!names.has(p.name)) await saveProvider(p);
  };

  const remove = async (p: Provider) => {
    if (!window.confirm(t("confirmDelete", { name: p.name }))) return;
    await deleteProvider(p.id);
    if (editing?.id === p.id) setEditing(null);
  };

  return (
    <>
      <aside className="settings-list">
        <ul>
          {providers.length === 0 && <li className="settings-empty">{t("empty")}</li>}
          {providers.map((p) => (
            <li key={p.id} className={editing?.id === p.id ? "selected" : ""} onClick={() => setEditing(p)}>
              {p.icon && <em aria-hidden>{p.icon}</em>}
              <span>{p.name || p.executable}</span>
            </li>
          ))}
        </ul>
        <div className="actions">
          <button type="button" className="primary" onClick={() => setEditing(newProvider())}>{t("add")}</button>
          <button type="button" onClick={() => void restorePresets()}>{t("restorePresets")}</button>
        </div>
      </aside>
      {editing ? (
        <ProviderEditor
          key={editing.id}
          provider={editing}
          onSave={async (p) => { await saveProvider(p); setEditing(p); }}
          onDelete={providers.some((x) => x.id === editing.id) ? () => void remove(editing) : undefined}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <div className="settings-editor settings-empty" />
      )}
    </>
  );
}

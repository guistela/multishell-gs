import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api";
import { useAppStore } from "../../store";
import type { Space } from "../../types";
import SpaceEditor from "./SpaceEditor";

export function newSpace(): Space {
  return {
    id: crypto.randomUUID(), name: "", color_hex: "#4f8cff", directory_name: "", custom_env: [],
    security: { load_user_shell_profile: false, share_keychain: false, share_ssh: false, share_git_config: false, inherit_process_env: false },
    created_at: new Date().toISOString(),
  };
}

export default function SpacesTab({ initialCreate = false }: { initialCreate?: boolean } = {}) {
  const { t } = useTranslation("spaces");
  const spaces = useAppStore((s) => s.spaces);
  const saveSpace = useAppStore((s) => s.saveSpace);
  const deleteSpace = useAppStore((s) => s.deleteSpace);
  const [editing, setEditing] = useState<Space | null>(() => (initialCreate ? newSpace() : null));

  useEffect(() => {
    if (initialCreate) {
      setEditing(newSpace());
    }
  }, [initialCreate]);

  const isNew = (s: Space) => !spaces.some((x) => x.id === s.id);

  const save = async (space: Space) => {
    // Segredos vão para o keyring. No Space persiste só a chave.
    for (const v of space.custom_env) {
      if (v.is_secret && v.key && v.value) await api.secretSet(space.id, v.key, v.value);
    }
    const clean: Space = { ...space, custom_env: space.custom_env.map((v) => (v.is_secret ? { ...v, value: "" } : v)) };
    await saveSpace(clean);
    setEditing(useAppStore.getState().spaces.find((x) => x.id === space.id) ?? clean);
  };

  const remove = async (s: Space) => {
    if (!window.confirm(t("confirmDelete", { name: s.name }))) return;
    await deleteSpace(s.id);
    setEditing(null);
  };

  return (
    <>
      <aside className="settings-list">
        <ul>
          {spaces.length === 0 && <li className="settings-empty">{t("empty")}</li>}
          {spaces.map((s) => (
            <li key={s.id} className={editing?.id === s.id ? "selected" : ""} onClick={() => setEditing(s)}>
              <i aria-hidden style={{ width: 10, height: 10, borderRadius: 5, background: s.color_hex, display: "inline-block" }} />
              <span>{s.name || s.directory_name}</span>
            </li>
          ))}
        </ul>
        <div className="actions">
          <button type="button" className="primary" onClick={() => setEditing(newSpace())}>{t("add")}</button>
        </div>
      </aside>
      {editing ? (
        <SpaceEditor
          key={editing.id}
          space={editing}
          isNew={isNew(editing)}
          onSave={save}
          onDelete={isNew(editing) ? undefined : () => void remove(editing)}
          onOpenFolder={isNew(editing) ? undefined : () => void api.spaceOpenFolder(editing.id)}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <div className="settings-editor settings-empty" />
      )}
    </>
  );
}

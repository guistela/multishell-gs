import { api } from "../../api";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Space, SpaceSecurity } from "../../types";
import KeyValueTable from "../settings/KeyValueTable";
import { bridge, hasBridge } from "../../bridge";

interface Props {
  space: Space;
  isNew: boolean;
  onSave: (s: Space) => Promise<void> | void;
  onDelete?: () => void;
  onOpenFolder?: () => void;
  onCancel: () => void;
}

const SECURITY_KEYS: (keyof SpaceSecurity)[] = [
  "load_user_shell_profile", "share_keychain", "share_ssh", "share_git_config", "inherit_process_env",
  "block_destructive_commands",
];
const SHARE_KEYS: (keyof SpaceSecurity)[] = ["share_keychain", "share_ssh", "share_git_config", "inherit_process_env", "load_user_shell_profile"];

/** Plataforma vem da bridge; sem bridge (ex.: preview no browser) cai no userAgent. */
export const isWindows = () =>
  hasBridge() ? bridge().platform === "win32" : typeof navigator !== "undefined" && navigator.userAgent.includes("Windows");

export default function SpaceEditor({ space, isNew, onSave, onDelete, onOpenFolder, onCancel }: Props) {
  const { t } = useTranslation("spaces");
  const [draft, setDraft] = useState<Space>(space);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const chooseFolder = async () => {
    setError(null);
    try {
      const selected = await api.pickDirectory(draft.base_path ?? undefined);
      if (selected !== null) patch({ base_path: selected });
    } catch (e) { setError(String((e as Error).message ?? e)); }
  };
  const save = async () => {
    setBusy(true); setError(null); setSaved(false);
    try {
      await onSave({ ...draft, base_path: draft.base_path?.trim() || null });
      setSaved(true);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  };
  const patch = (p: Partial<Space>) => {
    setDraft((d) => ({ ...d, ...p }));
    setSaved(false);
    setError(null);
  };
  const setSec = (k: keyof SpaceSecurity, v: boolean) => {
    setDraft((d) => ({ ...d, security: { ...d.security, [k]: v } }));
    setSaved(false);
    setError(null);
  };

  const keys = isWindows() ? SECURITY_KEYS.filter((k) => k !== "share_keychain") : SECURITY_KEYS;
  const shares = SHARE_KEYS.some((k) => draft.security[k]);
  const canSave = draft.name.trim() !== "";

  return (
    <form className="settings-editor" onSubmit={(e) => { e.preventDefault(); if (canSave && !busy) void save(); }}>
      <div className="settings-row">
        <label style={{ flex: 1 }}>
          {t("fields.name")}
          <input type="text" value={draft.name} onChange={(e) => patch({ name: e.target.value })} />
        </label>
        <label>
          {t("fields.color")}
          <input type="color" value={draft.color_hex} onChange={(e) => patch({ color_hex: e.target.value })} />
        </label>
      </div>
      <label>
        {t("fields.directory")}
        <input type="text" readOnly value={isNew ? "" : draft.directory_name} placeholder={isNew ? t("fields.directoryGenerated") : undefined} />
      </label>
      <div className="settings-field">
        <label htmlFor="space-base-path">{t("fields.basePath")}</label>
        <div className="path-picker">
          <input id="space-base-path" type="text" value={draft.base_path ?? ""}
            placeholder={t("fields.basePathPlaceholder")} onChange={(e) => patch({ base_path: e.target.value })} />
          <button type="button" onClick={() => void chooseFolder()}>{t("fields.browse")}</button>
        </div>
        <span className="hint">{t("fields.basePathHint")}</span>
      </div>
      <div className="settings-field">
        {t("fields.env")}
        <KeyValueTable
          rows={draft.custom_env} secrets
          secretLabel={t("fields.secret")} secretPlaceholder={t("fields.secretPlaceholder")}
          onChange={(custom_env) => patch({ custom_env })}
        />
      </div>
      <fieldset className="settings-field" style={{ border: "none", padding: 0, margin: 0, gap: 8 }}>
        <legend style={{ padding: 0 }}>{t("security.title")}</legend>
        {keys.map((k) => (
          <label key={k} className="toggle">
            <input type="checkbox" checked={draft.security[k] === true} onChange={(e) => setSec(k, e.target.checked)} />
            <span>
              {t(`security.${k}`)}
              <br />
              <span className="hint">{t(`security.${k}_hint`)}</span>
            </span>
          </label>
        ))}
        {shares && <div className="settings-warn" role="status">{t("security.warning")}</div>}
      </fieldset>
      <div className="settings-footer">
        {saved && <span className="settings-saved" role="status">✓ {t("saved")}</span>}
        {error && <span className="settings-error" role="alert">✕ {error}</span>}
        <span className="spacer" />
        {onOpenFolder && <button type="button" onClick={onOpenFolder}>{t("openFolder")}</button>}
        {onDelete && <button type="button" className="danger" onClick={onDelete}>{t("delete")}</button>}
        <button type="button" onClick={onCancel}>{t("cancel")}</button>
        <button type="submit" className="primary" disabled={!canSave || busy}>{busy ? "..." : t("save")}</button>
      </div>
    </form>
  );
}

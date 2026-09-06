import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ICON_NAMES, ProviderIcon } from "./ProviderIcon";
import { api } from "../../api";
import type { Provider } from "../../types";
import KeyValueTable from "../settings/KeyValueTable";

interface Props {
  provider: Provider;
  onSave: (p: Provider) => Promise<void> | void;
  onDelete?: () => void;
  onCancel: () => void;
}

const toLines = (a: string[]) => a.join("\n");
const fromLines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

export default function ProviderEditor({ provider, onSave, onDelete, onCancel }: Props) {
  const { t } = useTranslation("providers");
  const [draft, setDraft] = useState<Provider>(provider);
  const [argsText, setArgsText] = useState(toLines(provider.args));
  const [bypassText, setBypassText] = useState(toLines(provider.bypass_args));
  const [resumeText, setResumeText] = useState(toLines(provider.resume_args));
  const [preview, setPreview] = useState<{ off: string; on: string; resume: string }>({ off: "", on: "", resume: "" });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const current: Provider = { ...draft, args: fromLines(argsText), bypass_args: fromLines(bypassText), resume_args: fromLines(resumeText) };
  const previewKey = JSON.stringify([current.executable, current.args, current.bypass_args, current.resume_args]);

  useEffect(() => {
    let alive = true;
    Promise.all([api.providerCommandLine(current, false), api.providerCommandLine(current, true), api.providerResumeLine(current, false)])
      .then(([off, on, resume]) => { if (alive) setPreview({ off, on, resume }); })
      .catch(() => { if (alive) setPreview({ off: "", on: "", resume: "" }); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey]);

  const patch = (p: Partial<Provider>) => {
    setDraft((d) => ({ ...d, ...p }));
    setSaved(false);
    setError(null);
  };
  const canSave = current.name.trim() !== "" && current.executable.trim() !== "";

  const save = async () => {
    setBusy(true); setError(null); setSaved(false);
    try {
      await onSave(current);
      setSaved(true);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="settings-editor" onSubmit={(e) => { e.preventDefault(); if (canSave && !busy) void save(); }}>
      <div className="settings-row">
        <label style={{ flex: 1 }}>
          {t("fields.name")}
          <input type="text" value={draft.name} onChange={(e) => patch({ name: e.target.value })} />
        </label>
        <label style={{ width: 80 }}>
          {t("fields.icon")}
          <div className="provider-icon-picker">
            <span className="provider-icon-preview"><ProviderIcon provider={draft} size={16} /></span>
            <select value={ICON_NAMES.includes(draft.icon) ? draft.icon : ""} onChange={(e) => patch({ icon: e.target.value })}>
              {!ICON_NAMES.includes(draft.icon) && <option value="">{draft.icon || "personalizado"}</option>}
              {ICON_NAMES.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
            <input
              type="text"
              aria-label={t("fields.icon")}
              value={draft.icon}
              onChange={(e) => patch({ icon: e.target.value })}
            />
          </div>
        </label>
      </div>
      <label>
        {t("fields.executable")}
        <input type="text" value={draft.executable} onChange={(e) => patch({ executable: e.target.value })} />
      </label>
      <label>
        {t("fields.args")}
        <textarea
          value={argsText}
          placeholder={t("list.placeholder")}
          onChange={(e) => { setArgsText(e.target.value); setSaved(false); setError(null); }}
        />
      </label>
      <label>
        {t("fields.bypassArgs")}
        <textarea
          value={bypassText}
          placeholder={t("list.placeholder")}
          onChange={(e) => { setBypassText(e.target.value); setSaved(false); setError(null); }}
        />
      </label>
      <label>
        {t("fields.resumeArgs")}
        <textarea
          value={resumeText}
          placeholder={t("list.placeholder")}
          onChange={(e) => { setResumeText(e.target.value); setSaved(false); setError(null); }}
        />
        <span className="settings-hint">{t("fields.resumeArgsHint")}</span>
      </label>
      <label>
        {t("fields.configEnvKey")}
        <input type="text" value={draft.config_env_key ?? ""} onChange={(e) => patch({ config_env_key: e.target.value.trim() || null })} />
        <span className="settings-hint">{t("fields.configEnvKeyHint")}</span>
      </label>
      <div className="settings-field">
        {t("fields.extraEnv")}
        <KeyValueTable rows={draft.extra_env} onChange={(extra_env) => patch({ extra_env })} />
      </div>
      <div className="settings-field">
        {t("preview.title")}
        <div className="preview" data-testid="preview">
          <span className="k">{t("preview.bypassOff")}</span><code>{preview.off}</code>
          <span className="k on">{t("preview.bypassOn")}</span><code>{preview.on}</code>
          <span className="k">{t("preview.resume")}</span><code data-testid="preview-resume">{preview.resume}</code>
        </div>
      </div>
      <div className="settings-footer">
        {saved && <span className="settings-saved" role="status">✓ {t("saved")}</span>}
        {error && <span className="settings-error" role="alert">✕ {error}</span>}
        <span className="spacer" />
        {onDelete && <button type="button" className="danger" onClick={onDelete}>{t("delete")}</button>}
        <button type="button" onClick={onCancel}>{t("cancel")}</button>
        <button type="submit" className="primary" disabled={!canSave || busy}>{busy ? "..." : t("save")}</button>
      </div>
    </form>
  );
}

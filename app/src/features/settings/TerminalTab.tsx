import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../../store";
import { setLanguage, SUPPORTED_LANGUAGES, type Language } from "../../i18n";
import type { TerminalSettings } from "../../types";

export const FONT_MIN = 10;
export const FONT_MAX = 20;

export default function TerminalTab() {
  const { t } = useTranslation("settings");
  const settings = useAppStore((s) => s.settings);
  const saveSettings = useAppStore((s) => s.saveSettings);
  const [draft, setDraft] = useState<TerminalSettings>(settings);
  const [fontSizeText, setFontSizeText] = useState(String(settings.font_size));
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fontSize = Number(fontSizeText);
  const fontSizeValid = Number.isInteger(fontSize) && fontSize >= FONT_MIN && fontSize <= FONT_MAX;
  const patch = (p: Partial<TerminalSettings>) => {
    setDraft((d) => ({ ...d, ...p }));
    setSaved(false);
    setError(null);
  };

  const save = async () => {
    if (!fontSizeValid) return;
    setBusy(true); setError(null); setSaved(false);
    try {
      const next: TerminalSettings = {
        ...draft,
        shell: draft.shell?.trim() || null,
        default_cwd: draft.default_cwd?.trim() || null,
        font_size: fontSize,
      };
      await saveSettings(next);
      await setLanguage(next.language);
      setSaved(true);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="settings-editor" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <label>
        {t("terminal.shell")}
        <input type="text" value={draft.shell ?? ""} placeholder={t("terminal.shellHint")} onChange={(e) => patch({ shell: e.target.value })} />
      </label>
      <label>
        {t("terminal.defaultCwd")}
        <input type="text" value={draft.default_cwd ?? ""} onChange={(e) => patch({ default_cwd: e.target.value })} />
      </label>
      <label>
        {t("terminal.fontFamily")}
        <input type="text" value={draft.font_family} onChange={(e) => patch({ font_family: e.target.value })} />
      </label>
      <label>
        {t("terminal.fontSize")}
        <input
          type="number" min={FONT_MIN} max={FONT_MAX} value={fontSizeText}
          aria-invalid={!fontSizeValid}
          onChange={(e) => { setFontSizeText(e.target.value); setSaved(false); }}
        />
        {!fontSizeValid && <span className="settings-error" role="alert">{t("terminal.fontSizeError", { min: FONT_MIN, max: FONT_MAX })}</span>}
      </label>
      <label>
        {t("terminal.theme")}
        <select value={draft.theme} onChange={(e) => patch({ theme: e.target.value })}>
          <option value="dark">{t("terminal.themeDark")}</option>
          <option value="light">{t("terminal.themeLight")}</option>
        </select>
      </label>
      <label>
        {t("terminal.language")}
        <select value={draft.language} onChange={(e) => patch({ language: e.target.value as Language })}>
          {SUPPORTED_LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </label>
      <div className="settings-footer">
        {saved && <span className="settings-saved" role="status">✓ {t("terminal.saved")}</span>}
        {error && <span className="settings-error" role="alert">✕ {error}</span>}
        <span className="spacer" />
        <button type="submit" className="primary" disabled={!fontSizeValid || busy}>{busy ? "..." : t("terminal.save")}</button>
      </div>
    </form>
  );
}

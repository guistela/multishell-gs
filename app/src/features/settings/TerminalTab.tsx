import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../../store";
import { setLanguage, SUPPORTED_LANGUAGES, type Language } from "../../i18n";
import type { TerminalSettings } from "../../types";
import { pty, type ShellOptions } from "../terminal/pty";

/** Mesmo token que o main entende em `electron/shell.ts`. */
const GIT_BASH = "git-bash";
type ShellMode = "auto" | "git-bash" | "custom";

function modeOf(shell: string | null | undefined): ShellMode {
  const s = shell?.trim();
  if (!s) return "auto";
  return s === GIT_BASH ? "git-bash" : "custom";
}

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
  const [shellMode, setShellMode] = useState<ShellMode>(modeOf(settings.shell));
  const [shellOptions, setShellOptions] = useState<ShellOptions | null>(null);

  useEffect(() => {
    let alive = true;
    pty.shellOptions().then((o) => { if (alive && o) setShellOptions(o); }).catch(() => {});
    return () => { alive = false; };
  }, []);

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
        shell: shellMode === "auto" ? null : shellMode === "git-bash" ? GIT_BASH : draft.shell?.trim() || null,
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
        <select
          value={shellMode}
          onChange={(e) => {
            const mode = e.target.value as ShellMode;
            setShellMode(mode);
            patch({ shell: mode === "custom" && modeOf(draft.shell) === "custom" ? draft.shell : mode === "custom" ? "" : null });
          }}
        >
          <option value="auto">{t("terminal.shellAuto", { shell: shellOptions?.default ?? "…" })}</option>
          <option value="git-bash" disabled={!shellOptions?.git_bash}>
            {shellOptions?.git_bash ? t("terminal.shellGitBash") : t("terminal.shellGitBashMissing")}
          </option>
          <option value="custom">{t("terminal.shellCustom")}</option>
        </select>
      </label>
      {shellMode === "custom" && (
        <label>
          {t("terminal.shellPath")}
          <input type="text" value={draft.shell ?? ""} placeholder={t("terminal.shellHint")} onChange={(e) => patch({ shell: e.target.value })} />
        </label>
      )}
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
          <option value="dark">Dark (Padrão)</option>
          <option value="github_dark">GitHub Dark</option>
          <option value="dracula">Dracula</option>
          <option value="one_dark">One Dark</option>
          <option value="nord">Nord</option>
          <option value="tokyo_night">Tokyo Night</option>
          <option value="monokai">Monokai</option>
          <option value="solarized_dark">Solarized Dark</option>
          <option value="light">Light</option>
        </select>
      </label>
      <label>
        {t("terminal.language")}
        <select value={draft.language} onChange={(e) => patch({ language: e.target.value as Language })}>
          {SUPPORTED_LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </label>
      <div className="settings-footer is-sticky">
        {saved && <span className="settings-saved" role="status">✓ {t("terminal.saved")}</span>}
        {error && <span className="settings-error" role="alert">✕ {error}</span>}
        <span className="spacer" />
        <button type="submit" className="primary" disabled={!fontSizeValid || busy}>{busy ? "..." : t("terminal.save")}</button>
      </div>
    </form>
  );
}

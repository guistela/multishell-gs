import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api";
import { useAppStore } from "../../store";

/** Exportar e importar configurações entre máquinas. */
export default function TransferTab() {
  const { t } = useTranslation("settings");
  const reloadConfig = useAppStore((s) => s.reloadConfig);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<string | null>) => {
    setBusy(true); setStatus(null); setError(null);
    try {
      setStatus(await fn());
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const exportAll = () => run(async () => {
    const path = await api.settingsExport();
    return path ? t("transfer.exported", { path }) : null;
  });

  const importAll = () => run(async () => {
    const res = await api.settingsImport();
    if (!res) return null;
    await reloadConfig();
    return t("transfer.imported", { spaces: res.spaces, providers: res.providers, mcp: res.mcp, backup: res.backup });
  });

  return (
    <div className="settings-editor">
      <p>{t("transfer.intro")}</p>
      <p className="settings-hint">{t("transfer.secrets")}</p>
      <div className="settings-footer">
        <button type="button" className="primary" disabled={busy} onClick={() => void exportAll()}>{t("transfer.export")}</button>
        <button type="button" disabled={busy} onClick={() => void importAll()}>{t("transfer.import")}</button>
      </div>
      {status && <p className="settings-saved" role="status">✓ {status}</p>}
      {error && <p className="settings-error" role="alert">✕ {error}</p>}
    </div>
  );
}

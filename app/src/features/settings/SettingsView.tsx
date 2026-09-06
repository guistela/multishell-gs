import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import ProvidersTab from "../providers/ProvidersTab";
import SpacesTab from "../spaces/SpacesTab";
import TerminalTab from "./TerminalTab";
import "./settings.css";

export type SettingsTab = "providers" | "spaces" | "terminal";
const TABS: SettingsTab[] = ["providers", "spaces", "terminal"];

interface Props {
  open: boolean;
  onClose: () => void;
  initialTab?: SettingsTab;
  initialCreateSpace?: boolean;
}

export default function SettingsView({ open, onClose, initialTab = "providers", initialCreateSpace = false }: Props) {
  const { t } = useTranslation("settings");
  const [tab, setTab] = useState<SettingsTab>(initialTab);

  useEffect(() => { if (open) setTab(initialTab); }, [open, initialTab]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="settings-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="settings-panel" role="dialog" aria-modal="true" aria-label={t("title")}>
        <div className="settings-header" role="tablist">
          <h2>{t("title")}</h2>
          {TABS.map((id) => (
            <button key={id} type="button" role="tab" className="settings-tab" aria-selected={tab === id} onClick={() => setTab(id)}>
              {t(`tabs.${id}`)}
            </button>
          ))}
          <span className="spacer" />
          <button type="button" className="settings-tab" onClick={onClose} aria-label={t("close")}>✕</button>
        </div>
        <div className="settings-body">
          {tab === "providers" && <ProvidersTab />}
          {tab === "spaces" && <SpacesTab initialCreate={initialCreateSpace} />}
          {tab === "terminal" && <TerminalTab />}
        </div>
      </div>
    </div>
  );
}

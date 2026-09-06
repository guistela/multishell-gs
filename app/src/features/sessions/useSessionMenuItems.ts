import { useTranslation } from "react-i18next";
import { api } from "../../api";
import type { MenuItem } from "../../components/ContextMenu";
import { useAppStore } from "../../store";
import type { Session } from "../../types";
import { pty } from "../terminal/pty";

interface Props {
  session: Session;
  onRename?: () => void;
  onOpenSettings?: (tab?: "providers" | "spaces" | "terminal") => void;
}

export function useSessionMenuItems({ session, onRename, onOpenSettings }: Props): MenuItem[] {
  const { t } = useTranslation(["session", "common"]);
  const spaces = useAppStore((s) => s.spaces);
  const providers = useAppStore((s) => s.providers);
  const updateSession = useAppStore((s) => s.updateSession);
  const restartSession = useAppStore((s) => s.restartSession);
  const removeSession = useAppStore((s) => s.removeSession);
  const duplicateSession = useAppStore((s) => s.duplicateSession);
  const detachSession = useAppStore((s) => s.detachSession);
  const reattachSession = useAppStore((s) => s.reattachSession);
  const markHarnessStarted = useAppStore((s) => s.markHarnessStarted);

  const provider = providers.find((p) => p.id === session.provider_id);
  const otherSpaces = spaces.filter((sp) => sp.id !== session.space_id);

  const startHarness = async () => {
    if (!provider) return;
    const line = await api.providerCommandLine(provider, session.bypass);
    await pty.write(session.id, line + "\n");
    markHarnessStarted(session.id);
  };

  const copyCwd = () => {
    if (session.cwd) {
      void navigator.clipboard.writeText(session.cwd);
    }
  };

  const openFolder = () => {
    if (session.cwd) {
      void api.pathOpen(session.cwd).catch(() => void api.spaceOpenFolder(session.space_id));
    } else {
      void api.spaceOpenFolder(session.space_id);
    }
  };

  const clearScreen = () => {
    void pty.write(session.id, "\x0c");
  };

  const isMac = typeof navigator !== "undefined" && navigator.platform.toLowerCase().includes("mac");
  const modKey = isMac ? "⌘" : "Ctrl+";

  return [
    ...(onRename
      ? [
          {
            id: "rename",
            label: t("session:menu.rename"),
            icon: "✏️",
            shortcut: "Enter",
            onClick: onRename,
          },
        ]
      : []),
    {
      id: "duplicate",
      label: t("session:menu.duplicate"),
      icon: "📑",
      onClick: () => {
        duplicateSession(session.id);
      },
    },
    {
      id: "toggle-bypass",
      label: t("session:menu.toggleBypass"),
      icon: "⚡",
      onClick: () => {
        updateSession(session.id, { bypass: !session.bypass });
      },
    },
    ...(provider
      ? [
          {
            id: "start-harness",
            label: `${t("session:menu.startHarness")} (${provider.name})`,
            icon: "▶️",
            onClick: () => void startHarness(),
          },
        ]
      : []),
    { separator: true },
    {
      id: "restart",
      label: t("session:menu.restart"),
      icon: "🔄",
      shortcut: `${modKey}R`,
      onClick: () => {
        restartSession(session.id);
      },
    },
    {
      id: "clear",
      label: t("session:menu.clear"),
      icon: "🧹",
      shortcut: `${modKey}K`,
      onClick: clearScreen,
    },
    {
      id: "copy-cwd",
      label: t("session:menu.copyCwd"),
      icon: "📋",
      disabled: !session.cwd,
      onClick: copyCwd,
    },
    {
      id: "open-folder",
      label: t("session:menu.openFolder"),
      icon: "📂",
      onClick: openFolder,
    },
    { separator: true },
    {
      id: "detach-reattach",
      label: session.detached ? t("session:menu.reattach") : t("session:menu.detach"),
      icon: "⧉",
      onClick: () => {
        if (session.detached) void reattachSession(session.id);
        else void detachSession(session.id);
      },
    },
    ...(otherSpaces.length > 0
      ? [
          {
            id: "move-to-space",
            label: t("session:menu.moveToSpace"),
            icon: "🏷️",
            children: otherSpaces.map((sp) => ({
              id: `move-to-${sp.id}`,
              label: sp.name,
              icon: "●",
              onClick: () => {
                restartSession(session.id, { space_id: sp.id });
              },
            })),
          },
        ]
      : []),
    ...(onOpenSettings
      ? [
          {
            id: "terminal-settings",
            label: t("session:menu.terminalSettings"),
            icon: "⚙️",
            onClick: () => onOpenSettings("terminal"),
          },
        ]
      : []),
    { separator: true },
    {
      id: "close",
      label: t("session:menu.close"),
      icon: "✕",
      danger: true,
      shortcut: `${modKey}W`,
      onClick: () => {
        removeSession(session.id);
      },
    },
  ];
}

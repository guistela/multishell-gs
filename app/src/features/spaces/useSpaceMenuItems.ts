import { useTranslation } from "react-i18next";
import { api } from "../../api";
import type { MenuItem } from "../../components/ContextMenu";
import { useAppStore } from "../../store";
import { LAYOUT_MODES, type Space } from "../../types";
import { nextTitle } from "../sessions/sessionTitles";

interface Props {
  space: Space;
  onOpenSettings?: (tab?: "providers" | "spaces" | "terminal", initialCreate?: boolean) => void;
}

export function useSpaceMenuItems({ space, onOpenSettings }: Props): MenuItem[] {
  const { t } = useTranslation(["session", "common"]);
  const sessions = useAppStore((s) => s.sessions);
  const layouts = useAppStore((s) => s.spaceLayouts);
  const addSession = useAppStore((s) => s.addSession);
  const setSpaceLayout = useAppStore((s) => s.setSpaceLayout);
  const closeSpaceSessions = useAppStore((s) => s.closeSpaceSessions);

  const spaceSessions = sessions.filter((s) => s.space_id === space.id);
  const currentLayout = layouts[space.id] || "single";

  const isMac = typeof navigator !== "undefined" && navigator.platform.toLowerCase().includes("mac");
  const modKey = isMac ? "⌘" : "Ctrl+";

  const copySpacePath = () => {
    if (space.base_path) {
      void navigator.clipboard.writeText(space.base_path);
    }
  };

  return [
    {
      id: "new-in-space",
      label: t("session:menu.newInSpace"),
      icon: "➕",
      shortcut: `${modKey}T`,
      onClick: () => {
        addSession({ space_id: space.id, title: nextTitle(sessions) });
      },
    },
    {
      id: "open-space-folder",
      label: t("session:menu.openSpaceFolder"),
      icon: "📂",
      onClick: () => {
        void api.spaceOpenFolder(space.id);
      },
    },
    ...(space.base_path
      ? [
          {
            id: "copy-space-path",
            label: t("session:menu.copyCwd"),
            icon: "📋",
            onClick: copySpacePath,
          },
        ]
      : []),
    ...(onOpenSettings
      ? [
          {
            id: "new-space",
            label: t("session:sidebar.newSpace"),
            icon: "✨",
            onClick: () => onOpenSettings("spaces", true),
          },
          {
            id: "space-settings",
            label: t("session:menu.spaceSettings"),
            icon: "⚙️",
            onClick: () => onOpenSettings("spaces"),
          },
        ]
      : []),
    { separator: true },
    {
      id: "space-layout",
      label: t("session:menu.layout"),
      icon: "🔲",
      children: LAYOUT_MODES.map((mode) => ({
        id: `layout-${mode}`,
        label: `${t(`session:layout.${mode}`)}${currentLayout === mode ? " ✓" : ""}`,
        onClick: () => {
          void setSpaceLayout(space.id, mode);
        },
      })),
    },
    { separator: true },
    {
      id: "close-space-sessions",
      label: t("session:menu.closeAllInSpace"),
      icon: "✕",
      danger: true,
      disabled: spaceSessions.length === 0,
      onClick: () => {
        closeSpaceSessions(space.id);
      },
    },
  ];
}

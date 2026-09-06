import type { ShortcutAction } from "../../bridge";
import { useAppStore } from "../../store";
import { nextTitle } from "./Sidebar";

/** Cmd/Ctrl+T → new, +W → close, +, → settings, +P/K → search. Null se não é atalho. */
export function shortcutFromKey(e: Pick<KeyboardEvent, "metaKey" | "ctrlKey" | "key">): ShortcutAction | null {
  if (!(e.metaKey || e.ctrlKey)) return null;
  const key = e.key.toLowerCase();
  if (key === "t") return "new";
  if (key === "w") return "close";
  if (key === ",") return "settings";
  if (key === "p" || key === "k") return "search";
  return null;
}

/** Mesma ação para o keydown e para o menu nativo (bridge.onShortcut). */
export function applyShortcut(
  action: ShortcutAction,
  openSettings: () => void,
  openSearch?: () => void,
): void {
  const st = useAppStore.getState();
  const current = st.sessions.find((s) => s.id === st.selectedSessionId);
  if (action === "new") {
    const spaceId = current?.space_id ?? st.selectedSpaceId ?? st.spaces[0]?.id;
    if (spaceId) st.addSession({ space_id: spaceId, title: nextTitle(st.sessions) });
  } else if (action === "close") {
    if (current) st.removeSession(current.id);
  } else if (action === "settings") {
    openSettings();
  } else if (action === "search") {
    openSearch?.();
  }
}

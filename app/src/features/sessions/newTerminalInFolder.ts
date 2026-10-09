// Novo terminal já na pasta certa: o seletor nativo vem antes do shell abrir.
import { api } from "../../api";
import { useAppStore } from "../../store";
import type { Session } from "../../types";
import { nextTitle } from "./sessionTitles";

/** Nome da última pasta do caminho, em qualquer separador. */
export function folderTitle(path: string): string {
  return path.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? "";
}

/** Abre o seletor de pasta e cria o terminal nela. Null se o usuário cancelou. */
export async function newTerminalInFolder(spaceId: string): Promise<Session | null> {
  const st = useAppStore.getState();
  const space = st.spaces.find((s) => s.id === spaceId);
  if (!space) return null;
  const picked = await api.pickDirectory(space.base_path || st.settings.default_cwd || undefined);
  if (!picked) return null;
  const sessions = useAppStore.getState().sessions;
  return useAppStore.getState().addSession({ space_id: spaceId, cwd: picked, title: folderTitle(picked) || nextTitle(sessions) });
}

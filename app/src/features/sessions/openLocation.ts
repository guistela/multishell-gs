// Abrir a pasta de uma sessão fora do Multishell. Um lugar só para o menu e para a barra.
import { api } from "../../api";
import type { Session, Space } from "../../types";

/** Finder/Explorer. Sem cwd, cai na raiz do espaço. */
export function openSessionFolder(session: Session): void {
  if (session.cwd) {
    void api.pathOpen(session.cwd).catch(() => void api.spaceOpenFolder(session.space_id));
  } else {
    void api.spaceOpenFolder(session.space_id);
  }
}

/** Pasta que o editor abre: cwd da sessão, senão a pasta base do espaço. Null quando não há nenhuma. */
export function sessionEditorPath(session: Session, spaces: Space[]): string | null {
  return session.cwd || spaces.find((sp) => sp.id === session.space_id)?.base_path || null;
}

export function openSessionInEditor(session: Session, spaces: Space[]): void {
  const target = sessionEditorPath(session, spaces);
  if (target) void api.pathOpenEditor(target).catch((e: unknown) => api.logFront("warn", `VS Code: ${e instanceof Error ? e.message : String(e)}`));
}

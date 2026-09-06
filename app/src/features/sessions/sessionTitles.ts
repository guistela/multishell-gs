import type { Session } from "../../types";

// Título padrão de um novo terminal: numera pela quantidade já aberta.
export function nextTitle(sessions: Session[]): string {
  return `Shell ${sessions.length + 1}`;
}

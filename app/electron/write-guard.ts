// Aplica o guardrail de comandos destrutivos no que o renderer escreve no PTY.
// Monta a linha em digitação por sessão e avalia no Enter, antes de o shell receber.
import { isCommandDestructive } from "./guardrail";

/** Limite da linha em montagem. Colagens gigantes não devem crescer memória sem fim. */
const MAX_LINE = 8 * 1024;

/** Ctrl+U: apaga a linha corrente do shell, para o comando bloqueado não ficar pendente. */
const KILL_LINE = "\x15";

export interface GuardDecision {
  /** Texto liberado para o PTY. */
  allow: string;
  /** Preenchido quando uma linha destrutiva foi barrada. */
  blocked?: { line: string; reason: string };
}

export class WriteGuard {
  private readonly pending = new Map<string, string>();

  /** Filtra `data` antes da escrita. Só a linha destrutiva é barrada; o resto passa. */
  inspect(sessionId: string, data: string): GuardDecision {
    let line = this.pending.get(sessionId) ?? "";
    let allow = "";
    let blocked: GuardDecision["blocked"];

    for (const ch of data) {
      if (ch === "\r" || ch === "\n") {
        const check = isCommandDestructive(line);
        if (check.dangerous) {
          blocked = { line, reason: check.reason ?? "comando destrutivo" };
          allow += KILL_LINE;
        } else {
          allow += ch;
        }
        line = "";
        continue;
      }
      if (ch === "\x7f" || ch === "\b") {
        line = line.slice(0, -1);
        allow += ch;
        continue;
      }
      // Ctrl+C, Ctrl+U e ESC descartam o que estava sendo montado.
      if (ch === "\x03" || ch === "\x15" || ch === "\x1b") {
        line = "";
        allow += ch;
        continue;
      }
      if (line.length < MAX_LINE) line += ch;
      allow += ch;
    }

    this.pending.set(sessionId, line);
    return blocked ? { allow, blocked } : { allow };
  }

  /** Esquece a linha em montagem (sessão fechada ou reiniciada). */
  reset(sessionId: string): void {
    this.pending.delete(sessionId);
  }
}

// Guardrail de Comandos Destrutivos (Sentinela de Segurança para Agentes de IA).
// Analisa comandos antes de executar ou no fluxo do shell quando o bypass está ativado.

export interface DestructiveCheckResult {
  dangerous: boolean;
  reason?: string;
  pattern?: string;
}

const DESTRUCTIVE_RULES: { pattern: RegExp; reason: string }[] = [
  {
    pattern: /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f*|--recursive\s+--force)\s+([~/]|\$HOME|\*|\/\*|\.\/)(\s|$)/i,
    reason: "Remoção recursiva de diretório raiz, home ou curinga amplo (rm -rf /)",
  },
  {
    pattern: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/,
    reason: "Ataque de negação de serviço Fork Bomb (:(){ :|:& };:)",
  },
  {
    pattern: /\b(mkfs(\.[a-zA-Z0-9]+)?|fdisk|parted)\s+\/dev\//i,
    reason: "Formatação de disco ou partição de baixo nível",
  },
  {
    pattern: /\bdd\s+.*of=\/dev\/(sd[a-z]|nvme[0-9]|disk[0-9])/i,
    reason: "Escrita binária direta em dispositivo de bloco de disco",
  },
  {
    pattern: /\bgit\s+reset\s+--hard\s+HEAD~[0-9]+/i,
    reason: "Rollback destrutivo irreversível de commits do Git",
  },
  {
    pattern: /\b(DROP\s+DATABASE|DROP\s+SCHEMA|TRUNCATE\s+TABLE)\b/i,
    reason: "Comando SQL destrutivo de destruição de banco ou tabela",
  },
];

export function isCommandDestructive(command: string): DestructiveCheckResult {
  if (!command || typeof command !== "string") {
    return { dangerous: false };
  }

  const trimmed = command.trim();
  for (const rule of DESTRUCTIVE_RULES) {
    if (rule.pattern.test(trimmed)) {
      return {
        dangerous: true,
        reason: rule.reason,
        pattern: rule.pattern.toString(),
      };
    }
  }

  return { dangerous: false };
}

// Guardrail de Comandos Destrutivos (Sentinela de Segurança para Agentes de IA).
// Analisa comandos antes de executar ou no fluxo do shell quando o bypass está ativado.

export interface DestructiveCheckResult {
  dangerous: boolean;
  reason?: string;
  pattern?: string;
}

const DESTRUCTIVE_RULES: { pattern: RegExp; reason: string }[] = [
  {
    // Flags em qualquer ordem e separadas (`-r -f`, `--force --recursive`), alvo raiz/home/curinga.
    pattern: /\brm\s+(?:-[a-zA-Z]+|--(?:recursive|force))(?:\s+(?:-[a-zA-Z]+|--(?:recursive|force)))*\s+(?:[~/]|\$HOME|\$\{HOME\}|\*|\/\*|\.\/)[/*]?(?:\s|$)/i,
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

/** `-rf`, `-r -f`, `--recursive --force`: precisa de recursivo E força para ser destrutivo. */
function hasRecursiveForce(command: string): boolean {
  const flags = command.match(/(?:^|\s)(-[a-zA-Z]+|--(?:recursive|force))(?=\s|$)/g) ?? [];
  const joined = flags.join(" ");
  const recursive = /-[a-zA-Z]*[rR]/.test(joined) || /--recursive/.test(joined);
  const force = /-[a-zA-Z]*f/.test(joined) || /--force/.test(joined);
  return recursive && force;
}

export function isCommandDestructive(command: string): DestructiveCheckResult {
  if (!command || typeof command !== "string") {
    return { dangerous: false };
  }

  const trimmed = command.trim();
  for (const rule of DESTRUCTIVE_RULES) {
    if (rule.pattern.test(trimmed)) {
      // A regra do `rm` casa o alvo; as flags são conferidas à parte, em qualquer ordem.
      if (/\brm\s/i.test(rule.pattern.source) && !hasRecursiveForce(trimmed)) continue;
      return {
        dangerous: true,
        reason: rule.reason,
        pattern: rule.pattern.toString(),
      };
    }
  }

  return { dangerous: false };
}

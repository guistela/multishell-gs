// Sessões de autenticação das CLIs dentro de um espaço.
// Cada espaço tem HOME próprio, então cada um tem seus próprios logins.
// Nunca lemos token: só a identidade que a própria CLI mostra no comando de status.
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Uma CLI que sabemos consultar. */
export interface AuthProviderDef {
  id: string;
  name: string;
  executable: string;
  /** Comando de status. Sem shell: argumentos separados. */
  statusArgs: string[];
  /** O que digitar no terminal do espaço para entrar. */
  loginCommand: string;
  /** O que digitar para sair. */
  logoutCommand?: string;
  /** Extrai a identidade da saída. Devolve null quando não está logado. */
  parse: (stdout: string, stderr: string) => { account: string; detail?: string } | null;
}

export interface AuthSessionStatus {
  id: string;
  name: string;
  installed: boolean;
  logged_in: boolean;
  account: string | null;
  detail: string | null;
  login_command: string;
  logout_command: string | null;
}

const firstMatch = (text: string, re: RegExp): string | null => {
  const m = text.match(re);
  return m?.[1]?.trim() || null;
};

export const AUTH_PROVIDERS: AuthProviderDef[] = [
  {
    id: "gh",
    name: "GitHub CLI",
    executable: "gh",
    statusArgs: ["auth", "status"],
    loginCommand: "gh auth login",
    logoutCommand: "gh auth logout",
    parse: (out, err) => {
      const text = `${out}\n${err}`;
      if (/not logged in|you are not logged into/i.test(text)) return null;
      const account = firstMatch(text, /account\s+([A-Za-z0-9_-]+)/i);
      const host = firstMatch(text, /Logged in to (\S+)/i);
      return account ? { account, detail: host ?? undefined } : null;
    },
  },
  {
    id: "gcloud",
    name: "Google Cloud CLI",
    executable: "gcloud",
    statusArgs: ["auth", "list", "--filter=status:ACTIVE", "--format=value(account)"],
    loginCommand: "gcloud auth login",
    logoutCommand: "gcloud auth revoke",
    parse: (out) => {
      const account = out.trim().split("\n")[0]?.trim();
      return account ? { account } : null;
    },
  },
  {
    id: "az",
    name: "Azure CLI",
    executable: "az",
    statusArgs: ["account", "show", "--output", "json"],
    loginCommand: "az login",
    logoutCommand: "az logout",
    parse: (out) => {
      try {
        const data = JSON.parse(out);
        const account = data?.user?.name;
        return account ? { account, detail: data?.name ? `assinatura: ${data.name}` : undefined } : null;
      } catch {
        return null;
      }
    },
  },
  {
    id: "firebase",
    name: "Firebase CLI",
    executable: "firebase",
    statusArgs: ["login:list"],
    loginCommand: "firebase login",
    logoutCommand: "firebase logout",
    parse: (out, err) => {
      const text = `${out}\n${err}`;
      if (/no authorized accounts|No accounts/i.test(text)) return null;
      const account = firstMatch(text, /Logged in as\s+(\S+)/i) ?? firstMatch(text, /\[.\]\s+(\S+@\S+)/);
      return account ? { account } : null;
    },
  },
  {
    id: "aws",
    name: "AWS CLI",
    executable: "aws",
    statusArgs: ["sts", "get-caller-identity", "--output", "json"],
    loginCommand: "aws configure",
    parse: (out) => {
      try {
        const data = JSON.parse(out);
        const arn = data?.Arn;
        return arn ? { account: String(arn).split("/").pop() || arn, detail: data?.Account ? `conta ${data.Account}` : undefined } : null;
      } catch {
        return null;
      }
    },
  },
  {
    id: "npm",
    name: "npm",
    executable: "npm",
    statusArgs: ["whoami"],
    loginCommand: "npm login",
    logoutCommand: "npm logout",
    parse: (out) => {
      const account = out.trim().split("\n")[0]?.trim();
      return account && !/^ERR/i.test(account) ? { account } : null;
    },
  },
  {
    id: "kubectl",
    name: "kubectl",
    executable: "kubectl",
    statusArgs: ["config", "current-context"],
    loginCommand: "kubectl config use-context <contexto>",
    parse: (out) => {
      const ctx = out.trim();
      return ctx ? { account: ctx, detail: "contexto atual" } : null;
    },
  },
  {
    id: "vercel",
    name: "Vercel CLI",
    executable: "vercel",
    statusArgs: ["whoami"],
    loginCommand: "vercel login",
    logoutCommand: "vercel logout",
    parse: (out) => {
      const account = out.trim().split("\n").filter(Boolean).pop()?.trim();
      return account && !/error/i.test(account) ? { account } : null;
    },
  },
];

const STATUS_TIMEOUT_MS = 8000;

/** Consulta uma CLI. Executável ausente vira `installed: false`, não erro. */
export async function checkProvider(
  def: AuthProviderDef,
  opts: { env: Record<string, string>; cwd: string; exec?: typeof execFileAsync }
): Promise<AuthSessionStatus> {
  const run = opts.exec ?? execFileAsync;
  const base: AuthSessionStatus = {
    id: def.id,
    name: def.name,
    installed: true,
    logged_in: false,
    account: null,
    detail: null,
    login_command: def.loginCommand,
    logout_command: def.logoutCommand ?? null,
  };

  try {
    const { stdout, stderr } = await run(def.executable, def.statusArgs, {
      env: opts.env,
      cwd: opts.cwd,
      timeout: STATUS_TIMEOUT_MS,
    });
    const parsed = def.parse(stdout || "", stderr || "");
    return parsed ? { ...base, logged_in: true, account: parsed.account, detail: parsed.detail ?? null } : base;
  } catch (err: any) {
    if (err?.code === "ENOENT") return { ...base, installed: false };
    // Comando existe mas saiu com erro: normalmente é "não autenticado".
    // Algumas CLIs escrevem a identidade no stderr mesmo saindo diferente de zero.
    const parsed = def.parse(err?.stdout || "", err?.stderr || "");
    return parsed ? { ...base, logged_in: true, account: parsed.account, detail: parsed.detail ?? null } : base;
  }
}

/** Consulta todas as CLIs do catálogo em paralelo, no ambiente do espaço. */
export async function listAuthSessions(opts: {
  env: Record<string, string>;
  cwd: string;
  providers?: AuthProviderDef[];
  exec?: typeof execFileAsync;
}): Promise<AuthSessionStatus[]> {
  const defs = opts.providers ?? AUTH_PROVIDERS;
  return Promise.all(defs.map((def) => checkProvider(def, opts)));
}

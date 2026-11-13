// Servidor local das notificações dos agentes.
//
// O agente dentro do terminal chama o CLI `multishell`, que fala com este
// servidor. O canal é um unix socket no macOS e no Linux, e um named pipe no
// Windows. Nada de rede: nenhuma porta TCP, nenhum endereço, nenhuma saída do
// computador. O socket é do usuário e fica com modo 0600.
//
// Cada sessão recebe um token no spawn, pelo ambiente. O token é quem diz de
// qual sessão a notificação veio: o cliente não escolhe. Assim um espaço não
// fala pela sessão de outro.
import { createHash, randomUUID } from "node:crypto";
import { chmodSync, unlinkSync } from "node:fs";
import * as net from "node:net";
import * as path from "node:path";
import type { NotificationCenter } from "./notifications";

/** Teto da linha que o CLI manda. Acima disso nem tentamos interpretar. */
export const MAX_LINE = 64 * 1024;
/** Prazo padrão de uma pergunta: uma hora. Depois disso o agente segue sozinho. */
export const DEFAULT_ASK_TIMEOUT_MS = 60 * 60 * 1000;

export type NotifyPlatform = NodeJS.Platform | "darwin" | "win32" | "linux";

/** Onde o CLI procura o servidor. Vai no ambiente da sessão como MULTISHELL_NOTIFY_SOCK. */
export function socketPathFor(userDataDir: string, platform: NotifyPlatform): string {
  if (platform === "win32") {
    const marca = createHash("sha256").update(userDataDir).digest("hex").slice(0, 12);
    return `\\\\.\\pipe\\multishell-notify-${marca}`;
  }
  return path.join(userDataDir, "agent-notify.sock");
}

interface Registro { session_id: string; space_id: string | null }

interface Esperando {
  resolve: (answer: string | null) => void;
  session_id: string;
  timer: ReturnType<typeof setTimeout>;
}

export interface NotifyServerDeps {
  newToken?: () => string;
  /** Avisado a cada notificação nova. É por aqui que o renderer e o macOS ficam sabendo. */
  onAdded?: (id: string) => void;
}

function erro(message: string): string {
  return JSON.stringify({ ok: false, error: message });
}

export class NotifyServer {
  private readonly tokens = new Map<string, Registro>();
  private readonly porSessao = new Map<string, string>();
  /** Perguntas em voo, por id da notificação. */
  private readonly esperando = new Map<string, Esperando>();
  private readonly newToken: () => string;
  private readonly onAdded: (id: string) => void;
  private server: net.Server | null = null;
  private socketFile: string | null = null;

  constructor(private readonly center: NotificationCenter, deps: NotifyServerDeps = {}) {
    this.newToken = deps.newToken ?? randomUUID;
    this.onAdded = deps.onAdded ?? (() => {});
  }

  /** Token da sessão. Chamar de novo para a mesma sessão devolve o mesmo token. */
  register(sessionId: string, spaceId: string | null): string {
    const antigo = this.porSessao.get(sessionId);
    if (antigo) return antigo;
    const token = this.newToken();
    this.tokens.set(token, { session_id: sessionId, space_id: spaceId });
    this.porSessao.set(sessionId, token);
    return token;
  }

  /** O terminal fechou. O token morre e quem esperava resposta é solto. */
  unregister(sessionId: string): void {
    const token = this.porSessao.get(sessionId);
    if (token) this.tokens.delete(token);
    this.porSessao.delete(sessionId);
    for (const [id, e] of [...this.esperando]) {
      if (e.session_id === sessionId) this.solta(id, null);
    }
  }

  /** Uma linha do CLI. Devolve a linha de resposta. `ask` só resolve quando respondida. */
  async handle(line: string): Promise<string> {
    if (line.length > MAX_LINE) return erro("mensagem grande demais");
    let req: Record<string, unknown>;
    try {
      req = JSON.parse(line) as Record<string, unknown>;
    } catch {
      return erro("json inválido");
    }
    const reg = this.tokens.get(String(req.token ?? ""));
    if (!reg) return erro("token inválido");

    if (req.op === "notify") return this.doNotify(reg, req);
    if (req.op === "ask") return this.doAsk(reg, req);
    return erro("operação desconhecida");
  }

  private doNotify(reg: Registro, req: Record<string, unknown>): string {
    try {
      const n = this.center.add({
        session_id: reg.session_id,
        space_id: reg.space_id,
        title: String(req.title ?? ""),
        body: req.body == null ? null : String(req.body),
        level: req.level as never,
      });
      this.onAdded(n.id);
      return JSON.stringify({ ok: true, id: n.id });
    } catch (e) {
      return erro(e instanceof Error ? e.message : "falhou");
    }
  }

  private doAsk(reg: Registro, req: Record<string, unknown>): Promise<string> {
    let id: string;
    try {
      const n = this.center.add({
        session_id: reg.session_id,
        space_id: reg.space_id,
        title: String(req.title ?? ""),
        body: req.body == null ? null : String(req.body),
        level: req.level as never,
        ask: {
          options: Array.isArray(req.options) ? req.options.map(String) : [],
          placeholder: req.placeholder == null ? null : String(req.placeholder),
        },
      });
      id = n.id;
      this.onAdded(id);
    } catch (e) {
      return Promise.resolve(erro(e instanceof Error ? e.message : "falhou"));
    }

    const prazo = Number(req.timeout_ms) > 0 ? Number(req.timeout_ms) : DEFAULT_ASK_TIMEOUT_MS;
    return new Promise<string>((resolve) => {
      const timer = setTimeout(() => this.solta(id, null), prazo);
      // `unref` para o prazo de uma hora não segurar o fechamento do app.
      timer.unref?.();
      this.esperando.set(id, {
        session_id: reg.session_id,
        timer,
        resolve: (answer) => resolve(JSON.stringify({ ok: true, answer })),
      });
    });
  }

  /** Leva as respostas novas da central para quem está bloqueado esperando. */
  deliverAnswers(): void {
    for (const { id, answer } of this.center.drainAnswered()) this.solta(id, answer);
  }

  /** Solta todo mundo. Chamado ao fechar o app: ninguém fica pendurado. */
  releaseAll(): void {
    for (const id of [...this.esperando.keys()]) this.solta(id, null);
  }

  private solta(id: string, answer: string | null): void {
    const e = this.esperando.get(id);
    if (!e) return;
    clearTimeout(e.timer);
    this.esperando.delete(id);
    e.resolve(answer);
  }

  /** Abre o socket local. Erro aqui não derruba o app: sem socket, o CLI só falha. */
  listen(socketFile: string): void {
    if (this.server) return;
    this.socketFile = socketFile;
    if (!socketFile.startsWith("\\\\")) {
      try { unlinkSync(socketFile); } catch { /* não existia */ }
    }
    const server = net.createServer((sock) => this.atende(sock));
    server.on("error", () => {});
    server.listen(socketFile, () => {
      // Só o dono fala com o socket. No Windows o named pipe já é da sessão.
      if (!socketFile.startsWith("\\\\")) {
        try { chmodSync(socketFile, 0o600); } catch { /* o listen já garante o dono */ }
      }
    });
    this.server = server;
  }

  close(): void {
    this.releaseAll();
    this.server?.close();
    this.server = null;
    if (this.socketFile && !this.socketFile.startsWith("\\\\")) {
      try { unlinkSync(this.socketFile); } catch { /* já saiu */ }
    }
  }

  /** Uma conexão = uma requisição, terminada em \n. A resposta fecha a conexão. */
  private atende(sock: net.Socket): void {
    let buf = "";
    let pronto = false;
    sock.setEncoding("utf8");
    sock.on("error", () => {});
    sock.on("data", (chunk: string) => {
      if (pronto) return;
      buf += chunk;
      if (buf.length > MAX_LINE) {
        pronto = true;
        sock.end(erro("mensagem grande demais") + "\n");
        return;
      }
      const corte = buf.indexOf("\n");
      if (corte < 0) return;
      pronto = true;
      const linha = buf.slice(0, corte);
      // A conexão fica aberta enquanto a pergunta espera: é o CLI bloqueado.
      this.handle(linha).then(
        (resp) => sock.end(resp + "\n"),
        () => sock.end(erro("falhou") + "\n"),
      );
    });
  }
}

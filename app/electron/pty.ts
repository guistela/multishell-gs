// Sessões de PTY via node-pty. Porta de src-tauri/src/pty.rs.
// O ambiente entra SÓ aqui, no spawn. Nenhum `export` digitado depois.
import * as nodePty from "node-pty";
import { execFile } from "node:child_process";
import { readlinkSync } from "node:fs";
import { delimiter, join } from "node:path";
import { existsSync } from "node:fs";
import { EVENTS, type PtyExitEvent, type PtyOutputEvent, type SpawnResult } from "./ipc";

export interface SpawnRequest {
  session_id: string;
  shell: string;
  shell_args?: string[];
  cwd?: string | null;
  /** Ambiente completo do shell. Se `inherit_env` for false, é só isto. */
  env?: Record<string, string>;
  inherit_env?: boolean;
  cols?: number;
  rows?: number;
}

/** O que o PtyManager precisa de uma BrowserWindow: só o `webContents.send`. */
export interface PtySender {
  id?: number;
  send(channel: string, payload: unknown): void;
  isDestroyed?(): boolean;
}
export interface PtyWindow { webContents: PtySender }

/** Últimos 256 KB de output por sessão: replay para janelas que se anexam depois. */
export const RING_BUFFER_MAX = 256 * 1024;

interface PtySession {
  proc: nodePty.IPty;
  pid: number;
  /** Janelas que recebem `pty-output`/`pty-exit` desta sessão. */
  senders: Set<PtySender>;
  buffer: RingBuffer;
}

/** Fila de chunks limitada em bytes. Descarta do início quando passa de `max`. */
export class RingBuffer {
  private chunks: Buffer[] = [];
  private total = 0;

  constructor(private readonly max = RING_BUFFER_MAX) {}

  push(bytes: Buffer): void {
    if (bytes.length === 0) return;
    if (bytes.length >= this.max) {
      this.chunks = [bytes.subarray(bytes.length - this.max)];
      this.total = this.max;
      return;
    }
    this.chunks.push(bytes);
    this.total += bytes.length;
    while (this.total > this.max && this.chunks.length > 1) {
      const head = this.chunks[0];
      const excess = this.total - this.max;
      if (head.length <= excess) {
        this.chunks.shift();
        this.total -= head.length;
      } else {
        this.chunks[0] = head.subarray(excess);
        this.total -= excess;
      }
    }
  }

  get size(): number {
    return this.total;
  }

  /** Cópia contígua (não compartilha memória com os chunks). */
  snapshot(): Uint8Array {
    return new Uint8Array(Buffer.concat(this.chunks, this.total));
  }

  clear(): void {
    this.chunks = [];
    this.total = 0;
  }
}

const spawn = nodePty.spawn;

export class PtyManager {
  private readonly sessions = new Map<string, PtySession>();

  /**
   * Idempotente: se a sessão já existe, só anexa a janela e devolve o replay.
   * Senão cria o PTY com a janela como primeira anexada.
   */
  spawn(win: PtyWindow, req: SpawnRequest): SpawnResult {
    if (this.sessions.has(req.session_id)) {
      return { attached: true, replay: this.attach(req.session_id, win.webContents) };
    }
    const env: Record<string, string> = req.inherit_env ? cleanEnv(process.env) : {};
    env.TERM = "xterm-256color";
    env.COLORTERM = "truecolor";
    Object.assign(env, req.env ?? {});

    const proc = spawn(req.shell, req.shell_args ?? [], {
      name: "xterm-256color",
      cols: req.cols ?? 80,
      rows: req.rows ?? 24,
      cwd: req.cwd ?? undefined,
      env,
      encoding: null, // bytes crus; o xterm decodifica no renderer
    });
    const sessionId = req.session_id;
    const session: PtySession = { proc, pid: proc.pid, senders: new Set([win.webContents]), buffer: new RingBuffer() };
    this.sessions.set(sessionId, session);

    proc.onData((chunk: string | Buffer) => {
      const bytes = typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk;
      this.pushOutput(sessionId, bytes);
    });
    proc.onExit(({ exitCode }) => {
      if (this.sessions.get(sessionId) !== session) return; // já removida por kill
      this.sessions.delete(sessionId);
      session.buffer.clear();
      const payload: PtyExitEvent = { session_id: sessionId, code: exitCode ?? null };
      this.emit(session, EVENTS.ptyExit, payload);
    });
    return { attached: false };
  }

  /** Registra a janela como destino dos eventos da sessão e devolve o replay. Não cria PTY. */
  attach(sessionId: string, sender: PtySender): Uint8Array {
    const s = this.get(sessionId);
    s.senders.add(sender);
    return s.buffer.snapshot();
  }

  /** Grava no ring buffer e repassa às janelas anexadas. Público para teste. */
  pushOutput(sessionId: string, bytes: Buffer): void {
    const s = this.sessions.get(sessionId);
    if (!s) return;
    // Cópia: o Buffer do node-pty pode ser fatia de um slab compartilhado.
    const own = Buffer.from(bytes);
    s.buffer.push(own);
    // `new Uint8Array(view)` copia para um ArrayBuffer próprio: o IPC serializa o ArrayBuffer inteiro.
    const payload: PtyOutputEvent = { session_id: sessionId, data: new Uint8Array(own) };
    this.emit(s, EVENTS.ptyOutput, payload);
  }

  private emit(s: PtySession, channel: string, payload: unknown): void {
    for (const sender of [...s.senders]) {
      if (sender.isDestroyed?.()) {
        s.senders.delete(sender);
        continue;
      }
      sender.send(channel, payload);
    }
  }

  write(sessionId: string, data: Uint8Array | number[] | string): void {
    const s = this.get(sessionId);
    const text = typeof data === "string" ? data : Buffer.from(data).toString("utf8");
    s.proc.write(text);
  }

  resize(sessionId: string, cols: number, rows: number): void {
    this.get(sessionId).proc.resize(Math.max(1, cols | 0), Math.max(1, rows | 0));
  }

  kill(sessionId: string): void {
    const s = this.sessions.get(sessionId);
    if (!s) return;
    this.sessions.delete(sessionId);
    s.buffer.clear();
    try {
      s.proc.kill();
    } catch {
      /* já morreu */
    }
  }

  killAll(): void {
    for (const id of [...this.sessions.keys()]) this.kill(id);
  }

  pid(sessionId: string): number {
    return this.get(sessionId).pid;
  }

  has(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /** Bytes guardados no ring buffer (0 se a sessão não existe). */
  bufferSize(sessionId: string): number {
    return this.sessions.get(sessionId)?.buffer.size ?? 0;
  }

  /** Janelas anexadas (0 se a sessão não existe). */
  attachedCount(sessionId: string): number {
    return this.sessions.get(sessionId)?.senders.size ?? 0;
  }

  /** cwd atual do processo da sessão. `null` quando não dá para saber. */
  async cwd(sessionId: string): Promise<string | null> {
    const s = this.get(sessionId);
    return processCwd(s.pid);
  }

  private get(sessionId: string): PtySession {
    const s = this.sessions.get(sessionId);
    if (!s) throw new Error("sessão não existe");
    return s;
  }
}

function cleanEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) if (typeof v === "string") out[k] = v;
  return out;
}

export async function processCwd(pid: number): Promise<string | null> {
  if (process.platform === "darwin") return cwdViaLsof(pid);
  if (process.platform === "linux") {
    try {
      return readlinkSync(`/proc/${pid}/cwd`);
    } catch {
      return null;
    }
  }
  return null;
}

/** mac: `lsof -a -p <pid> -d cwd -Fn` imprime `p<pid>`, `fcwd`, `n<path>`. */
function cwdViaLsof(pid: number): Promise<string | null> {
  return new Promise((resolve) => {
    execFile("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"], { timeout: 1000 }, (err, stdout) => {
      if (err && !stdout) return resolve(null);
      resolve(parseLsofCwd(String(stdout)));
    });
  });
}

export function parseLsofCwd(stdout: string): string | null {
  for (const line of stdout.split("\n")) {
    if (line.startsWith("n") && line.length > 1) return line.slice(1).trim() || null;
  }
  return null;
}

/** mac/linux: `$SHELL` ou `/bin/zsh`; windows: `pwsh.exe` se no PATH, senão `powershell.exe`. */
export function defaultShell(): string {
  if (process.platform === "win32") {
    return whichExists("pwsh.exe") ? "pwsh.exe" : "powershell.exe";
  }
  return process.env.SHELL || "/bin/zsh";
}

function whichExists(bin: string): boolean {
  const paths = (process.env.PATH ?? "").split(delimiter).filter(Boolean);
  return paths.some((p) => existsSync(join(p, bin)));
}

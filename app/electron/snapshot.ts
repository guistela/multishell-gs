// Time Machine & Rollback de Espaços (Snapshots de Arquivos e Estado).
// Permite que o usuário reverta alterações antes de executar prompts autônomos pesados.
// O conteúdo vem do git: só o que mudou entra no snapshot.

import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface SnapshotMeta {
  id: string;
  spaceId: string;
  timestamp: string;
  label: string;
  fileCount: number;
}

export interface SnapshotFile {
  relativePath: string;
  content: string;
}

/** Resultado da leitura do git. `skipped` explica cada arquivo que ficou de fora. */
export interface GitCapture {
  files: SnapshotFile[];
  skipped: string[];
  truncated: boolean;
}

export interface RestoreResult {
  id: string;
  cwd: string;
  restored: number;
  files: string[];
}

/** Tetos: snapshot é rollback de código, não backup de repositório. */
export const SNAPSHOT_MAX_FILES = 200;
export const SNAPSHOT_MAX_FILE_BYTES = 1024 * 1024;

/** Nome de pasta simples: nada que suba de diretório no caminho de armazenamento. */
function assertSegment(value: unknown, what: string): string {
  if (typeof value !== "string" || !value) throw new Error(`${what} inválido`);
  if (value === "." || value === ".." || /[\\/]/.test(value)) throw new Error(`${what} inválido`);
  return value;
}

/** Caminho dentro do snapshot: sempre relativo e sempre para baixo. */
/**
 * Valida o caminho relativo do snapshot e devolve sempre em formato posix,
 * para o mesmo snapshot valer no mac e no Windows. No Windows a barra invertida
 * é separador; no unix ela é um caractere comum de nome de arquivo.
 */
export function safeRelativePath(relativePath: unknown, platform: NodeJS.Platform = process.platform): string {
  const invalid = () => new Error(`caminho de arquivo inválido no snapshot: ${String(relativePath)}`);
  if (typeof relativePath !== "string" || !relativePath) throw new Error("caminho de arquivo inválido no snapshot");

  const isWindows = platform === "win32";
  if (relativePath.startsWith("/") || (isWindows && (/^[A-Za-z]:/.test(relativePath) || relativePath.startsWith("\\")))) {
    throw invalid();
  }

  const segments = (isWindows ? relativePath.split(/[\\/]+/) : relativePath.split("/")).filter((seg) => seg !== "" && seg !== ".");
  if (segments.length === 0 || segments.includes("..")) throw invalid();

  return segments.join("/");
}

/** Pasta de trabalho vinda do renderer: só caminho absoluto de pasta existente. */
export async function assertWorkDir(cwd: unknown): Promise<string> {
  if (typeof cwd !== "string" || !cwd) throw new Error("A pasta precisa ser informada.");
  if (!path.isAbsolute(cwd)) throw new Error(`A pasta "${cwd}" precisa ser um caminho absoluto.`);
  let real: string;
  try {
    real = await fs.realpath(cwd);
  } catch {
    throw new Error(`A pasta "${cwd}" não existe.`);
  }
  const stat = await fs.stat(real);
  if (!stat.isDirectory()) throw new Error(`O caminho "${cwd}" não é uma pasta.`);
  return real;
}

/**
 * Caminhos de `git status --porcelain -z` (sem os não rastreados, sem os apagados).
 * Em rename/copy o git manda o caminho antigo num campo extra: precisa pular.
 */
export function parsePorcelainZ(stdout: string): string[] {
  const entries = stdout.split("\0");
  const out: string[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry || entry.length < 4) continue;
    const x = entry[0];
    const y = entry[1];
    const file = entry.slice(3);
    if (x === "R" || x === "C" || y === "R" || y === "C") i++; // campo extra: caminho de origem
    if (x === "?" || x === "!" || x === "D" || y === "D") continue;
    if (file) out.push(file);
  }
  return out;
}

/** Conteúdo com byte 0 é binário: não cabe num snapshot de texto. */
function isBinary(buf: Buffer): boolean {
  return buf.includes(0);
}

/**
 * Lê o conteúdo atual dos arquivos rastreados que mudaram em `cwd`.
 * Sempre `execFile` (nunca shell): o cwd vem do renderer.
 */
export async function collectGitChangedFiles(opts: {
  cwd: string;
  env?: Record<string, string>;
  maxFiles?: number;
  maxBytes?: number;
}): Promise<GitCapture> {
  const cwd = await assertWorkDir(opts.cwd);
  const maxFiles = opts.maxFiles ?? SNAPSHOT_MAX_FILES;
  const maxBytes = opts.maxBytes ?? SNAPSHOT_MAX_FILE_BYTES;
  const run = (args: string[]) => execFileAsync("git", args, { cwd, env: opts.env, timeout: 15_000, maxBuffer: 8 * 1024 * 1024 });

  try {
    const { stdout } = await run(["rev-parse", "--is-inside-work-tree"]);
    if (stdout.trim() !== "true") throw new Error("fora da árvore de trabalho");
  } catch (err: any) {
    if (err?.code === "ENOENT") throw new Error("git não está instalado no sistema. Instale o git para usar snapshots.");
    throw new Error(`A pasta "${opts.cwd}" não é um repositório git. O snapshot usa o git para saber o que mudou.`);
  }

  // `-uno`: arquivo não rastreado não é "modificado", e entraria lixo de build no snapshot.
  const { stdout } = await run(["status", "--porcelain", "-z", "-uno"]);
  const paths = parsePorcelainZ(stdout);

  const files: SnapshotFile[] = [];
  const skipped: string[] = [];
  for (const rel of paths.slice(0, maxFiles)) {
    let safe: string;
    try {
      safe = safeRelativePath(rel);
    } catch {
      skipped.push(`${rel} (caminho inválido)`);
      continue;
    }
    try {
      const full = path.join(cwd, safe);
      const stat = await fs.stat(full);
      if (!stat.isFile()) continue;
      if (stat.size > maxBytes) {
        skipped.push(`${safe} (maior que ${Math.round(maxBytes / 1024)} KB)`);
        continue;
      }
      const buf = await fs.readFile(full);
      if (isBinary(buf)) {
        skipped.push(`${safe} (binário)`);
        continue;
      }
      files.push({ relativePath: safe, content: buf.toString("utf8") });
    } catch {
      skipped.push(`${safe} (não deu para ler)`);
    }
  }
  return { files, skipped, truncated: paths.length > maxFiles };
}

export class SpaceSnapshotManager {
  constructor(private baseDir: string) {}

  /** Diretório de armazenamento dos snapshots de um determinado espaço. */
  private snapshotsDir(spaceId: string): string {
    return path.join(this.baseDir, assertSegment(spaceId, "space_id"), "snapshots");
  }

  private snapshotDir(spaceId: string, id: string): string {
    return path.join(this.snapshotsDir(spaceId), assertSegment(id, "snapshot_id"));
  }

  /** Cria um novo snapshot de um conjunto de arquivos relativos. */
  async createSnapshot(spaceId: string, label: string, files: SnapshotFile[]): Promise<SnapshotMeta> {
    const id = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    // Valida tudo antes de escrever: snapshot pela metade não serve para rollback.
    const safe = files.map((f) => ({ relativePath: safeRelativePath(f.relativePath), content: String(f.content ?? "") }));
    const dir = this.snapshotDir(spaceId, id);
    await fs.mkdir(dir, { recursive: true });

    for (const file of safe) {
      const full = path.join(dir, file.relativePath);
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, file.content, "utf8");
    }

    const meta: SnapshotMeta = {
      id,
      spaceId,
      timestamp,
      label: label?.trim() || `Snapshot ${timestamp}`,
      fileCount: safe.length,
    };
    await fs.writeFile(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2), "utf8");
    return meta;
  }

  /** Lista os snapshots existentes de um espaço. */
  async listSnapshots(spaceId: string): Promise<SnapshotMeta[]> {
    const root = this.snapshotsDir(spaceId);
    try {
      const entries = await fs.readdir(root, { withFileTypes: true });
      const metas: SnapshotMeta[] = [];
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        try {
          const raw = await fs.readFile(path.join(root, entry.name, "meta.json"), "utf8");
          metas.push(JSON.parse(raw));
        } catch {
          // ignora snapshots corrompidos ou parciais
        }
      }
      return metas.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    } catch {
      return [];
    }
  }

  /** Metadados + conteúdo guardado de um snapshot. */
  async readSnapshot(spaceId: string, id: string): Promise<{ meta: SnapshotMeta; files: SnapshotFile[] }> {
    const dir = this.snapshotDir(spaceId, id);
    let meta: SnapshotMeta;
    try {
      meta = JSON.parse(await fs.readFile(path.join(dir, "meta.json"), "utf8"));
    } catch {
      throw new Error(`Snapshot não existe: ${id}`);
    }
    const files: SnapshotFile[] = [];
    const walk = async (relative: string): Promise<void> => {
      const entries = await fs.readdir(path.join(dir, relative), { withFileTypes: true });
      for (const entry of entries) {
        const rel = relative ? path.join(relative, entry.name) : entry.name;
        if (entry.isDirectory()) await walk(rel);
        else if (rel !== "meta.json") files.push({ relativePath: rel, content: await fs.readFile(path.join(dir, rel), "utf8") });
      }
    };
    await walk("");
    return { meta, files };
  }

  /**
   * Escreve os arquivos do snapshot de volta em `cwd`. Sobrescreve o trabalho atual:
   * o cwd é obrigatório e nada é escrito fora dele.
   */
  async restoreSnapshot(spaceId: string, id: string, cwd: string): Promise<RestoreResult> {
    const root = await assertWorkDir(cwd);
    const { files } = await this.readSnapshot(spaceId, id);

    const written: string[] = [];
    for (const file of files) {
      const safe = safeRelativePath(file.relativePath);
      const target = path.resolve(root, safe);
      // Cinto e suspensório: mesmo validado, o destino tem que ficar dentro do cwd.
      if (target !== root && !target.startsWith(root + path.sep)) {
        throw new Error(`caminho de arquivo inválido no snapshot: ${file.relativePath}`);
      }
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, file.content, "utf8");
      written.push(safe);
    }
    return { id, cwd: root, restored: written.length, files: written };
  }

  /** Apaga um snapshot inteiro. */
  async deleteSnapshot(spaceId: string, id: string): Promise<void> {
    await fs.rm(this.snapshotDir(spaceId, id), { recursive: true, force: true });
  }
}

// Memória residente por sessão: o shell mais toda a árvore de filhos (o harness e o que ele abrir).
// Uma chamada de `ps` cobre todas as sessões; consultar processo a processo seria caro.
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface ProcRow {
  pid: number;
  ppid: number;
  /** RSS em bytes. O `ps` devolve em KB. */
  rss: number;
}

export function parsePsOutput(stdout: string): ProcRow[] {
  const rows: ProcRow[] = [];
  for (const line of stdout.split("\n")) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 3) continue;
    const [pid, ppid, rssKb] = parts.map(Number);
    if (!Number.isFinite(pid) || !Number.isFinite(ppid) || !Number.isFinite(rssKb)) continue;
    rows.push({ pid, ppid, rss: rssKb * 1024 });
  }
  return rows;
}

/** Soma o RSS de cada raiz com seus descendentes. Raiz que não existe mais fica de fora. */
export function memoryByRoot(rows: ProcRow[], roots: number[]): Record<number, number> {
  const byPid = new Map<number, ProcRow>();
  const children = new Map<number, number[]>();
  for (const row of rows) {
    byPid.set(row.pid, row);
    const list = children.get(row.ppid) ?? [];
    list.push(row.pid);
    children.set(row.ppid, list);
  }

  const result: Record<number, number> = {};
  for (const root of roots) {
    if (!byPid.has(root)) continue;
    let total = 0;
    const seen = new Set<number>();
    const stack = [root];
    while (stack.length > 0) {
      const pid = stack.pop()!;
      if (seen.has(pid)) continue; // ppid cíclico não pode virar laço infinito
      seen.add(pid);
      total += byPid.get(pid)?.rss ?? 0;
      for (const child of children.get(pid) ?? []) stack.push(child);
    }
    result[root] = total;
  }
  return result;
}

/** Lê a memória das árvores de processo dos pids informados. Falha silenciosa: métrica é acessório. */
export async function readProcessMemory(roots: number[]): Promise<Record<number, number>> {
  if (roots.length === 0) return {};
  try {
    const { stdout } = await execFileAsync("ps", ["-Ao", "pid=,ppid=,rss="], { timeout: 4000, maxBuffer: 4 * 1024 * 1024 });
    return memoryByRoot(parsePsOutput(stdout), roots);
  } catch {
    return {};
  }
}

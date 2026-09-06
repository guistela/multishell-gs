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
  /** Percentual de CPU do processo, como o `ps` reporta. */
  cpu: number;
}

export function parsePsOutput(stdout: string): ProcRow[] {
  const rows: ProcRow[] = [];
  for (const line of stdout.split("\n")) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 4) continue;
    const [pid, ppid, rssKb, cpu] = parts.map(Number);
    if (!Number.isFinite(pid) || !Number.isFinite(ppid) || !Number.isFinite(rssKb) || !Number.isFinite(cpu)) continue;
    rows.push({ pid, ppid, rss: rssKb * 1024, cpu });
  }
  return rows;
}

/** Soma um campo de cada raiz com seus descendentes. Raiz que não existe mais fica de fora. */
function sumByRoot(rows: ProcRow[], roots: number[], pick: (row: ProcRow) => number): Record<number, number> {
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
      const row = byPid.get(pid);
      if (row) total += pick(row);
      for (const child of children.get(pid) ?? []) stack.push(child);
    }
    result[root] = total;
  }
  return result;
}

export function memoryByRoot(rows: ProcRow[], roots: number[]): Record<number, number> {
  return sumByRoot(rows, roots, (r) => r.rss);
}

/** CPU somada da árvore: mostra que o agente está mesmo processando, não só quieto. */
export function cpuByRoot(rows: ProcRow[], roots: number[]): Record<number, number> {
  return sumByRoot(rows, roots, (r) => r.cpu);
}

/** Lê memória e CPU das árvores de processo. Falha silenciosa: métrica é acessório. */
export async function readProcessStats(
  roots: number[]
): Promise<{ memory: Record<number, number>; cpu: Record<number, number> }> {
  if (roots.length === 0) return { memory: {}, cpu: {} };
  try {
    const { stdout } = await execFileAsync("ps", ["-Ao", "pid=,ppid=,rss=,%cpu="], { timeout: 4000, maxBuffer: 4 * 1024 * 1024 });
    const rows = parsePsOutput(stdout);
    return { memory: memoryByRoot(rows, roots), cpu: cpuByRoot(rows, roots) };
  } catch {
    return { memory: {}, cpu: {} };
  }
}

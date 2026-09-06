import { describe, expect, it } from "vitest";
import { cpuByRoot, memoryByRoot, parsePsOutput } from "../process-memory";

/** Saída do `ps -Ao pid=,ppid=,rss=,%cpu=`: pid, ppid, RSS em KB e CPU em %. */
const PS = `
  100     1  10240   0.5
  200   100   5120  12.5
  300   200   2048   0.0
  400     1  99999  90.0
`;

describe("parsePsOutput", () => {
  it("lê pid, ppid e rss em bytes", () => {
    const rows = parsePsOutput(PS);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toEqual({ pid: 100, ppid: 1, rss: 10240 * 1024, cpu: 0.5 });
  });

  it("ignora linhas malformadas sem quebrar", () => {
    expect(parsePsOutput("lixo\n\n  1 2 3 4\n")).toEqual([{ pid: 1, ppid: 2, rss: 3 * 1024, cpu: 4 }]);
  });
});

describe("memoryByRoot", () => {
  const rows = parsePsOutput(PS);

  it("soma o processo e toda a árvore de filhos", () => {
    // 100 (10240K) + 200 (5120K) + 300 (2048K)
    expect(memoryByRoot(rows, [100])).toEqual({ 100: (10240 + 5120 + 2048) * 1024 });
  });

  it("cada raiz recebe só a própria árvore", () => {
    const result = memoryByRoot(rows, [100, 400]);
    expect(result[400]).toBe(99999 * 1024);
    expect(result[100]).toBe((10240 + 5120 + 2048) * 1024);
  });

  it("pid que já morreu fica de fora", () => {
    expect(memoryByRoot(rows, [999])).toEqual({});
  });

  it("não entra em laço com ciclo de ppid", () => {
    const ciclicos = [
      { pid: 1, ppid: 2, rss: 1024, cpu: 0 },
      { pid: 2, ppid: 1, rss: 1024, cpu: 0 },
    ];
    expect(memoryByRoot(ciclicos, [1])).toEqual({ 1: 2048 });
  });
});

describe("cpuByRoot", () => {
  const rows = parsePsOutput(PS);

  it("soma o uso de CPU da árvore inteira", () => {
    // 100 (0.5) + 200 (12.5) + 300 (0.0)
    expect(cpuByRoot(rows, [100])[100]).toBeCloseTo(13);
  });

  it("separa as árvores", () => {
    const r = cpuByRoot(rows, [100, 400]);
    expect(r[400]).toBeCloseTo(90);
  });

  it("pid morto fica de fora", () => {
    expect(cpuByRoot(rows, [999])).toEqual({});
  });
});

import { describe, expect, it } from "vitest";
import { memoryByRoot, parsePsOutput } from "../process-memory";

/** Saída típica do `ps -Ao pid=,ppid=,rss=`: pid, ppid e RSS em KB. */
const PS = `
  100     1  10240
  200   100   5120
  300   200   2048
  400     1  99999
`;

describe("parsePsOutput", () => {
  it("lê pid, ppid e rss em bytes", () => {
    const rows = parsePsOutput(PS);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toEqual({ pid: 100, ppid: 1, rss: 10240 * 1024 });
  });

  it("ignora linhas malformadas sem quebrar", () => {
    expect(parsePsOutput("lixo\n\n  1 2 3\n")).toEqual([{ pid: 1, ppid: 2, rss: 3 * 1024 }]);
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
      { pid: 1, ppid: 2, rss: 1024 },
      { pid: 2, ppid: 1, rss: 1024 },
    ];
    expect(memoryByRoot(ciclicos, [1])).toEqual({ 1: 2048 });
  });
});

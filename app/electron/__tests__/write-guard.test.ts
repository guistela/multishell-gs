import { beforeEach, describe, expect, it } from "vitest";
import { WriteGuard } from "../write-guard";

let guard: WriteGuard;

beforeEach(() => {
  guard = new WriteGuard();
});

describe("WriteGuard", () => {
  it("deixa passar digitação e comandos normais", () => {
    expect(guard.inspect("s1", "git status").allow).toBe("git status");
    const d = guard.inspect("s1", "\r");
    expect(d.allow).toBe("\r");
    expect(d.blocked).toBeUndefined();
  });

  it("bloqueia o Enter de um comando destrutivo e limpa a linha do shell", () => {
    guard.inspect("s1", "rm -rf /");
    const d = guard.inspect("s1", "\r");
    expect(d.blocked?.reason).toMatch(/Remoção recursiva/i);
    expect(d.blocked?.line).toBe("rm -rf /");
    expect(d.allow).toBe("\x15"); // kill-line: o shell não fica com o comando pendente
  });

  it("não deixa o comando bloqueado executar numa segunda tentativa de Enter", () => {
    guard.inspect("s1", "rm -rf ~");
    expect(guard.inspect("s1", "\r").blocked).toBeDefined();
    // A linha foi limpa: um Enter solto não executa nada perigoso.
    const again = guard.inspect("s1", "\r");
    expect(again.blocked).toBeUndefined();
    expect(again.allow).toBe("\r");
  });

  it("bloqueia linha destrutiva no meio de um texto colado, preservando o resto", () => {
    const d = guard.inspect("s1", "echo um\nrm -rf /\necho dois\n");
    expect(d.blocked?.line).toBe("rm -rf /");
    expect(d.allow).toContain("echo um\n");
    expect(d.allow).toContain("echo dois\n");
    expect(d.allow).not.toContain("rm -rf /\n");
  });

  it("acompanha backspace ao montar a linha", () => {
    guard.inspect("s1", "rm -rf /x");
    guard.inspect("s1", "\x7f");
    expect(guard.inspect("s1", "\r").blocked).toBeDefined();
  });

  it("Ctrl+C descarta a linha em montagem", () => {
    guard.inspect("s1", "rm -rf /");
    guard.inspect("s1", "\x03");
    expect(guard.inspect("s1", "\r").blocked).toBeUndefined();
  });

  it("mantém uma linha por sessão", () => {
    guard.inspect("s1", "rm -rf /");
    guard.inspect("s2", "git status");
    expect(guard.inspect("s2", "\r").blocked).toBeUndefined();
    expect(guard.inspect("s1", "\r").blocked).toBeDefined();
  });

  it("esquece a sessão encerrada", () => {
    guard.inspect("s1", "rm -rf /");
    guard.reset("s1");
    expect(guard.inspect("s1", "\r").blocked).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import { isCommandDestructive } from "../guardrail";

describe("guardrail.isCommandDestructive", () => {
  it("detecta rm -rf / e variações perigosas", () => {
    expect(isCommandDestructive("rm -rf /").dangerous).toBe(true);
    expect(isCommandDestructive("rm -rf /*").dangerous).toBe(true);
    expect(isCommandDestructive("rm -rf $HOME").dangerous).toBe(true);
    expect(isCommandDestructive("rm -rf ~").dangerous).toBe(true);
    expect(isCommandDestructive("rm -rf *").dangerous).toBe(true);
  });

  it("permite comandos normais de remoção e compilação", () => {
    expect(isCommandDestructive("rm -rf .build").dangerous).toBe(false);
    expect(isCommandDestructive("rm -rf node_modules").dangerous).toBe(false);
    expect(isCommandDestructive("pnpm test").dangerous).toBe(false);
    expect(isCommandDestructive("git status").dangerous).toBe(false);
  });

  it("detecta forkbomb", () => {
    expect(isCommandDestructive(":(){ :|:& };:").dangerous).toBe(true);
  });

  it("detecta comandos de disco e banco de dados destrutivos", () => {
    expect(isCommandDestructive("mkfs.ext4 /dev/sda1").dangerous).toBe(true);
    expect(isCommandDestructive("dd if=/dev/zero of=/dev/sda").dangerous).toBe(true);
    expect(isCommandDestructive("DROP DATABASE production;").dangerous).toBe(true);
  });
});

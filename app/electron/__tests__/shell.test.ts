import { describe, expect, it } from "vitest";
import { GIT_BASH, findGitBash, isBash, resolveShell } from "../shell.js";

const winEnv = {
  ProgramFiles: "C:\\Program Files",
  "ProgramFiles(x86)": "C:\\Program Files (x86)",
  LOCALAPPDATA: "C:\\Users\\f\\AppData\\Local",
  PATH: "C:\\Windows;C:\\Tools\\Git\\cmd",
};

describe("shell.findGitBash", () => {
  it("acha o bash.exe em Program Files", () => {
    const want = "C:\\Program Files\\Git\\bin\\bash.exe";
    expect(findGitBash(winEnv, (p) => p === want)).toBe(want);
  });

  it("acha a instalação por usuário em LOCALAPPDATA", () => {
    const want = "C:\\Users\\f\\AppData\\Local\\Programs\\Git\\bin\\bash.exe";
    expect(findGitBash(winEnv, (p) => p === want)).toBe(want);
  });

  it("acha pelo git.exe do PATH (pasta cmd ao lado de bin)", () => {
    const want = "C:\\Tools\\Git\\bin\\bash.exe";
    const files = new Set(["C:\\Tools\\Git\\cmd\\git.exe", want]);
    expect(findGitBash(winEnv, (p) => files.has(p))).toBe(want);
  });

  it("devolve null sem Git instalado", () => {
    expect(findGitBash(winEnv, () => false)).toBeNull();
  });
});

describe("shell.resolveShell", () => {
  const base = { os: "win32" as const, env: winEnv, exists: () => false, fallback: "pwsh.exe" };

  it("vazio ou null usa o shell padrão", () => {
    expect(resolveShell({ ...base, setting: null })).toBe("pwsh.exe");
    expect(resolveShell({ ...base, setting: "  " })).toBe("pwsh.exe");
  });

  it("git-bash usa o bash detectado", () => {
    const bash = "C:\\Program Files\\Git\\bin\\bash.exe";
    expect(resolveShell({ ...base, setting: GIT_BASH, exists: (p) => p === bash })).toBe(bash);
  });

  it("git-bash sem Git instalado cai no padrão", () => {
    expect(resolveShell({ ...base, setting: GIT_BASH })).toBe("pwsh.exe");
  });

  it("git-bash fora do Windows cai no padrão", () => {
    expect(resolveShell({ ...base, os: "darwin", setting: GIT_BASH, exists: () => true, fallback: "/bin/zsh" })).toBe("/bin/zsh");
  });

  it("caminho personalizado passa direto", () => {
    expect(resolveShell({ ...base, setting: " /bin/bash " })).toBe("/bin/bash");
  });
});

describe("shell.isBash", () => {
  it("reconhece bash por nome de arquivo", () => {
    expect(isBash("C:\\Program Files\\Git\\bin\\bash.exe")).toBe(true);
    expect(isBash("/bin/bash")).toBe(true);
    expect(isBash("/bin/zsh")).toBe(false);
    expect(isBash("pwsh.exe")).toBe(false);
  });
});

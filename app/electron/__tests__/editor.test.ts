import { describe, expect, it, vi } from "vitest";
import { editorCandidates, openInEditor } from "../editor";

function enoent(): Error & { code: string } {
  return Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" });
}

describe("editorCandidates", () => {
  it("no mac tenta `code` da PATH e depois o app pelo LaunchServices", () => {
    expect(editorCandidates("/p", "darwin", {})).toEqual([
      ["code", ["/p"]],
      ["open", ["-a", "Visual Studio Code", "/p"]],
    ]);
  });

  it("no windows usa o Code.exe instalado por usuário e por máquina", () => {
    const env = { LOCALAPPDATA: "C:\\Users\\x\\AppData\\Local", ProgramFiles: "C:\\Program Files" };
    const cmds = editorCandidates("C:\\p", "win32", env).map(([cmd]) => cmd);
    expect(cmds[0]).toMatch(/AppData[\\/]Local[\\/]Programs[\\/]Microsoft VS Code[\\/]Code\.exe$/);
    expect(cmds[1]).toMatch(/Program Files[\\/]Microsoft VS Code[\\/]Code\.exe$/);
  });

  it("no linux só `code`", () => {
    expect(editorCandidates("/p", "linux", {})).toEqual([["code", ["/p"]]]);
  });
});

describe("openInEditor", () => {
  it("devolve vazio quando o primeiro candidato abre", async () => {
    const spawn = vi.fn(async () => {});
    expect(await openInEditor("/p", { platform: "darwin", env: {}, spawn })).toBe("");
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(spawn).toHaveBeenCalledWith("code", ["/p"], {});
  });

  it("cai para o próximo candidato quando o binário não existe", async () => {
    const spawn = vi.fn().mockRejectedValueOnce(enoent()).mockResolvedValueOnce(undefined);
    expect(await openInEditor("/p", { platform: "darwin", env: {}, spawn })).toBe("");
    expect(spawn).toHaveBeenLastCalledWith("open", ["-a", "Visual Studio Code", "/p"], {});
  });

  it("explica quando nenhum candidato existe", async () => {
    const spawn = vi.fn().mockRejectedValue(enoent());
    expect(await openInEditor("/p", { platform: "linux", env: {}, spawn })).toMatch(/VS Code/);
  });

  it("outro erro interrompe e vira mensagem", async () => {
    const spawn = vi.fn().mockRejectedValue(new Error("EACCES"));
    expect(await openInEditor("/p", { platform: "darwin", env: {}, spawn })).toBe("EACCES");
    expect(spawn).toHaveBeenCalledTimes(1);
  });
});

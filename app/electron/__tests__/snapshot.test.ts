import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { SpaceSnapshotManager, collectGitChangedFiles } from "../snapshot";

describe("SpaceSnapshotManager", () => {
  it("cria e lista snapshots por espaço", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "multishell-snap-"));
    try {
      const manager = new SpaceSnapshotManager(tmp);
      const s1 = await manager.createSnapshot("space-1", "Antes da refatoração auth", [
        { relativePath: "src/auth.ts", content: "export const auth = true;" },
      ]);
      expect(s1.label).toBe("Antes da refatoração auth");
      expect(s1.fileCount).toBe(1);

      const list = await manager.listSnapshots("space-1");
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe(s1.id);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it("espaço sem snapshots devolve lista vazia sem lançar", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "multishell-snap-"));
    try {
      const manager = new SpaceSnapshotManager(tmp);
      const list = await manager.listSnapshots("inexistente");
      expect(list).toEqual([]);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});

/** Repositório git descartável: sem depender do git global do usuário. */
async function makeRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "multishell-git-"));
  const real = await fs.realpath(dir);
  const run = (args: string[]) =>
    new Promise<void>((resolve, reject) =>
      execFile("git", args, { cwd: real, env: { ...process.env, HOME: real, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" } }, (e) =>
        e ? reject(e) : resolve()
      )
    );
  await run(["init"]);
  await run(["config", "user.email", "t@t.dev"]);
  await run(["config", "user.name", "Teste"]);
  await fs.writeFile(path.join(real, "a.ts"), "const a = 1;\n", "utf8");
  await fs.writeFile(path.join(real, "b.ts"), "const b = 1;\n", "utf8");
  await run(["add", "."]);
  await run(["commit", "-m", "inicial"]);
  return real;
}

describe("collectGitChangedFiles", () => {
  it("captura só os arquivos rastreados que mudaram", async () => {
    const repo = await makeRepo();
    try {
      await fs.writeFile(path.join(repo, "a.ts"), "const a = 2;\n", "utf8");
      await fs.writeFile(path.join(repo, "novo.ts"), "não rastreado", "utf8");
      const capture = await collectGitChangedFiles({ cwd: repo });
      expect(capture.files.map((f) => f.relativePath)).toEqual(["a.ts"]);
      expect(capture.files[0].content).toBe("const a = 2;\n");
      expect(capture.truncated).toBe(false);
    } finally {
      await fs.rm(repo, { recursive: true, force: true });
    }
  });

  it("ignora binários e arquivos maiores que o limite", async () => {
    const repo = await makeRepo();
    try {
      await fs.writeFile(path.join(repo, "a.ts"), Buffer.from([0x41, 0x00, 0x42]));
      await fs.writeFile(path.join(repo, "b.ts"), "x".repeat(200), "utf8");
      const capture = await collectGitChangedFiles({ cwd: repo, maxBytes: 50 });
      expect(capture.files).toEqual([]);
      expect(capture.skipped).toHaveLength(2);
    } finally {
      await fs.rm(repo, { recursive: true, force: true });
    }
  });

  it("respeita o teto de arquivos e marca truncated", async () => {
    const repo = await makeRepo();
    try {
      await fs.writeFile(path.join(repo, "a.ts"), "const a = 2;\n", "utf8");
      await fs.writeFile(path.join(repo, "b.ts"), "const b = 2;\n", "utf8");
      const capture = await collectGitChangedFiles({ cwd: repo, maxFiles: 1 });
      expect(capture.files).toHaveLength(1);
      expect(capture.truncated).toBe(true);
    } finally {
      await fs.rm(repo, { recursive: true, force: true });
    }
  });

  it("pasta que não é repositório git dá erro explicando isso", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "multishell-nogit-"));
    try {
      await expect(collectGitChangedFiles({ cwd: tmp })).rejects.toThrow(/não é um repositório git/i);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it("cwd inexistente ou relativo é recusado antes de rodar o git", async () => {
    await expect(collectGitChangedFiles({ cwd: "relativo/x" })).rejects.toThrow(/caminho absoluto/i);
    await expect(collectGitChangedFiles({ cwd: "/nao/existe/mesmo-123" })).rejects.toThrow(/não existe/i);
  });
});

describe("SpaceSnapshotManager restore/delete", () => {
  it("restaura os arquivos do snapshot dentro do cwd informado", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "multishell-snap-"));
    const work = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "multishell-work-")));
    try {
      const manager = new SpaceSnapshotManager(tmp);
      const meta = await manager.createSnapshot("space-1", "antes", [
        { relativePath: "src/auth.ts", content: "antigo" },
      ]);
      await fs.mkdir(path.join(work, "src"), { recursive: true });
      await fs.writeFile(path.join(work, "src/auth.ts"), "novo", "utf8");

      const result = await manager.restoreSnapshot("space-1", meta.id, work);
      expect(result.restored).toBe(1);
      expect(await fs.readFile(path.join(work, "src/auth.ts"), "utf8")).toBe("antigo");
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
      await fs.rm(work, { recursive: true, force: true });
    }
  });

  it("recusa cwd relativo ou inexistente no restore", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "multishell-snap-"));
    try {
      const manager = new SpaceSnapshotManager(tmp);
      const meta = await manager.createSnapshot("space-1", "antes", [{ relativePath: "a.ts", content: "x" }]);
      await expect(manager.restoreSnapshot("space-1", meta.id, "relativo")).rejects.toThrow(/caminho absoluto/i);
      await expect(manager.restoreSnapshot("space-1", meta.id, "/nao/existe/mesmo-123")).rejects.toThrow(/não existe/i);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it("recusa relativePath com .. ou absoluto e id fora do formato", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "multishell-snap-"));
    try {
      const manager = new SpaceSnapshotManager(tmp);
      await expect(manager.createSnapshot("space-1", "x", [{ relativePath: "../fuga.ts", content: "x" }])).rejects.toThrow(/inválido/i);
      await expect(manager.createSnapshot("space-1", "x", [{ relativePath: "/etc/passwd", content: "x" }])).rejects.toThrow(/inválido/i);
      await expect(manager.listSnapshots("../outro")).rejects.toThrow(/inválido/i);
      await expect(manager.deleteSnapshot("space-1", "..")).rejects.toThrow(/inválido/i);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it("delete remove o snapshot da listagem", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "multishell-snap-"));
    try {
      const manager = new SpaceSnapshotManager(tmp);
      const meta = await manager.createSnapshot("space-1", "antes", [{ relativePath: "a.ts", content: "x" }]);
      await manager.deleteSnapshot("space-1", meta.id);
      expect(await manager.listSnapshots("space-1")).toEqual([]);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it("restore de snapshot inexistente dá erro claro", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "multishell-snap-"));
    const work = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "multishell-work-")));
    try {
      const manager = new SpaceSnapshotManager(tmp);
      await expect(manager.restoreSnapshot("space-1", "11111111-1111-1111-1111-111111111111", work)).rejects.toThrow(/snapshot não existe/i);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
      await fs.rm(work, { recursive: true, force: true });
    }
  });
});

describe("safeRelativePath entre plataformas", () => {
  it("aceita separador do Windows como separador, não como parte do nome", async () => {
    const { safeRelativePath } = await import("../snapshot");
    expect(safeRelativePath("src\\auth.ts", "win32")).toBe("src/auth.ts");
    expect(safeRelativePath("src/auth.ts", "win32")).toBe("src/auth.ts");
  });

  it("guarda sempre em formato posix, para o snapshot atravessar plataformas", async () => {
    const { safeRelativePath } = await import("../snapshot");
    expect(safeRelativePath("a/b/c.ts", "darwin")).toBe("a/b/c.ts");
  });

  it("recusa subir de diretório em qualquer plataforma", async () => {
    const { safeRelativePath } = await import("../snapshot");
    for (const os of ["win32", "darwin"] as const) {
      expect(() => safeRelativePath("../fora.ts", os)).toThrow(/inválido/);
      expect(() => safeRelativePath("src/../../fora.ts", os)).toThrow(/inválido/);
    }
    expect(() => safeRelativePath("src\\..\\..\\fora.ts", "win32")).toThrow(/inválido/);
  });

  it("recusa caminho absoluto, inclusive com letra de unidade", async () => {
    const { safeRelativePath } = await import("../snapshot");
    expect(() => safeRelativePath("/etc/passwd", "darwin")).toThrow(/inválido/);
    expect(() => safeRelativePath("C:\\Windows\\system32", "win32")).toThrow(/inválido/);
    expect(() => safeRelativePath("\\\\servidor\\share", "win32")).toThrow(/inválido/);
  });

  it("no unix a barra invertida continua sendo caractere comum de nome", async () => {
    const { safeRelativePath } = await import("../snapshot");
    expect(safeRelativePath("nome\\estranho.ts", "darwin")).toBe("nome\\estranho.ts");
  });
});

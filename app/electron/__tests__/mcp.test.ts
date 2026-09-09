import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { buildMcpManifest, syncSpaceMcpConfig, type McpServerConfig } from "../mcp";

describe("MCP Manager", () => {
  const sampleServers: McpServerConfig[] = [
    {
      id: "1",
      name: "sqlite",
      command: "uvx",
      args: ["mcp-server-sqlite", "--db-path", "/data/app.db"],
      enabled: true,
    },
    {
      id: "2",
      name: "github",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      env: { GITHUB_PERSONAL_ACCESS_TOKEN: "mock-token" },
      enabled: true,
    },
    {
      id: "3",
      name: "postgres",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-postgres"],
      enabled: false,
    },
  ];

  it("buildMcpManifest gera formato padrão MCP e ignora desabilitados", () => {
    const manifest = buildMcpManifest(sampleServers);
    expect(Object.keys(manifest.mcpServers)).toEqual(["sqlite", "github"]);
    expect(manifest.mcpServers.sqlite.command).toBe("uvx");
    expect(manifest.mcpServers.github.env?.GITHUB_PERSONAL_ACCESS_TOKEN).toBe("mock-token");
  });

  it("syncSpaceMcpConfig grava .mcp.json no disco do espaço", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "multishell-mcp-"));
    try {
      const file = await syncSpaceMcpConfig(tmp, sampleServers);
      expect(path.basename(file)).toBe(".mcp.json");
      const content = JSON.parse(await fs.readFile(file, "utf8"));
      expect(content.mcpServers.sqlite).toBeDefined();
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});

describe("destino do manifesto", () => {
  it("mcpTargetFile usa .mcp.json na pasta do projeto quando o espaço tem base_path", async () => {
    const { mcpTargetFile } = await import("../mcp");
    expect(mcpTargetFile("/root/espaco", "/Users/gs/projeto")).toBe(path.join("/Users/gs/projeto", ".mcp.json"));
  });

  it("mcpTargetFile cai na raiz do espaço quando não há pasta de projeto", async () => {
    const { mcpTargetFile } = await import("../mcp");
    expect(mcpTargetFile("/root/espaco", null)).toBe(path.join("/root/espaco", ".mcp.json"));
  });
});

describe("buildMcpManifest: nomes perigosos", () => {
  const server = (name: string) => ({ id: name, name, command: "node", args: [], enabled: true });

  it("ignora nome que polui o protótipo", () => {
    const manifest = buildMcpManifest([server("__proto__"), server("ok")]);
    expect(Object.keys(manifest.mcpServers)).toEqual(["ok"]);
    expect(({} as any).command).toBeUndefined();
  });

  it("ignora constructor e prototype", () => {
    expect(Object.keys(buildMcpManifest([server("constructor"), server("prototype")]).mcpServers)).toEqual([]);
  });
});

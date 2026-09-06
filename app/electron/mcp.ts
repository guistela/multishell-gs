// Gerenciador de Servidores MCP (Model Context Protocol) por Espaço.
// Gera a configuração mcp.json / claude_desktop_config.json dentro do diretório do espaço.

import * as fs from "node:fs/promises";
import * as path from "node:path";

export interface McpServerConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  enabled: boolean;
}

export interface McpManifest {
  mcpServers: Record<string, {
    command: string;
    args: string[];
    env?: Record<string, string>;
  }>;
}

/** Converte lista de servidores MCP para o formato oficial Claude/MCP JSON. */
export function buildMcpManifest(servers: McpServerConfig[]): McpManifest {
  const manifest: McpManifest = { mcpServers: {} };
  for (const s of servers) {
    if (!s.enabled) continue;
    manifest.mcpServers[s.name] = {
      command: s.command,
      args: s.args,
      ...(s.env && Object.keys(s.env).length > 0 ? { env: s.env } : {}),
    };
  }
  return manifest;
}

/**
 * Onde o manifesto é gravado. `.mcp.json` na pasta do projeto é o escopo que os
 * harnesses leem; sem pasta de projeto, fica na raiz do espaço.
 */
export function mcpTargetFile(spaceDir: string, projectDir: string | null): string {
  return path.join(projectDir || spaceDir, ".mcp.json");
}

/** Sincroniza o manifesto MCP no destino do espaço. Devolve o caminho gravado. */
export async function syncSpaceMcpConfig(
  spaceDir: string,
  servers: McpServerConfig[],
  projectDir: string | null = null
): Promise<string> {
  const manifest = buildMcpManifest(servers);
  const targetFile = mcpTargetFile(spaceDir, projectDir);
  await fs.mkdir(path.dirname(targetFile), { recursive: true });
  await fs.writeFile(targetFile, JSON.stringify(manifest, null, 2), "utf8");
  return targetFile;
}

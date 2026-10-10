import { describe, expect, it } from "vitest";
import { EXPORT_FORMAT, buildExport, mergeImport, parseExport, type TransferData } from "../settings-transfer.js";
import { normalizeSpace } from "../space.js";
import { normalizeProvider } from "../provider.js";

const space = normalizeSpace({
  id: "s1", name: "Cliente", directory_name: "cliente", base_path: "/Users/a/proj",
  custom_env: [{ key: "REGION", value: "sa-east-1", is_secret: false }, { key: "TOKEN", value: "vazou", is_secret: true }],
});
const provider = normalizeProvider({
  id: "p1", name: "Claude", executable: "claude",
  extra_env: [{ key: "API_KEY", value: "sk-123", is_secret: true }, { key: "MODE", value: "x", is_secret: false }],
});
const data: TransferData = {
  spaces: [space],
  providers: [provider],
  layouts: { s1: "grid" },
  mcp: { s1: [{ id: "m1", name: "github", command: "npx", args: ["gh-mcp"], env: { GITHUB_TOKEN: "ghp_x" }, enabled: true }] },
  settings: { shell: "/bin/bash", default_cwd: "/Users/a", font_family: "Menlo", font_size: 14, theme: "nord", language: "en" },
};
const meta = { appVersion: "0.1.12", now: new Date("2026-10-09T12:00:00Z") };

describe("settings-transfer.buildExport", () => {
  it("leva formato, versão e data", () => {
    const f = buildExport(data, meta);
    expect(f.format).toBe(EXPORT_FORMAT);
    expect(f.version).toBe(1);
    expect(f.exported_at).toBe("2026-10-09T12:00:00.000Z");
    expect(f.app_version).toBe("0.1.12");
  });

  it("nunca leva valor de segredo", () => {
    const text = JSON.stringify(buildExport(data, meta));
    for (const secret of ["vazou", "sk-123", "ghp_x"]) expect(text).not.toContain(secret);
    const f = buildExport(data, meta);
    expect(f.spaces[0].custom_env).toContainEqual({ key: "REGION", value: "sa-east-1", is_secret: false });
    expect(f.providers[0].extra_env).toContainEqual({ key: "MODE", value: "x", is_secret: false });
    expect(f.mcp_servers.s1[0].env).toEqual({ GITHUB_TOKEN: "" });
  });

  it("leva só a aparência das configurações, sem shell e pasta da máquina", () => {
    expect(buildExport(data, meta).settings).toEqual({ font_family: "Menlo", font_size: 14, theme: "nord", language: "en" });
  });
});

describe("settings-transfer.parseExport", () => {
  it("lê o próprio export", () => {
    const f = buildExport(data, meta);
    expect(parseExport(JSON.stringify(f))).toEqual(f);
  });

  it("recusa arquivo que não é do Multishell ou de versão futura", () => {
    expect(() => parseExport("não é json")).toThrow(/JSON/);
    expect(() => parseExport(JSON.stringify({ format: "outro", version: 1 }))).toThrow(/Multishell/);
    expect(() => parseExport(JSON.stringify({ ...buildExport(data, meta), version: 2 }))).toThrow(/versão/);
  });
});

describe("settings-transfer.mergeImport", () => {
  const empty: TransferData = { spaces: [], providers: [], layouts: {}, mcp: {}, settings: null };
  const isDir = () => true;

  it("adiciona itens novos e o importado vence no mesmo id", () => {
    const current: TransferData = { ...empty, spaces: [{ ...space, name: "Antigo" }, normalizeSpace({ id: "s9", name: "Outro", directory_name: "outro" })] };
    const out = mergeImport(current, buildExport(data, meta), { isDir });
    expect(out.spaces.map((s) => [s.id, s.name])).toEqual([["s1", "Cliente"], ["s9", "Outro"]]);
    expect(out.providers.map((p) => p.id)).toEqual(["p1"]);
    expect(out.layouts).toEqual({ s1: "grid" });
  });

  it("mantém segredo existente quando o importado vem vazio", () => {
    const current: TransferData = { ...empty, mcp: data.mcp };
    const out = mergeImport(current, buildExport(data, meta), { isDir });
    expect(out.mcp.s1[0].env).toEqual({ GITHUB_TOKEN: "ghp_x" });
  });

  it("preserva shell e pasta da máquina e troca só a aparência", () => {
    const current: TransferData = { ...empty, settings: { shell: "git-bash", default_cwd: "C:\\dev", font_family: "Consolas", font_size: 12, theme: "dark", language: "pt-BR" } };
    const out = mergeImport(current, buildExport(data, meta), { isDir });
    expect(out.settings).toEqual({ shell: "git-bash", default_cwd: "C:\\dev", font_family: "Menlo", font_size: 14, theme: "nord", language: "en" });
  });

  it("descarta pasta base que não existe nesta máquina", () => {
    const out = mergeImport(empty, buildExport(data, meta), { isDir: () => false });
    expect(out.spaces[0].base_path).toBeNull();
  });

  it("gera directory_name seguro quando o arquivo traz caminho ou conflito", () => {
    const f = buildExport(data, meta);
    f.spaces = [{ ...f.spaces[0], id: "s2", directory_name: "../../etc" }];
    const current: TransferData = { ...empty, spaces: [normalizeSpace({ id: "s3", name: "Cliente", directory_name: "cliente" })] };
    const out = mergeImport(current, f, { isDir });
    const imported = out.spaces.find((s) => s.id === "s2")!;
    expect(imported.directory_name).toBe("cliente-2");
  });

  it("mantém o directory_name atual quando o espaço já existe", () => {
    const current: TransferData = { ...empty, spaces: [{ ...space, directory_name: "cliente-local" }] };
    const out = mergeImport(current, buildExport(data, meta), { isDir });
    expect(out.spaces[0].directory_name).toBe("cliente-local");
  });
});

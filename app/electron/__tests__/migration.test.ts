import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  appleDateToIso,
  cleanAgentSuffix,
  convert,
  migrateFromSwift,
  migrationPresets,
  swiftPlistPath,
  writeConverted,
  type Converted,
} from "../migration.js";
import { presets } from "../provider.js";

const PERSONAL = "00000000-0000-0000-0000-000000000001";
const WORK = "00000000-0000-0000-0000-000000000002";

const PROFILES = `[
  {"customEnv":[{"id":"A","key":"FOO","value":"bar"}],"name":"Pessoal","id":"00000000-0000-0000-0000-000000000001","directoryName":"personal","createdAt":806564577.154394,"colorHex":"#FF6482"},
  {"customEnv":[],"name":"Trabalho","id":"00000000-0000-0000-0000-000000000002","directoryName":"work","createdAt":806564577.154395,"colorHex":"#32ADE6"}
]`;

const SESSIONS = `[
  {"profileId":"00000000-0000-0000-0000-000000000001","theme":"Homebrew","colorHex":"#3BD3FE","id":"CD612849-9490-4A81-91E6-9D09A65B8DCF","bypassMode":true,"isRunning":true,"currentDirectory":"/Users/test/workspace","createdAt":808109049.4,"title":"Alpha - Claude Pessoal","activeAgent":"Claude Pessoal"},
  {"profileId":"00000000-0000-0000-0000-000000000002","theme":"Basic","colorHex":"#3BD3FE","id":"E62C89B2-5722-45B1-9716-8FE73EF12AD5","bypassMode":false,"title":"Beta - Claude Peers","activeAgent":"Claude Peers"},
  {"profileId":"00000000-0000-0000-0000-000000000001","theme":"Basic","colorHex":"#3BD3FE","id":"11111111-1111-1111-1111-111111111111","bypassMode":false,"title":"G - Antigravity Gemini","activeAgent":"Antigravity Gemini"},
  {"profileId":"00000000-0000-0000-0000-000000000001","theme":"Basic","colorHex":"#3BD3FE","id":"22222222-2222-2222-2222-222222222222","bypassMode":true,"title":"AC - Antigravity Claude","activeAgent":"Antigravity Claude"},
  {"profileId":"00000000-0000-0000-0000-000000000001","theme":"Basic","colorHex":"#3BD3FE","id":"33333333-3333-3333-3333-333333333333","bypassMode":false,"title":"Cx - Codex Pessoal","activeAgent":"Codex Pessoal"},
  {"environment":"peers","theme":"Basic","colorHex":"#3BD3FE","id":"44444444-4444-4444-4444-444444444444","title":"Legado"}
]`;

const BOOKMARKS = `[
  {"id":"55555555-5555-5555-5555-555555555555","title":"Fav","workingDirectory":"/tmp","initialCommand":"ls","colorHex":"#123456","themeRaw":"Ocean","profileId":"00000000-0000-0000-0000-000000000002"}
]`;

function sample(): Record<string, unknown> {
  return {
    shellProfiles: Buffer.from(PROFILES),
    activeSessions: Buffer.from(SESSIONS),
    terminalBookmarks: Buffer.from(BOOKMARKS),
    defaultShell: "/bin/zsh",
    defaultPath: "/Users/test/Projects",
    terminalTheme: "Solarized",
    fontSize: 13,
  };
}

function idOf(c: Converted, name: string): string | null {
  return c.providers.find((p) => p.name === name)?.id ?? null;
}

describe("migration.convert", () => {
  it("profiles viram spaces com segurança de migração", () => {
    const c = convert(sample(), migrationPresets());
    expect(c.spaces).toHaveLength(2);
    const p = c.spaces[0];
    expect(p.id).toBe(PERSONAL);
    expect(p.name).toBe("Pessoal");
    expect(p.color_hex).toBe("#FF6482");
    expect(p.directory_name).toBe("personal");
    expect(p.custom_env).toEqual([{ key: "FOO", value: "bar", is_secret: false }]);
    expect(p.security).toEqual({
      load_user_shell_profile: true,
      share_keychain: true,
      share_ssh: false,
      share_git_config: false,
      inherit_process_env: false,
    });
    expect(p.created_at).toBe("2026-07-24T05:42:57Z");
  });

  it("AgentType mapeia para provider e limpa sufixo", () => {
    const c = convert(sample(), migrationPresets());
    expect(c.sessions).toHaveLength(6);

    const s = c.sessions[0];
    expect(s.id).toBe("cd612849-9490-4a81-91e6-9d09a65b8dcf");
    expect(s.title).toBe("Alpha");
    expect(s.space_id).toBe(PERSONAL);
    expect(s.provider_id).toBe(idOf(c, "Claude Code"));
    expect(s.bypass).toBe(true);
    expect(s.cwd).toBe("/Users/test/workspace");
    expect(s.harness_running).toBe(false);

    expect(c.sessions[1].title).toBe("Beta");
    expect(c.sessions[1].provider_id).toBe(idOf(c, "Claude Code"));
    expect(c.sessions[2].provider_id).toBe(idOf(c, "Antigravity"));
    expect(c.sessions[3].provider_id).toBe(idOf(c, "Antigravity (Claude)"));
    expect(c.sessions[3].title).toBe("AC");
    expect(c.sessions[4].provider_id).toBe(idOf(c, "Codex"));

    // legado: environment=peers sem profileId → Trabalho, sem provider
    expect(c.sessions[5].space_id).toBe(WORK);
    expect(c.sessions[5].provider_id).toBeNull();
    expect(c.sessions[5].cwd).toBeNull();
    expect(c.notes).toEqual([]);
  });

  it("preset Antigravity (Claude) tem model e bypass; presets espelham provider.ts", () => {
    const list = migrationPresets();
    expect(list.map((p) => p.name)).toEqual(["Claude Code", "Codex", "Antigravity", "Antigravity (Claude)", "Cursor"]);
    const p = list.find((p) => p.name === "Antigravity (Claude)")!;
    expect(p.executable).toBe("agy");
    expect(p.args).toEqual(["--model", "Claude Sonnet 4.6 (Thinking)"]);
    expect(p.bypass_args).toEqual(["--dangerously-skip-permissions"]);
    const base = presets().find((x) => x.name === "Claude Code")!;
    const mine = list.find((x) => x.name === "Claude Code")!;
    expect(mine.resume_args).toEqual(base.resume_args);
    expect(mine.config_env_key).toBe(base.config_env_key);
  });

  it("bookmarks e settings", () => {
    const c = convert(sample(), migrationPresets());
    expect(c.bookmarks).toHaveLength(1);
    const b = c.bookmarks[0];
    expect(b.working_directory).toBe("/tmp");
    expect(b.theme).toBe("Ocean");
    expect(b.space_id).toBe(WORK);
    expect(b.color_hex).toBe("#123456");

    expect(c.settings.shell).toBe("/bin/zsh");
    expect(c.settings.default_cwd).toBe("/Users/test/Projects");
    expect(c.settings.font_family).toBe("SF Mono");
    expect(c.settings.font_size).toBe(13);
    expect(c.settings.theme).toBe("Solarized");
    expect(c.settings.language).toBe("pt-BR");
  });

  it("valores em string também são aceitos", () => {
    const v = sample();
    v.shellProfiles = PROFILES;
    const c = convert(v, migrationPresets());
    expect(c.spaces).toHaveLength(2);
  });

  it("plist vazio gera settings default e listas vazias", () => {
    const c = convert({}, migrationPresets());
    expect(c.spaces).toEqual([]);
    expect(c.sessions).toEqual([]);
    expect(c.bookmarks).toEqual([]);
    expect(c.settings).toEqual({ shell: null, default_cwd: null, font_family: "SF Mono", font_size: 12, theme: "Basic", language: "pt-BR" });
  });

  it("JSON inválido gera nota e não falha", () => {
    const v = sample();
    v.activeSessions = Buffer.from("nope");
    const c = convert(v, migrationPresets());
    expect(c.sessions).toEqual([]);
    expect(c.notes.some((n) => n.startsWith("activeSessions"))).toBe(true);
  });

  it("agente desconhecido e provider ausente geram notas", () => {
    const v = sample();
    v.activeSessions = Buffer.from(
      JSON.stringify([
        { id: "A", title: "T - Zed", activeAgent: "Zed", profileId: PERSONAL },
        { id: "B", title: "U", activeAgent: "Codex Pessoal", profileId: PERSONAL },
      ]),
    );
    const c = convert(v, migrationPresets().filter((p) => p.name !== "Codex"));
    expect(c.sessions[0].provider_id).toBeNull();
    expect(c.sessions[1].provider_id).toBeNull();
    expect(c.notes.some((n) => n.includes('agente desconhecido "Zed"'))).toBe(true);
    expect(c.notes.some((n) => n.includes('provider "Codex" não encontrado'))).toBe(true);
  });

  it("cleanAgentSuffix cobre todos os agentes", () => {
    expect(cleanAgentSuffix("X - Codex Peers")).toBe("X");
    expect(cleanAgentSuffix("X - Antigravity")).toBe("X");
    expect(cleanAgentSuffix("X - Claude Pessoal")).toBe("X");
    expect(cleanAgentSuffix("Sem sufixo")).toBe("Sem sufixo");
  });

  it("appleDateToIso converte para RFC3339", () => {
    expect(appleDateToIso(0)).toBe("2001-01-01T00:00:00Z");
    expect(appleDateToIso(806564577.154394)).toBe("2026-07-24T05:42:57Z");
  });
});

describe("migration em disco", () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "multishell-mig-"));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("swiftPlistPath fica em Library/Preferences do HOME real", () => {
    expect(swiftPlistPath()).toMatch(/Library[\\/]Preferences[\\/]com\.multishell\.app\.plist$/);
    expect(swiftPlistPath()).not.toContain(".multishell/profiles");
  });

  it("plist ausente retorna report vazio com nota", async () => {
    const r = await migrateFromSwift(dir, path.join(dir, "nao-existe.plist"));
    expect([r.spaces, r.providers, r.sessions]).toEqual([0, 0, 0]);
    expect(r.notes).toHaveLength(1);
    expect(fs.existsSync(path.join(dir, "spaces.json"))).toBe(false);
  });

  it("writeConverted grava arquivos e não sobrescreve", async () => {
    const c = convert(sample(), migrationPresets());
    const r = await writeConverted(dir, c);
    expect([r.spaces, r.providers, r.sessions]).toEqual([2, 5, 6]);
    expect(r.notes).toEqual([]);

    const spaces = JSON.parse(fs.readFileSync(path.join(dir, "spaces.json"), "utf8"));
    expect(spaces).toHaveLength(2);
    const ui = JSON.parse(fs.readFileSync(path.join(dir, "ui-state.json"), "utf8"));
    expect(ui.selectedSessionId).toBeNull();
    expect(ui.sessions).toHaveLength(6);
    expect(ui.sessions[0]).toEqual({
      id: "cd612849-9490-4a81-91e6-9d09a65b8dcf",
      title: "Alpha",
      space_id: PERSONAL,
      provider_id: idOf(c, "Claude Code"),
      bypass: true,
      cwd: "/Users/test/workspace",
      harness_running: false,
    });
    const settings = JSON.parse(fs.readFileSync(path.join(dir, "settings.json"), "utf8"));
    expect(settings.font_size).toBe(13);
    const bookmarks = JSON.parse(fs.readFileSync(path.join(dir, "bookmarks.json"), "utf8"));
    expect(bookmarks).toHaveLength(1);
    const providers = JSON.parse(fs.readFileSync(path.join(dir, "providers.json"), "utf8"));
    expect(providers).toHaveLength(5);

    // segunda rodada: nada gravado, notas "já migrado"
    const r2 = await writeConverted(dir, c);
    expect([r2.spaces, r2.providers, r2.sessions]).toEqual([0, 0, 0]);
    expect(r2.notes.filter((n) => n.includes("já migrado"))).toHaveLength(5);
  });

  it("arquivo vazio conta como não migrado", async () => {
    fs.writeFileSync(path.join(dir, "spaces.json"), "  \n");
    const r = await writeConverted(dir, convert(sample(), migrationPresets()));
    expect(r.spaces).toBe(2);
  });

  const hasPlutil = process.platform === "darwin" && fs.existsSync("/usr/bin/plutil");

  function writeBinaryPlist(file: string, entries: Record<string, { type: "data" | "string" | "integer" | "real"; value: string }>): void {
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const body = Object.entries(entries)
      .map(([k, v]) => {
        const val = v.type === "data" ? Buffer.from(v.value).toString("base64") : esc(v.value);
        return `<key>${esc(k)}</key><${v.type}>${val}</${v.type}>`;
      })
      .join("");
    fs.writeFileSync(
      file,
      `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict>${body}</dict></plist>`,
    );
    execFileSync("plutil", ["-convert", "binary1", file]);
  }

  it.skipIf(!hasPlutil)("migrateFromSwift lê plist binário, grava e reaproveita providers", async () => {
    const plist = path.join(dir, "swift.plist");
    writeBinaryPlist(plist, {
      shellProfiles: { type: "data", value: PROFILES },
      activeSessions: { type: "data", value: SESSIONS },
      terminalTheme: { type: "string", value: "Solarized" },
      fontSize: { type: "integer", value: "13" },
    });

    const r = await migrateFromSwift(dir, plist);
    expect([r.spaces, r.providers, r.sessions]).toEqual([2, 5, 6]);
    expect(r.notes).toEqual([]);

    const settings = JSON.parse(fs.readFileSync(path.join(dir, "settings.json"), "utf8"));
    expect(settings.font_size).toBe(13);
    expect(settings.theme).toBe("Solarized");
    const bookmarks = JSON.parse(fs.readFileSync(path.join(dir, "bookmarks.json"), "utf8"));
    expect(bookmarks).toEqual([]);
    const providers = JSON.parse(fs.readFileSync(path.join(dir, "providers.json"), "utf8"));
    const claudeId = providers.find((p: { name: string }) => p.name === "Claude Code").id;
    const ui = JSON.parse(fs.readFileSync(path.join(dir, "ui-state.json"), "utf8"));
    expect(ui.sessions[0].provider_id).toBe(claudeId);

    // segunda rodada: ids dos providers existentes são reaproveitados; nada regravado
    fs.rmSync(path.join(dir, "ui-state.json"));
    const r2 = await migrateFromSwift(dir, plist);
    expect([r2.spaces, r2.providers, r2.sessions]).toEqual([0, 0, 6]);
    expect(r2.notes.filter((n) => n.includes("já migrado"))).toHaveLength(4);
    const ui2 = JSON.parse(fs.readFileSync(path.join(dir, "ui-state.json"), "utf8"));
    expect(ui2.sessions[0].provider_id).toBe(claudeId);
  });

  it.skipIf(!hasPlutil)("plist corrompido gera erro", async () => {
    const plist = path.join(dir, "ruim.plist");
    fs.writeFileSync(plist, "isso não é um plist");
    await expect(migrateFromSwift(dir, plist)).rejects.toThrow(/plist/);
  });
});

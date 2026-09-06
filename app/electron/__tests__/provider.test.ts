import { describe, expect, it } from "vitest";
import {
  command,
  commandLine,
  normalizeProvider,
  presets,
  resumeCommand,
  resumeLine,
  slug,
  type Provider,
} from "../provider.js";

function make(name: string, executable: string, extra: Partial<Provider> = {}): Provider {
  return normalizeProvider({ id: crypto.randomUUID(), name, executable, ...extra });
}

describe("provider.command", () => {
  it("sem bypass não inclui bypass_args", () => {
    const p = make("X", "claude", { bypass_args: ["--dangerously-skip-permissions"] });
    expect(command(p, false)).toEqual(["claude"]);
  });

  it("com bypass inclui bypass_args depois dos args", () => {
    const p = make("X", "agy", {
      args: ["--model", "Claude Sonnet"],
      bypass_args: ["--dangerously-skip-permissions"],
    });
    expect(command(p, true)).toEqual(["agy", "--model", "Claude Sonnet", "--dangerously-skip-permissions"]);
  });

  it("commandLine cita args com espaço", () => {
    const p = make("X", "agy", { args: ["--model", "Claude Sonnet"] });
    expect(commandLine(p, false)).toBe("agy --model 'Claude Sonnet'");
  });

  it("commandLine escapa aspas simples e args vazios", () => {
    const p = make("X", "x", { args: ["it's", ""] });
    expect(commandLine(p, false)).toBe("x 'it'\\''s' ''");
  });
});

describe("provider.presets", () => {
  it("tem claude, codex, antigravity e cursor nessa ordem", () => {
    expect(presets().map((p) => p.name)).toEqual(["Claude Code", "Codex", "Antigravity", "Cursor"]);
  });

  it("tem executáveis, bypass e config_env_key do contrato", () => {
    const by = Object.fromEntries(presets().map((p) => [p.name, p]));
    expect(by["Claude Code"].executable).toBe("claude");
    expect(by["Claude Code"].bypass_args).toEqual(["--dangerously-skip-permissions"]);
    expect(by["Claude Code"].config_env_key).toBe("CLAUDE_CONFIG_DIR");
    expect(by["Codex"].executable).toBe("codex");
    expect(by["Codex"].bypass_args).toEqual(["--dangerously-bypass-approvals-and-sandbox"]);
    expect(by["Codex"].config_env_key).toBe("CODEX_HOME");
    expect(by["Antigravity"].executable).toBe("agy");
    expect(by["Antigravity"].config_env_key).toBeNull();
    expect(by["Cursor"].executable).toBe("cursor-agent");
    expect(by["Cursor"].bypass_args).toEqual(["--force"]);
  });

  it("tem resume_args esperados", () => {
    const get = (n: string) => presets().find((p) => p.name === n)!.resume_args;
    expect(get("Claude Code")).toEqual(["--continue"]);
    expect(get("Codex")).toEqual(["resume", "--last"]);
    expect(get("Cursor")).toEqual(["--resume"]);
    expect(get("Antigravity")).toEqual(["--continue"]);
  });

  it("gera ids UUID v4 únicos a cada chamada", () => {
    const a = presets();
    const b = presets();
    const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    for (const p of a) expect(p.id).toMatch(uuidV4);
    expect(new Set([...a, ...b].map((p) => p.id)).size).toBe(a.length + b.length);
  });
});

describe("provider.resume", () => {
  it("resumeCommand insere resume_args antes do bypass", () => {
    const p = make("X", "claude", {
      args: ["--model", "opus"],
      resume_args: ["--continue"],
      bypass_args: ["--dangerously-skip-permissions"],
    });
    expect(resumeCommand(p, true)).toEqual(["claude", "--model", "opus", "--continue", "--dangerously-skip-permissions"]);
    expect(resumeCommand(p, false)).toEqual(["claude", "--model", "opus", "--continue"]);
  });

  it("sem resume_args é igual ao command", () => {
    const p = make("X", "custom", { bypass_args: ["--dangerously-skip-permissions"] });
    expect(resumeCommand(p, true)).toEqual(command(p, true));
    expect(resumeLine(p, false)).toBe(commandLine(p, false));
  });

  it("resumeLine cita args com espaço", () => {
    const p = make("X", "codex", { args: ["--profile", "meu perfil"], resume_args: ["resume", "--last"] });
    expect(resumeLine(p, false)).toBe("codex --profile 'meu perfil' resume --last");
  });
});

describe("provider.slug", () => {
  it("normaliza nome", () => {
    expect(slug("Claude Code")).toBe("claude-code");
    expect(slug("  Antigravity (Claude) ")).toBe("antigravity-claude");
    expect(slug("!!!")).toBe("provider");
  });
});

describe("provider.normalizeProvider", () => {
  it("JSON sem resume_args desserializa vazio", () => {
    const p = normalizeProvider(JSON.parse('{"id":"6f1c1b3e-0d1f-4e0a-9d47-2f3e6b0c1a11","name":"H","executable":"h"}'));
    expect(p.resume_args).toEqual([]);
  });

  it("roundtrip JSON com campos opcionais ausentes", () => {
    const p = normalizeProvider(
      JSON.parse('{"id":"6f1c1b3e-0d1f-4e0a-9d47-2f3e6b0c1a11","name":"Meu Harness","executable":"/opt/bin/meu"}'),
    );
    expect(command(p, true)).toEqual(["/opt/bin/meu"]);
    expect(p.config_env_key).toBeNull();
    expect(p.extra_env).toEqual([]);
    expect(p.icon).toBe("terminal");
  });

  it("extra_env sem is_secret vira false", () => {
    const p = normalizeProvider({ id: "x", name: "n", executable: "e", extra_env: [{ key: "K", value: "v" }] });
    expect(p.extra_env).toEqual([{ key: "K", value: "v", is_secret: false }]);
  });

  it("rejeita valores que não são objeto", () => {
    expect(() => normalizeProvider(null)).toThrow();
    expect(() => normalizeProvider("x")).toThrow();
  });
});

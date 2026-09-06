import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  PERSONAL_ID,
  WORK_ID,
  buildSpawnPlan,
  defaultSpaces,
  makeDirectoryName,
  materialize,
  normalizeSpace,
  ps1Content,
  spaceRoot,
  spacesRoot,
  stripSpaceHome,
  zshenvContent,
  zshrcContent,
  type BuildOpts,
  type Space,
} from "../space.js";
import { normalizeProvider, type Provider } from "../provider.js";

function spaceFechado(): Space {
  return normalizeSpace({ id: "10000000-0000-4000-8000-000000000001", name: "Cliente X", color_hex: "#000000", directory_name: "cliente-x" });
}

function prov(name: string, executable: string, extra: Partial<Provider> = {}): Provider {
  return normalizeProvider({ id: crypto.randomUUID(), name, executable, ...extra });
}

const noSecret: BuildOpts["resolveSecret"] = () => null;

function opts(over: Partial<BuildOpts> = {}): BuildOpts {
  return {
    space: spaceFechado(),
    provider: null,
    cwd: null,
    realHome: "/Users/fulano",
    os: "darwin",
    userShell: "/bin/zsh",
    processEnv: { PATH: "/Users/fulano/.nvm/bin:/usr/bin" },
    resolveSecret: noSecret,
    ...over,
  };
}

describe("space.stripSpaceHome", () => {
  it("remove prefixo de espaço", () => {
    expect(stripSpaceHome("/Users/mockuser/.multishell/profiles/personal")).toBe("/Users/mockuser");
    expect(stripSpaceHome("/Users/mockuser")).toBe("/Users/mockuser");
  });

  it("não remove quando profiles é a última pasta", () => {
    expect(stripSpaceHome("/Users/mockuser/.multishell/profiles")).toBe("/Users/mockuser/.multishell/profiles");
  });

  it("funciona com caminho windows", () => {
    expect(stripSpaceHome("C:\\Users\\mockuser\\.multishell\\profiles\\work")).toBe("C:\\Users\\mockuser");
  });
});

describe("space.defaults", () => {
  it("security default tudo false", () => {
    const s = normalizeSpace({ id: "a", name: "n", directory_name: "n" }).security;
    expect(s).toEqual({
      load_user_shell_profile: false,
      share_keychain: false,
      share_ssh: false,
      share_git_config: false,
      inherit_process_env: false,
    });
  });

  it("defaults tem ids fixos e portas de migração", () => {
    const d = defaultSpaces();
    expect(d[0].id).toBe(PERSONAL_ID);
    expect(d[0].id).toBe("00000000-0000-0000-0000-000000000001");
    expect(d[0].name).toBe("Pessoal");
    expect(d[0].directory_name).toBe("personal");
    expect(d[0].color_hex).toBe("#FF6482");
    expect(d[1].id).toBe(WORK_ID);
    expect(d[1].id).toBe("00000000-0000-0000-0000-000000000002");
    expect(d[1].name).toBe("Trabalho");
    expect(d[1].directory_name).toBe("work");
    expect(d[1].color_hex).toBe("#32ADE6");
    expect(d[0].security.load_user_shell_profile && d[0].security.share_keychain).toBe(true);
    expect(d[0].security.share_ssh).toBe(false);
    expect(d[0].created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("space.makeDirectoryName", () => {
  it("slug de directory_name", () => {
    expect(makeDirectoryName("Peers Consulting", [])).toBe("peers-consulting");
    expect(makeDirectoryName("  Ação!! Épica  ", [])).toBe("acao-epica");
    expect(makeDirectoryName("###", [])).toBe("profile");
    expect(makeDirectoryName("Work", ["work"])).toBe("work-2");
    expect(makeDirectoryName("Work", ["work", "work-2"])).toBe("work-3");
  });
});

describe("space.buildSpawnPlan (mac)", () => {
  it("env fechado não contém HOME real exceto PATH", () => {
    const root = "/Users/fulano/.multishell/profiles/cliente-x";
    const plan = buildSpawnPlan(opts());
    expect(plan.env.HOME).toBe(root);
    expect(plan.env.ZDOTDIR).toBe(`${root}/.zsh`);
    expect(plan.inherit_env).toBe(false);
    for (const [k, v] of Object.entries(plan.env)) {
      if (k === "PATH") continue;
      expect(!v.startsWith("/Users/fulano/") || v.startsWith(root), `${k}=${v} vaza HOME real`).toBe(true);
    }
    expect(plan.env.PATH).toContain("/Users/fulano/.nvm/bin");
    expect(plan.env.PATH.startsWith("/opt/homebrew/bin:/usr/local/bin:")).toBe(true);
    expect(plan.env.MULTISHELL_SPACE).toBe("cliente-x");
    expect(plan.env.GH_CONFIG_DIR).toBe(`${root}/.config/gh`);
    expect(plan.env.KUBECONFIG).toBe(`${root}/.kube/config`);
    expect(plan.env.XDG_CONFIG_HOME).toBe(`${root}/.config`);
    expect(plan.env.CLOUDSDK_CONFIG).toBe(`${root}/.config/gcloud`);
    expect(plan.env.FIREBASE_CONFIG_DIR).toBe(`${root}/.config/configstore`);
    expect(plan.env.DOCKER_CONFIG).toBe(`${root}/.docker`);
    expect(plan.env.NPM_CONFIG_USERCONFIG).toBe(`${root}/.npmrc`);
    expect(plan.shell).toBe("/bin/zsh");
    expect(plan.shell_args).toEqual([]);
    // Sem base_path e sem default_cwd, começa no home real do usuário — não na pasta do perfil.
    expect(plan.cwd).toBe("/Users/fulano");
  });

  it("PATH sem PATH do processo termina sem lixo", () => {
    const plan = buildSpawnPlan(opts({ processEnv: {} }));
    expect(plan.env.PATH).toBe("/opt/homebrew/bin:/usr/local/bin:");
  });

  it("provider config_env_key aponta para dentro da raiz", () => {
    const p = prov("Claude Code", "claude", {
      config_env_key: "CLAUDE_CONFIG_DIR",
      extra_env: [{ key: "FOO", value: "bar", is_secret: false }],
    });
    const plan = buildSpawnPlan(opts({ provider: p }));
    expect(plan.env.CLAUDE_CONFIG_DIR).toBe("/Users/fulano/.multishell/profiles/cliente-x/providers/claude-code");
    expect(plan.env.FOO).toBe("bar");
  });

  it("segredo ausente não quebra e presente entra", () => {
    const s = spaceFechado();
    s.custom_env = [
      { key: "MISSING", value: "", is_secret: true },
      { key: "TOKEN", value: "", is_secret: true },
      { key: "PLAIN", value: "v", is_secret: false },
    ];
    const seen: string[] = [];
    const resolveSecret: BuildOpts["resolveSecret"] = (sid, key) => {
      seen.push(`${sid}:${key}`);
      return key === "TOKEN" ? "s3cr3t" : null;
    };
    const plan = buildSpawnPlan(opts({ space: s, resolveSecret }));
    expect("MISSING" in plan.env).toBe(false);
    expect(plan.env.TOKEN).toBe("s3cr3t");
    expect(plan.env.PLAIN).toBe("v");
    expect(seen).toEqual([`${s.id}:MISSING`, `${s.id}:TOKEN`]);
  });

  it("extra_env secreto do provider resolve pelo space_id", () => {
    const p = prov("P", "p", { extra_env: [{ key: "API", value: "", is_secret: true }] });
    const plan = buildSpawnPlan(opts({ provider: p, resolveSecret: (_sid, key) => (key === "API" ? "k" : null) }));
    expect(plan.env.API).toBe("k");
  });

  it("chave vazia em custom_env é ignorada", () => {
    const s = spaceFechado();
    s.custom_env = [{ key: "  ", value: "x", is_secret: false }];
    const plan = buildSpawnPlan(opts({ space: s }));
    expect(Object.keys(plan.env).some((k) => k.trim() === "")).toBe(false);
  });

  it("inherit_process_env vira inherit_env", () => {
    const s = spaceFechado();
    s.security.inherit_process_env = true;
    expect(buildSpawnPlan(opts({ space: s })).inherit_env).toBe(true);
  });

  it("sem cwd usa a pasta base do espaço", () => {
    const plan = buildSpawnPlan(opts({ cwd: null, space: { ...spaceFechado(), base_path: "/projetos/app" } }));
    expect(plan.cwd).toBe("/projetos/app");
  });

  it("sem cwd e sem pasta base cai no default_cwd das configurações", () => {
    expect(buildSpawnPlan(opts({ cwd: null, defaultCwd: "/Users/fulano/dev" })).cwd).toBe("/Users/fulano/dev");
  });

  it("a pasta base do espaço tem prioridade sobre o default_cwd", () => {
    const plan = buildSpawnPlan(opts({ cwd: null, defaultCwd: "/Users/fulano/dev", space: { ...spaceFechado(), base_path: "/projetos/app" } }));
    expect(plan.cwd).toBe("/projetos/app");
  });

  it("nunca começa na pasta de perfil do espaço", () => {
    const plan = buildSpawnPlan(opts({ cwd: null }));
    expect(plan.cwd).not.toBe(plan.env.HOME);
  });

  it("cwd passa direto", () => {
    expect(buildSpawnPlan(opts({ cwd: "/tmp/x" })).cwd).toBe("/tmp/x");
  });
});

describe("space.buildSpawnPlan (windows)", () => {
  it("tem USERPROFILE, APPDATA e ps1", () => {
    const root = "C:\\Users\\fulano\\.multishell\\profiles\\cliente-x";
    const plan = buildSpawnPlan(
      opts({ realHome: "C:\\Users\\fulano", os: "win32", userShell: "pwsh.exe", cwd: "C:\\proj", processEnv: { PATH: "C:\\bin" } }),
    );
    expect(plan.env.USERPROFILE).toBe(root);
    expect(plan.env.HOME).toBe(root);
    expect(plan.env.APPDATA).toBe(`${root}\\AppData\\Roaming`);
    expect(plan.env.LOCALAPPDATA).toBe(`${root}\\AppData\\Local`);
    expect(plan.env.PATH).toBe("C:\\bin");
    expect(plan.shell).toBe("pwsh.exe");
    expect(plan.shell_args.slice(0, 3)).toEqual(["-NoLogo", "-NoExit", "-File"]);
    expect(plan.shell_args[3]).toBe(`${root}\\multishell-profile.ps1`);
    expect(plan.cwd).toBe("C:\\proj");
    expect("ZDOTDIR" in plan.env).toBe(false);
  });

  it("usa Path quando PATH não existe no processo", () => {
    const plan = buildSpawnPlan(opts({ realHome: "C:\\Users\\f", os: "win32", processEnv: { Path: "C:\\x" } }));
    expect(plan.env.PATH).toBe("C:\\x");
  });
});

describe("space rc files", () => {
  it("zshrc sem load_user_profile não faz source do real", () => {
    const closed = zshrcContent(spaceFechado(), "/Users/fulano");
    expect(closed).not.toContain("/Users/fulano/.zshrc");
    expect(closed).toContain('export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"');
    expect(closed).toContain("$HOME/.zshrc.local");

    const open = spaceFechado();
    open.security.load_user_shell_profile = true;
    expect(zshrcContent(open, "/Users/fulano")).toContain('source "/Users/fulano/.zshrc"');
  });

  it("zshrc emite OSC 7 no precmd", () => {
    const c = zshrcContent(spaceFechado(), "/Users/fulano");
    expect(c).toContain("]7;file://");
    expect(c).toContain("precmd");
    expect(c).toContain(`printf '\\e]7;file://%s%s\\a' "$HOST" "$PWD"`);
  });

  it("zshenv carrega .zshenv.local", () => {
    expect(zshenvContent(spaceFechado())).toContain("$HOME/.zshenv.local");
  });

  it("ps1 só carrega profile do usuário quando habilitado", () => {
    expect(ps1Content(spaceFechado(), "C:\\Users\\fulano")).not.toContain("profile.ps1");
    const open = spaceFechado();
    open.security.load_user_shell_profile = true;
    expect(ps1Content(open, "C:\\Users\\fulano")).toContain("Documents\\PowerShell\\profile.ps1");
  });

  it("ps1 emite OSC 7 na função prompt e escapa aspas do home", () => {
    const c = ps1Content(spaceFechado(), "C:\\Users\\o'neil");
    expect(c).toContain("]7;file://");
    expect(c).toMatch(/function prompt/);
    expect(c).toContain("$env:USERPROFILE_REAL = 'C:\\Users\\o''neil'");
  });
});

describe("space.materialize", () => {
  let tmp: string;
  let savedHome: string | undefined;
  let savedUserProfile: string | undefined;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "multishell-space-"));
    savedHome = process.env.HOME;
    savedUserProfile = process.env.USERPROFILE;
    process.env.HOME = path.join(tmp, "home");
    process.env.USERPROFILE = path.join(tmp, "home");
  });

  afterEach(() => {
    if (savedHome === undefined) delete process.env.HOME;
    else process.env.HOME = savedHome;
    if (savedUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = savedUserProfile;
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("spaceRoot fica sob <realHome>/.multishell/profiles", () => {
    expect(spacesRoot()).toBe(path.join(tmp, "home", ".multishell", "profiles"));
    expect(spaceRoot(spaceFechado())).toBe(path.join(tmp, "home", ".multishell", "profiles", "cliente-x"));
    const s = spaceFechado();
    s.directory_name = "";
    expect(() => spaceRoot(s)).toThrow();
  });

  it.skipIf(process.platform === "win32")("cria rc e symlinks conforme política", async () => {
    const realHome = path.join(tmp, "home");
    fs.mkdirSync(path.join(realHome, "Library", "Keychains"), { recursive: true });
    fs.mkdirSync(path.join(realHome, ".ssh"), { recursive: true });
    const s = spaceFechado();
    s.security.share_keychain = true;
    s.security.share_ssh = true;
    const p = prov("Claude Code", "claude", { config_env_key: "CLAUDE_CONFIG_DIR" });
    const root = spaceRoot(s);

    await materialize(s, p, realHome, "darwin");
    expect(fs.statSync(path.join(root, ".zsh", ".zshrc")).isFile()).toBe(true);
    expect(fs.statSync(path.join(root, ".zsh", ".zshenv")).isFile()).toBe(true);
    expect(fs.readFileSync(path.join(root, ".zsh", ".zshrc"), "utf8")).toContain("]7;file://");
    expect(fs.statSync(path.join(root, "providers", "claude-code")).isDirectory()).toBe(true);
    expect(fs.lstatSync(path.join(root, "Library", "Keychains")).isSymbolicLink()).toBe(true);
    expect(fs.readlinkSync(path.join(root, "Library", "Keychains"))).toBe(path.join(realHome, "Library", "Keychains"));
    expect(fs.lstatSync(path.join(root, ".ssh")).isSymbolicLink()).toBe(true);
    expect(fs.existsSync(path.join(root, ".gitconfig"))).toBe(false);
    for (const d of [".config/gcloud", ".config/gh", ".config/configstore", ".local/share", ".local/state", ".cache", ".docker", ".kube"]) {
      expect(fs.statSync(path.join(root, d)).isDirectory(), d).toBe(true);
    }

    // Idempotente com symlink já correto.
    await materialize(s, p, realHome, "darwin");
    expect(fs.lstatSync(path.join(root, ".ssh")).isSymbolicLink()).toBe(true);

    // Fecha as portas: symlinks somem, pasta real fica.
    s.security.share_keychain = false;
    s.security.share_ssh = false;
    await materialize(s, null, realHome, "darwin");
    expect(fs.existsSync(path.join(root, "Library", "Keychains"))).toBe(false);
    expect(() => fs.lstatSync(path.join(root, ".ssh"))).toThrow();
    expect(fs.statSync(path.join(realHome, ".ssh")).isDirectory(), "pasta real não pode ser apagada").toBe(true);
  });

  it.skipIf(process.platform === "win32")("nunca sobrescreve pasta real do espaço com symlink", async () => {
    const realHome = path.join(tmp, "home");
    fs.mkdirSync(path.join(realHome, ".ssh"), { recursive: true });
    const s = spaceFechado();
    const root = spaceRoot(s);
    fs.mkdirSync(path.join(root, ".ssh"), { recursive: true });
    fs.writeFileSync(path.join(root, ".ssh", "id_space"), "x");
    s.security.share_ssh = true;
    await materialize(s, null, realHome, "darwin");
    expect(fs.lstatSync(path.join(root, ".ssh")).isSymbolicLink()).toBe(false);
    expect(fs.existsSync(path.join(root, ".ssh", "id_space"))).toBe(true);

    // Desligar não apaga a pasta real.
    s.security.share_ssh = false;
    await materialize(s, null, realHome, "darwin");
    expect(fs.existsSync(path.join(root, ".ssh", "id_space"))).toBe(true);
  });

  it.skipIf(process.platform === "win32")("symlink apontando para alvo errado é refeito", async () => {
    const realHome = path.join(tmp, "home");
    fs.mkdirSync(path.join(realHome, ".ssh"), { recursive: true });
    const s = spaceFechado();
    const root = spaceRoot(s);
    fs.mkdirSync(root, { recursive: true });
    fs.symlinkSync(path.join(tmp, "outro"), path.join(root, ".ssh"));
    s.security.share_ssh = true;
    await materialize(s, null, realHome, "darwin");
    expect(fs.readlinkSync(path.join(root, ".ssh"))).toBe(path.join(realHome, ".ssh"));
  });

  it("linux não cria Library nem symlink de keychain", async () => {
    const realHome = path.join(tmp, "home");
    const s = spaceFechado();
    s.security.share_keychain = true;
    await materialize(s, null, realHome, "linux");
    expect(fs.existsSync(path.join(spaceRoot(s), "Library"))).toBe(false);
    expect(fs.existsSync(path.join(spaceRoot(s), ".zsh", ".zshrc"))).toBe(true);
  });

  it("windows grava multishell-profile.ps1 e pastas AppData", async () => {
    const realHome = path.join(tmp, "home");
    const s = spaceFechado();
    await materialize(s, null, realHome, "win32");
    const root = spaceRoot(s);
    expect(fs.readFileSync(path.join(root, "multishell-profile.ps1"), "utf8")).toContain("]7;file://");
    expect(fs.statSync(path.join(root, "AppData", "Roaming")).isDirectory()).toBe(true);
    expect(fs.statSync(path.join(root, "AppData", "Local")).isDirectory()).toBe(true);
    expect(fs.statSync(path.join(root, "Documents", "PowerShell")).isDirectory()).toBe(true);
    expect(fs.existsSync(path.join(root, ".zsh"))).toBe(false);
  });
});

describe("space.normalizeSpace", () => {
  it("JSON snake_case com security parcial", () => {
    const s = normalizeSpace(
      JSON.parse(
        '{"id":"00000000-0000-0000-0000-000000000009","name":"X","color_hex":"#111111","directory_name":"x","custom_env":[],"security":{"share_ssh":true},"created_at":"2026-01-01T00:00:00Z"}',
      ),
    );
    expect(s.security.share_ssh).toBe(true);
    expect(s.security.share_keychain).toBe(false);
    expect(JSON.stringify(s)).toContain('"load_user_shell_profile":false');
  });

  it("defaults para campos ausentes", () => {
    const s = normalizeSpace({ id: "a", name: "N" });
    expect(s.color_hex).toBe("#00E5FF");
    expect(s.directory_name).toBe("");
    expect(s.custom_env).toEqual([]);
    expect(s.created_at).toMatch(/^\d{4}-/);
  });
});


describe("space base path", () => {
  it("uses the base folder without changing credential isolation", () => {
    const space = { ...spaceFechado(), base_path: "/projects/cliente x" };
    const plan = buildSpawnPlan(opts({ space }));
    expect(plan.cwd).toBe("/projects/cliente x");
    expect(plan.env.HOME).not.toBe(plan.cwd);
    expect(plan.env.HOME).toContain(".multishell/profiles/cliente-x");
  });
  it("restored session cwd wins over the base folder", () => {
    expect(buildSpawnPlan(opts({ space: { ...spaceFechado(), base_path: "/projects" }, cwd: "/projects/subdir" })).cwd).toBe("/projects/subdir");
  });
});

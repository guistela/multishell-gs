import { describe, expect, it } from "vitest";
import { RELEASES_PAGE, compareVersions, isReleaseUrl, latestUpdate, pickAssetUrl } from "../updates.js";

const assets = [
  { name: "Multishell-0.2.0-mac-arm64.dmg", browser_download_url: "https://github.com/guistela/multishell-gs/releases/download/v0.2.0/Multishell-0.2.0-mac-arm64.dmg" },
  { name: "Multishell-0.2.0-mac-x64.dmg", browser_download_url: "https://github.com/guistela/multishell-gs/releases/download/v0.2.0/Multishell-0.2.0-mac-x64.dmg" },
  { name: "Multishell-0.2.0-win-x64.exe", browser_download_url: "https://github.com/guistela/multishell-gs/releases/download/v0.2.0/Multishell-0.2.0-win-x64.exe" },
];
const release = { tag_name: "v0.2.0", html_url: "https://github.com/guistela/multishell-gs/releases/tag/v0.2.0", draft: false, prerelease: false, assets };

describe("updates.compareVersions", () => {
  it("compara por número, não por texto", () => {
    expect(compareVersions("0.1.10", "0.1.9")).toBeGreaterThan(0);
    expect(compareVersions("v0.2.0", "0.1.11")).toBeGreaterThan(0);
    expect(compareVersions("0.1.11", "v0.1.11")).toBe(0);
    expect(compareVersions("1.0.0", "1.0.1")).toBeLessThan(0);
  });

  it("pré-release vale menos que a versão final", () => {
    expect(compareVersions("1.0.0-beta.1", "1.0.0")).toBeLessThan(0);
  });
});

describe("updates.pickAssetUrl", () => {
  it("escolhe o instalador do SO e da CPU", () => {
    expect(pickAssetUrl(release, "darwin", "arm64")).toMatch(/mac-arm64\.dmg$/);
    expect(pickAssetUrl(release, "darwin", "x64")).toMatch(/mac-x64\.dmg$/);
    expect(pickAssetUrl(release, "win32", "x64")).toMatch(/win-x64\.exe$/);
  });

  it("sem asset compatível abre a página do release", () => {
    expect(pickAssetUrl(release, "linux", "x64")).toBe(release.html_url);
  });
});

describe("updates.latestUpdate", () => {
  const base = { current: "0.1.11", platform: "darwin" as const, arch: "arm64", ignored: null };

  it("avisa quando o release é mais novo", () => {
    expect(latestUpdate({ ...base, release })).toEqual({
      version: "0.2.0",
      download_url: assets[0].browser_download_url,
      release_url: release.html_url,
    });
  });

  it("não avisa na mesma versão, em versão ignorada, draft ou prerelease", () => {
    expect(latestUpdate({ ...base, current: "0.2.0", release })).toBeNull();
    expect(latestUpdate({ ...base, ignored: "0.2.0", release })).toBeNull();
    expect(latestUpdate({ ...base, release: { ...release, draft: true } })).toBeNull();
    expect(latestUpdate({ ...base, release: { ...release, prerelease: true } })).toBeNull();
  });

  it("ignora resposta malformada", () => {
    expect(latestUpdate({ ...base, release: null })).toBeNull();
    expect(latestUpdate({ ...base, release: { message: "API rate limit" } })).toBeNull();
  });

  it("descarta URL fora do repositório", () => {
    const evil = { ...release, html_url: "https://evil.example/x", assets: [{ name: "Multishell-0.2.0-mac-arm64.dmg", browser_download_url: "https://evil.example/x.dmg" }] };
    expect(latestUpdate({ ...base, release: evil })).toEqual({ version: "0.2.0", download_url: RELEASES_PAGE, release_url: RELEASES_PAGE });
  });
});

describe("updates.isReleaseUrl", () => {
  it("aceita só URL https do repositório", () => {
    expect(isReleaseUrl(RELEASES_PAGE)).toBe(true);
    expect(isReleaseUrl(assets[0].browser_download_url)).toBe(true);
    expect(isReleaseUrl("https://github.com/guistela/multishell-gs-evil/releases")).toBe(false);
    expect(isReleaseUrl("http://github.com/guistela/multishell-gs/releases")).toBe(false);
    expect(isReleaseUrl("file:///etc/passwd")).toBe(false);
  });
});

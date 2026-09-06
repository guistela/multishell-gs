import { mkdtempSync, existsSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Store, loadFrom, saveTo, validateName } from "../store";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "multishell-store-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("validateName", () => {
  it("rejeita separadores, .. e vazio", () => {
    expect(() => validateName("a/b")).toThrow();
    expect(() => validateName("a\\b")).toThrow();
    expect(() => validateName("..")).toThrow();
    expect(() => validateName("")).toThrow();
    expect(() => validateName("ui-state")).not.toThrow();
  });
});

describe("store", () => {
  it("get sem arquivo retorna null", () => {
    expect(loadFrom(dir, "x")).toBeNull();
  });

  it("set e get fazem round-trip e não deixam .tmp", () => {
    const value = { a: 1, b: ["x"] };
    saveTo(dir, "ui-state", value);
    expect(loadFrom(dir, "ui-state")).toEqual(value);
    expect(existsSync(join(dir, "ui-state.json"))).toBe(true);
    expect(readdirSync(dir).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });

  it("cria o diretório se não existir", () => {
    const nested = join(dir, "a", "b");
    const store = new Store(nested);
    store.set("spaces", []);
    expect(store.get("spaces")).toEqual([]);
  });

  it("arquivo vazio conta como null", () => {
    writeFileSync(join(dir, "empty.json"), "  \n");
    expect(loadFrom(dir, "empty")).toBeNull();
  });

  it("nome inválido lança em get e set", () => {
    const store = new Store(dir);
    expect(() => store.get("../x")).toThrow(/inválido/);
    expect(() => store.set("a/b", 1)).toThrow(/inválido/);
  });
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  MemoryStore,
  SERVICE,
  accountName,
  deleteIn,
  getIn,
  secretDelete,
  secretGet,
  secretGetValue,
  secretSet,
  setIn,
  setSecretStore,
  type SecretStore,
} from "../secrets.js";

describe("secrets.accountName", () => {
  it("usa space_id e key", () => {
    expect(accountName("abc", "TOKEN")).toBe("abc:TOKEN");
    expect(SERVICE).toBe("multishell");
  });
});

describe("secrets com MemoryStore", () => {
  it("roundtrip set/get/delete", () => {
    const store = new MemoryStore();
    expect(getIn(store, "s1", "TOKEN")).toBeNull();
    setIn(store, "s1", "TOKEN", "segredo");
    expect(getIn(store, "s1", "TOKEN")).toBe("segredo");
    deleteIn(store, "s1", "TOKEN");
    expect(getIn(store, "s1", "TOKEN")).toBeNull();
  });

  it("segredos são isolados por space", () => {
    const store = new MemoryStore();
    setIn(store, "s1", "TOKEN", "a");
    setIn(store, "s2", "TOKEN", "b");
    expect(getIn(store, "s1", "TOKEN")).toBe("a");
    expect(getIn(store, "s2", "TOKEN")).toBe("b");
  });

  it("delete de inexistente não falha", () => {
    const store = new MemoryStore();
    expect(() => deleteIn(store, "s1", "NADA")).not.toThrow();
  });

  it("rejeita space_id ou key vazios", () => {
    const store = new MemoryStore();
    expect(() => setIn(store, "", "K", "v")).toThrow(/space_id/);
    expect(() => setIn(store, "s", "  ", "v")).toThrow(/key/);
    expect(() => getIn(store, "", "K")).toThrow();
    expect(() => deleteIn(store, "s", "")).toThrow();
  });
});

describe("secrets API pública com store injetado", () => {
  let mem: MemoryStore;
  beforeEach(() => {
    mem = new MemoryStore();
    setSecretStore(mem);
  });
  afterEach(() => {
    setSecretStore(new MemoryStore());
  });

  it("secretSet / secretGet / secretDelete usam o store injetado", () => {
    secretSet("s1", "K", "v");
    expect(mem.get("s1:K")).toBe("v");
    expect(secretGet("s1", "K")).toBe("v");
    secretDelete("s1", "K");
    expect(secretGet("s1", "K")).toBeNull();
  });

  it("secretGetValue devolve null em vez de lançar", () => {
    const broken: SecretStore = {
      get() {
        throw new Error("keyring travado");
      },
      set() {},
      delete() {},
    };
    setSecretStore(broken);
    expect(secretGetValue("s1", "K")).toBeNull();
    expect(secretGetValue("", "K")).toBeNull();
    expect(() => secretGet("s1", "K")).toThrow(/keyring travado/);
  });
});

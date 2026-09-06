// Segredos por espaço via keyring (Keychain no mac, Credential Manager no windows).
//
// Service: `multishell`. Account: `<space_id>:<KEY>`.
// O acesso ao SO passa pela interface `SecretStore`, para que os testes rodem
// com `MemoryStore` sem tocar no keyring real.
// Módulo puro (sem `electron`).

import { Entry } from "@napi-rs/keyring";

export const SERVICE = "multishell";

export interface SecretStore {
  get(account: string): string | null;
  set(account: string, v: string): void;
  delete(account: string): void;
}

export function accountName(spaceId: string, key: string): string {
  return `${spaceId}:${key}`;
}

// ---------- MemoryStore (testes) ----------

export class MemoryStore implements SecretStore {
  private data = new Map<string, string>();

  get(account: string): string | null {
    return this.data.get(account) ?? null;
  }

  set(account: string, v: string): void {
    this.data.set(account, v);
  }

  delete(account: string): void {
    this.data.delete(account);
  }
}

// ---------- KeyringStore (SO) ----------

export class KeyringStore implements SecretStore {
  get(account: string): string | null {
    return new Entry(SERVICE, account).getPassword() ?? null;
  }

  set(account: string, v: string): void {
    new Entry(SERVICE, account).setPassword(v);
  }

  delete(account: string): void {
    // `false` = não existia; não é erro.
    new Entry(SERVICE, account).deleteCredential();
  }
}

// ---------- Operações genéricas ----------

function validate(spaceId: string, key: string): void {
  if (spaceId.trim() === "") throw new Error("space_id vazio");
  if (key.trim() === "") throw new Error("key vazia");
}

export function setIn(store: SecretStore, spaceId: string, key: string, value: string): void {
  validate(spaceId, key);
  store.set(accountName(spaceId, key), value);
}

export function getIn(store: SecretStore, spaceId: string, key: string): string | null {
  validate(spaceId, key);
  return store.get(accountName(spaceId, key));
}

export function deleteIn(store: SecretStore, spaceId: string, key: string): void {
  validate(spaceId, key);
  store.delete(accountName(spaceId, key));
}

// ---------- API pública (store injetável) ----------

let current: SecretStore | null = null;

/** Injeta o store (testes). Sem injeção, usa o keyring do SO. */
export function setSecretStore(s: SecretStore): void {
  current = s;
}

function store(): SecretStore {
  if (!current) current = new KeyringStore();
  return current;
}

/** Usado por space.ts para resolver `custom_env` com `is_secret = true`.
 *  Nunca lança: segredo inacessível vira `null`. */
export function secretGetValue(spaceId: string, key: string): string | null {
  try {
    return getIn(store(), spaceId, key);
  } catch {
    return null;
  }
}

export function secretGet(spaceId: string, key: string): string | null {
  return getIn(store(), spaceId, key);
}

export function secretSet(spaceId: string, key: string, value: string): void {
  setIn(store(), spaceId, key, value);
}

export function secretDelete(spaceId: string, key: string): void {
  deleteIn(store(), spaceId, key);
}

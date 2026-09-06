// Persistência JSON em `<dir>/<name>.json`. Porta de src-tauri/src/store.rs.
// Não importa `electron`: o diretório é injetado (main passa app.getPath("userData")).
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/** Nome de arquivo permitido: sem separadores nem `..`. */
export function validateName(name: string): void {
  if (!name) throw new Error("nome de store vazio");
  if (name.includes("/") || name.includes("\\") || name.includes("..")) {
    throw new Error(`nome de store inválido: ${name}`);
  }
}

function filePath(dir: string, name: string): string {
  validateName(name);
  return join(dir, `${name}.json`);
}

export function loadFrom<T = unknown>(dir: string, name: string): T | null {
  const path = filePath(dir, name);
  if (!existsSync(path)) return null;
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (e) {
    throw new Error(`ler ${path}: ${(e as Error).message}`);
  }
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as T;
  } catch (e) {
    throw new Error(`parse ${path}: ${(e as Error).message}`);
  }
}

/** Gravação atômica: escreve em `.tmp` e renomeia por cima. */
export function saveTo(dir: string, name: string, value: unknown): void {
  const path = filePath(dir, name);
  mkdirSync(dir, { recursive: true });
  const tmp = join(dir, `${name}.json.tmp`);
  writeFileSync(tmp, JSON.stringify(value, null, 2));
  renameSync(tmp, path);
}

export class Store {
  constructor(readonly dir: string) {}
  get<T = unknown>(name: string): T | null {
    return loadFrom<T>(this.dir, name);
  }
  set(name: string, value: unknown): void {
    saveTo(this.dir, name, value);
  }
}

export const storeGet = <T = unknown>(dir: string, name: string): T | null => loadFrom<T>(dir, name);
export const storeSet = (dir: string, name: string, value: unknown): void => saveTo(dir, name, value);

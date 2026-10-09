#!/usr/bin/env node
// Confere se cada Multishell.app em release/ traz o binário nativo do @napi-rs/keyring
// da MESMA arquitetura do executável. Sem isso o app quebra ao abrir com
// "Cannot find native binding".
//
// Uso: node scripts/check-native-bindings.mjs [release]
import { existsSync, openSync, readSync, closeSync, readdirSync } from "node:fs";
import { join } from "node:path";

const CPU = { 0x01000007: "x64", 0x0100000c: "arm64" };
const MH_MAGIC_64 = 0xfeedfacf;
const FAT_MAGIC = 0xcafebabe;

// Lê o cabeçalho Mach-O e devolve as arquiteturas do executável.
function machoArchs(file) {
  const fd = openSync(file, "r");
  const buf = Buffer.alloc(4096);
  readSync(fd, buf, 0, buf.length, 0);
  closeSync(fd);
  const magic = buf.readUInt32LE(0);
  if (magic === MH_MAGIC_64) return [CPU[buf.readUInt32LE(4)] ?? "desconhecida"];
  if (buf.readUInt32BE(0) === FAT_MAGIC) {
    const n = buf.readUInt32BE(4);
    return Array.from({ length: n }, (_, i) => CPU[buf.readUInt32BE(8 + i * 20)] ?? "desconhecida");
  }
  throw new Error(`não é Mach-O: ${file}`);
}

const releaseDir = process.argv[2] ?? "release";
const apps = readdirSync(releaseDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name.startsWith("mac"))
  .map((d) => join(releaseDir, d.name, "Multishell.app"))
  .filter(existsSync);

if (apps.length === 0) {
  console.error(`nenhum Multishell.app em ${releaseDir}/mac*`);
  process.exit(1);
}

let failed = false;
for (const app of apps) {
  const archs = machoArchs(join(app, "Contents/MacOS/Multishell"));
  for (const arch of archs) {
    const binding = join(
      app,
      "Contents/Resources/app.asar.unpacked/node_modules/@napi-rs",
      `keyring-darwin-${arch}`,
      `keyring.darwin-${arch}.node`,
    );
    const ok = existsSync(binding);
    console.log(`${ok ? "ok  " : "FALTA"} ${app} (${arch}) -> keyring-darwin-${arch}`);
    if (!ok) failed = true;
  }
}
process.exit(failed ? 1 : 0);

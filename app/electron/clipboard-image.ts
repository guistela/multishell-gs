// Imagem do clipboard ou arrastada sem caminho vira arquivo. O terminal recebe só o caminho:
// os harnesses (Claude Code, Codex) leem a imagem pelo caminho digitado no prompt.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const pad = (n: number) => String(n).padStart(2, "0");

/** Tipos aceitos e a extensão gravada. Nada fora daqui vira arquivo. */
export const IMAGE_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

/** 50 MB: print de tela cabe com folga; evita encher o disco por engano. */
export const MAX_IMAGE_BYTES = 50 * 1024 * 1024;

/** `print-AAAA-MM-DD_HH-MM-SS-mmm.<ext>`: legível, sem `:` (proibido no Windows), sem colisão no mesmo segundo. */
export function clipboardImageName(now: Date, ext = "png"): string {
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}-${String(now.getMilliseconds()).padStart(3, "0")}`;
  return `print-${date}_${time}.${ext}`;
}

/** Grava em `<baseDir>/clipboard`. Null quando não há bytes. */
export function saveClipboardImage(bytes: Uint8Array | null, baseDir: string, now: Date = new Date(), mime = "image/png"): string | null {
  if (!bytes || bytes.length === 0) return null;
  const ext = IMAGE_EXT[mime];
  if (!ext) throw new Error(`tipo de imagem não suportado: ${mime}`);
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error("imagem grande demais");
  const dir = join(baseDir, "clipboard");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, clipboardImageName(now, ext));
  writeFileSync(path, bytes);
  return path;
}

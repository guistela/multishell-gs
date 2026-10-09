import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MAX_IMAGE_BYTES, clipboardImageName, saveClipboardImage } from "../clipboard-image";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "multishell-clip-")); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("clipboardImageName", () => {
  it("usa data e hora legíveis, sem caractere proibido no Windows", () => {
    expect(clipboardImageName(new Date(2026, 9, 9, 14, 3, 5, 7))).toBe("print-2026-10-09_14-03-05-007.png");
    expect(clipboardImageName(new Date(2026, 9, 9, 14, 3, 5, 7), "jpg")).toMatch(/\.jpg$/);
  });
});

describe("saveClipboardImage", () => {
  it("grava o PNG em <dir>/clipboard e devolve o caminho", () => {
    const png = Buffer.from("png-fake");
    const path = saveClipboardImage(png, dir, new Date(2026, 0, 2, 3, 4, 5, 6));
    expect(path).toBe(join(dir, "clipboard", "print-2026-01-02_03-04-05-006.png"));
    expect(readFileSync(path!)).toEqual(png);
  });

  it("usa a extensão do tipo da imagem", () => {
    expect(saveClipboardImage(Buffer.from("j"), dir, new Date(), "image/jpeg")).toMatch(/\.jpg$/);
  });

  it("recusa tipo que não é imagem e imagem grande demais", () => {
    expect(() => saveClipboardImage(Buffer.from("x"), dir, new Date(), "text/html")).toThrow(/suportado/);
    expect(() => saveClipboardImage(new Uint8Array(MAX_IMAGE_BYTES + 1), dir)).toThrow(/grande/);
  });

  it("sem imagem devolve null e não cria pasta", () => {
    expect(saveClipboardImage(null, dir)).toBeNull();
    expect(existsSync(join(dir, "clipboard"))).toBe(false);
  });
});

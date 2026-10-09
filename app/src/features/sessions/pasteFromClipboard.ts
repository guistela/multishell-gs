// "Colar do clipboard": imagem vira arquivo e o terminal recebe o caminho; sem imagem, cola o texto.
// Resolve o print de tela no Windows, onde Ctrl+V não passa imagem para o CLI.
import { api } from "../../api";
import { pty } from "../terminal/pty";

export type PasteResult = "image" | "text" | "empty";

/** Aspas só quando há espaço: assim o caminho sobrevive no prompt do harness e no shell. */
export function quoteForPrompt(path: string): string {
  return /\s/.test(path) ? `"${path}"` : path;
}

export async function pasteFromClipboard(sessionId: string): Promise<PasteResult> {
  let imagePath: string | null = null;
  try { imagePath = await api.clipboardImageSave(); } catch { imagePath = null; }
  if (imagePath) {
    await pty.write(sessionId, `${quoteForPrompt(imagePath)} `);
    return "image";
  }
  let text = "";
  try { text = await navigator.clipboard.readText(); } catch { text = ""; }
  if (!text) return "empty";
  await pty.write(sessionId, text);
  return "text";
}

// Arrastar arquivos para o terminal digita o caminho deles. Os harnesses (Claude Code, Codex)
// anexam a imagem quando o caminho aparece no prompt.
import { api } from "../../api";
import { bridge } from "../../bridge";
import { quoteForPrompt } from "../sessions/pasteFromClipboard";
import { pty } from "./pty";

/** Caminho no disco, ou a imagem gravada pelo main quando o arquivo não tem caminho (ex.: do navegador). */
async function pathOf(file: File): Promise<string | null> {
  const onDisk = bridge().pathForFile(file);
  if (onDisk) return onDisk;
  if (!file.type.startsWith("image/")) return null;
  try {
    return await api.imageSave(new Uint8Array(await file.arrayBuffer()), file.type);
  } catch (e) {
    void api.logFront("warn", `imagem arrastada: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

export async function dropFiles(sessionId: string, files: File[]): Promise<void> {
  const paths: string[] = [];
  for (const f of files) {
    const p = await pathOf(f);
    if (p) paths.push(quoteForPrompt(p));
  }
  if (paths.length > 0) await pty.write(sessionId, `${paths.join(" ")} `);
}

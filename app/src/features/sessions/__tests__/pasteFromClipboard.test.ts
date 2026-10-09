import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invokeMock } from "../../../test/bridge-mocks";
import { pasteFromClipboard, quoteForPrompt } from "../pasteFromClipboard";

const written = () => invokeMock.mock.calls.filter((c) => c[0] === "pty_write").map((c) => new TextDecoder().decode(new Uint8Array(c[1].data)));
const readText = vi.fn<() => Promise<string>>();

beforeEach(() => {
  invokeMock.mockReset();
  readText.mockReset();
  Object.defineProperty(navigator, "clipboard", { value: { readText }, configurable: true });
});
afterEach(() => { Reflect.deleteProperty(navigator, "clipboard"); });

describe("quoteForPrompt", () => {
  it("só envolve em aspas quando o caminho tem espaço", () => {
    expect(quoteForPrompt("/tmp/a.png")).toBe("/tmp/a.png");
    expect(quoteForPrompt("C:\\Users\\Gui Stela\\a.png")).toBe('"C:\\Users\\Gui Stela\\a.png"');
  });
});

describe("pasteFromClipboard", () => {
  it("com imagem no clipboard, salva o PNG e digita o caminho no terminal", async () => {
    invokeMock.mockImplementation(async (cmd: string) => (cmd === "clipboard_image_save" ? "/data/clipboard/print.png" : undefined));
    expect(await pasteFromClipboard("s1")).toBe("image");
    expect(invokeMock).toHaveBeenCalledWith("clipboard_image_save");
    expect(written()).toEqual(["/data/clipboard/print.png "]);
    expect(readText).not.toHaveBeenCalled();
  });

  it("sem imagem, cola o texto do clipboard", async () => {
    invokeMock.mockResolvedValue(null);
    readText.mockResolvedValue("ls -la");
    expect(await pasteFromClipboard("s1")).toBe("text");
    expect(written()).toEqual(["ls -la"]);
  });

  it("clipboard vazio não escreve nada", async () => {
    invokeMock.mockResolvedValue(null);
    readText.mockResolvedValue("");
    expect(await pasteFromClipboard("s1")).toBe("empty");
    expect(written()).toEqual([]);
  });

  it("erro ao ler o clipboard vira 'empty', sem estourar", async () => {
    invokeMock.mockRejectedValue(new Error("sem permissão"));
    readText.mockRejectedValue(new Error("negado"));
    expect(await pasteFromClipboard("s1")).toBe("empty");
  });
});

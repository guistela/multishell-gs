import { beforeEach, describe, expect, it } from "vitest";
import { invokeMock, pathForFileMock } from "../../../test/bridge-mocks";
import { dropFiles } from "../dropFiles";

const written = () => invokeMock.mock.calls.filter((c) => c[0] === "pty_write").map((c) => new TextDecoder().decode(new Uint8Array(c[1].data)));
const file = (name: string, type: string, body = "x") => new File([body], name, { type });

beforeEach(() => {
  invokeMock.mockReset();
  pathForFileMock.mockReset();
  pathForFileMock.mockImplementation((f: File) => f.name);
});

describe("dropFiles", () => {
  it("arquivo com caminho no disco: digita o caminho, entre aspas se tiver espaço", async () => {
    await dropFiles("s1", [file("C:\\Users\\Gui Stela\\print.png", "image/png"), file("/tmp/b.jpg", "image/jpeg")]);
    expect(written()).toEqual(['"C:\\Users\\Gui Stela\\print.png" /tmp/b.jpg ']);
    expect(invokeMock).not.toHaveBeenCalledWith("image_save", expect.anything());
  });

  it("imagem sem caminho (do navegador): grava pelo main e digita o caminho gravado", async () => {
    pathForFileMock.mockReturnValue("");
    invokeMock.mockImplementation(async (cmd: string) => (cmd === "image_save" ? "/data/clipboard/print.webp" : undefined));
    await dropFiles("s1", [file("img.webp", "image/webp", "abc")]);
    const save = invokeMock.mock.calls.find((c) => c[0] === "image_save")!;
    expect(save[1].mime).toBe("image/webp");
    expect([...save[1].data]).toEqual([97, 98, 99]);
    expect(written()).toEqual(["/data/clipboard/print.webp "]);
  });

  it("arquivo sem caminho que não é imagem é ignorado", async () => {
    pathForFileMock.mockReturnValue("");
    await dropFiles("s1", [file("a.txt", "text/plain")]);
    expect(invokeMock).not.toHaveBeenCalled();
  });
});

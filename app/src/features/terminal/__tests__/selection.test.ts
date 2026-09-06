import { describe, expect, it } from "vitest";
import { cleanSelection } from "../selection";

const LS = "\u2028";
const PS = "\u2029";
const BOM = "\ufeff";
const ZWSP = "\u200b";
const ESC = "\u001b";

describe("cleanSelection", () => {
  it("preserva acentos e travessão", () => {
    expect(cleanSelection("vários — traço, ação")).toBe("vários — traço, ação");
  });

  it("troca separadores exóticos por quebra de linha comum", () => {
    expect(cleanSelection(`linha1${LS}linha2${PS}linha3`)).toBe("linha1\nlinha2\nlinha3");
  });

  it("remove BOM e caracteres de largura zero", () => {
    expect(cleanSelection(`${BOM}texto${ZWSP}com invisiveis`)).toBe("textocom invisiveis");
  });

  it("remove sobras de sequência de escape ANSI", () => {
    expect(cleanSelection(`${ESC}[31mvermelho${ESC}[0m`)).toBe("vermelho");
  });

  it("normaliza CRLF e tira espaço de preenchimento à direita", () => {
    expect(cleanSelection("linha   \r\noutra\t\r\n")).toBe("linha\noutra\n");
  });

  it("não mexe em texto já limpo", () => {
    const t = "const a = 1;\nconst b = 2;";
    expect(cleanSelection(t)).toBe(t);
  });
});

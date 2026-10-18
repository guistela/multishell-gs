import { describe, expect, it } from "vitest";
import { MIN_TILE_PX, normalizeSizes, resizeAt, sizesTemplate } from "../tileSizes";

describe("normalizeSizes", () => {
  it("sem nada guardado, todo tile vale o mesmo", () => {
    expect(normalizeSizes(undefined, 3)).toEqual([1, 1, 1]);
  });

  it("tile novo entra com tamanho padrão, sem mexer nos outros", () => {
    expect(normalizeSizes([2, 0.5], 3)).toEqual([2, 0.5, 1]);
  });

  it("tile fechado some do fim da lista", () => {
    expect(normalizeSizes([2, 0.5, 3], 2)).toEqual([2, 0.5]);
  });

  it("valor inválido no disco não quebra o layout", () => {
    expect(normalizeSizes([2, "x", NaN, -1, 0], 5)).toEqual([2, 1, 1, 1, 1]);
  });

  it("o que não é lista vira o padrão", () => {
    expect(normalizeSizes({ a: 1 }, 2)).toEqual([1, 1]);
  });

  it("nenhum tile devolve lista vazia", () => {
    expect(normalizeSizes([1, 2], 0)).toEqual([]);
  });
});

describe("resizeAt", () => {
  // 3 tiles iguais em 900px: cada um 300px, 1fr = 300px.
  const tres = [1, 1, 1];

  // 60px = 0,2fr. Fica longe do mínimo, então o arrasto passa inteiro.
  it("arrastar para a direita cresce o da esquerda e encolhe o da direita", () => {
    const depois = resizeAt(tres, 0, 60, 900);
    expect(depois[0]).toBeCloseTo(1.2);
    expect(depois[1]).toBeCloseTo(0.8);
    expect(depois[2]).toBe(1);
  });

  it("arrastar para a esquerda faz o contrário", () => {
    const depois = resizeAt(tres, 1, -60, 900);
    expect(depois[1]).toBeCloseTo(0.8);
    expect(depois[2]).toBeCloseTo(1.2);
  });

  it("a soma não muda: o espaço total é o mesmo", () => {
    const depois = resizeAt(tres, 0, 97, 900);
    expect(depois.reduce((a, b) => a + b, 0)).toBeCloseTo(3);
  });

  it("nenhum tile encolhe abaixo do mínimo utilizável", () => {
    // 900px / 3fr = 300px por fr. O mínimo são 180px = 0,6fr.
    const depois = resizeAt(tres, 0, 999, 900);
    expect(depois[1]).toBeCloseTo(MIN_TILE_PX / 300);
    expect(depois[0]).toBeCloseTo(2 - MIN_TILE_PX / 300);
  });

  it("o mínimo vale para os dois lados", () => {
    const depois = resizeAt(tres, 0, -999, 900);
    expect(depois[0]).toBeCloseTo(MIN_TILE_PX / 300);
  });

  it("índice fora da lista não muda nada", () => {
    expect(resizeAt(tres, 2, 100, 900)).toBe(tres);
    expect(resizeAt(tres, -1, 100, 900)).toBe(tres);
  });

  it("largura zero não vira divisão por zero", () => {
    expect(resizeAt(tres, 0, 100, 0)).toBe(tres);
  });

  it("os tiles de fora do par arrastado ficam intactos", () => {
    expect(resizeAt([1, 1, 1, 1], 1, 100, 800)[3]).toBe(1);
  });
});

describe("sizesTemplate", () => {
  it("vira grid-template com fração por tile", () => {
    expect(sizesTemplate([1.5, 0.5])).toBe("minmax(0, 1.5fr) minmax(0, 0.5fr)");
  });

  it("lista vazia não gera template", () => {
    expect(sizesTemplate([])).toBeUndefined();
  });
});

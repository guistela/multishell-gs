import { describe, expect, it } from "vitest";
import { resources } from "..";

function keys(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === "object" && v !== null ? keys(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

describe("i18n", () => {
  it("pt-BR e en têm os mesmos namespaces e as mesmas chaves", () => {
    expect(Object.keys(resources["pt-BR"]).sort()).toEqual(Object.keys(resources["en"]).sort());
    for (const ns of Object.keys(resources["en"])) {
      expect(keys(resources["pt-BR"][ns]).sort(), ns).toEqual(keys(resources["en"][ns]).sort());
    }
  });

  it("nenhuma tradução fica vazia", () => {
    for (const lang of Object.keys(resources)) {
      for (const ns of Object.keys(resources[lang])) {
        for (const k of keys(resources[lang][ns])) {
          const v = k.split(".").reduce((o: any, p) => o[p], resources[lang][ns]);
          expect(typeof v === "string" && v.trim().length > 0, `${lang}/${ns}:${k}`).toBe(true);
        }
      }
    }
  });
});

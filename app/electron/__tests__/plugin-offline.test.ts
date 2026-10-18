// O plugin do painel roda dentro do Claude Code, no mesmo processo. Ele só pode
// observar: nenhuma conexão de rede, nenhum processo externo. Isto não é um
// comentário de boa intenção — é verificado no código a cada CI.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = join(__dirname, "..", "..", "..", "plugins", "multishell-lens");
const FONTES = join(RAIZ, "hooks");

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return arquivos(caminho);
    return /\.(ts|tsx)$/.test(nome) ? [caminho] : [];
  });
}

/** `http://www.w3.org/2000/svg` é namespace de XML, não endereço de rede. */
const semNamespaceSvg = (linha: string) => !linha.includes("www.w3.org");

const PROIBIDO: { nome: string; padrao: RegExp }[] = [
  { nome: "fetch", padrao: /\bfetch\s*\(/ },
  { nome: "XMLHttpRequest", padrao: /\bXMLHttpRequest\b/ },
  { nome: "WebSocket", padrao: /\bWebSocket\b/ },
  { nome: "módulo de rede do node", padrao: /(require\(|from\s+)['"]node:(http|https|net|dns|tls|dgram)['"]/ },
  { nome: "módulo de rede sem prefixo", padrao: /(require\(|from\s+)['"](http|https|net|dns|tls|dgram)['"]/ },
  { nome: "processo externo", padrao: /(require\(|from\s+)['"](node:)?child_process['"]/ },
  { nome: "curl ou wget", padrao: /\b(curl|wget)\s+-/ },
  { nome: "endereço http", padrao: /https?:\/\// },
];

describe("o plugin do painel é offline", () => {
  const fontes = arquivos(FONTES).map((caminho) => ({ caminho, texto: readFileSync(caminho, "utf8") }));

  it("tem código para examinar", () => {
    expect(fontes.length).toBeGreaterThan(10);
  });

  for (const { nome, padrao } of PROIBIDO) {
    it(`não usa ${nome}`, () => {
      const achados = fontes.flatMap(({ caminho, texto }) =>
        texto
          .split("\n")
          .map((linha, i) => ({ linha, n: i + 1 }))
          .filter(({ linha }) => padrao.test(linha) && semNamespaceSvg(linha))
          .map(({ n }) => `${caminho.replace(RAIZ, "")}:${n}`),
      );
      expect(achados).toEqual([]);
    });
  }
});

describe("o fork não mostra custo nem marca de outro produto", () => {
  const fontes = arquivos(FONTES).map((caminho) => ({ caminho, texto: readFileSync(caminho, "utf8") }));

  it("nenhuma tela escreve CSR", () => {
    expect(fontes.filter(({ texto }) => texto.includes("CSR")).map((f) => f.caminho)).toEqual([]);
  });

  it("a barra acima do prompt não tem pílula de custo", () => {
    const pilulas = readFileSync(join(FONTES, "pilulas.ts"), "utf8");
    expect(pilulas).not.toMatch(/chave:\s*'custo'/);
  });

  it("a atribuição ao autor original continua no repositório", () => {
    expect(readFileSync(join(RAIZ, "LICENSE-csr-lens"), "utf8")).toContain("Cesar Schutz");
    expect(readFileSync(join(RAIZ, "NOTICE.md"), "utf8")).toContain("csr-lens");
  });
});

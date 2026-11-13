import { describe, expect, it } from "vitest";
import { OSC_MAX_PENDING, OscScanner } from "../osc";

const ESC = "\x1b";
const BEL = "\x07";
const ST = `${ESC}\\`;

function scan(...chunks: string[]) {
  const s = new OscScanner();
  return chunks.flatMap((c) => s.push(Buffer.from(c, "utf8")));
}

describe("OSC 9", () => {
  it("lê a mensagem terminada em BEL", () => {
    expect(scan(`${ESC}]9;Build terminou${BEL}`)).toEqual([{ title: "Build terminou", body: null }]);
  });

  it("lê a mensagem terminada em ST", () => {
    expect(scan(`${ESC}]9;Build terminou${ST}`)).toEqual([{ title: "Build terminou", body: null }]);
  });

  it("acha a mensagem no meio da saída normal", () => {
    expect(scan(`ok\r\n${ESC}]9;Pronto${BEL}prompt$ `)).toEqual([{ title: "Pronto", body: null }]);
  });

  it("lê duas na mesma rajada", () => {
    expect(scan(`${ESC}]9;um${BEL}meio${ESC}]9;dois${BEL}`)).toEqual([
      { title: "um", body: null },
      { title: "dois", body: null },
    ]);
  });

  // O PTY entrega pedaços de tamanho qualquer. A sequência quebra no meio.
  it("junta a mensagem partida entre rajadas", () => {
    expect(scan(`${ESC}]9;Build `, "term", `inou${BEL}`)).toEqual([{ title: "Build terminou", body: null }]);
  });

  it("junta até quando o ESC e o ] caem em rajadas diferentes", () => {
    expect(scan(ESC, "]9;Pronto", BEL)).toEqual([{ title: "Pronto", body: null }]);
  });

  it("texto vazio não vira notificação", () => {
    expect(scan(`${ESC}]9;${BEL}`)).toEqual([]);
  });
});

describe("OSC 777", () => {
  it("lê título e corpo do formato notify", () => {
    expect(scan(`${ESC}]777;notify;Testes;340 passaram${BEL}`)).toEqual([
      { title: "Testes", body: "340 passaram" },
    ]);
  });

  it("sem corpo, o corpo fica nulo", () => {
    expect(scan(`${ESC}]777;notify;Testes${BEL}`)).toEqual([{ title: "Testes", body: null }]);
  });

  it("corpo com ponto e vírgula fica inteiro", () => {
    expect(scan(`${ESC}]777;notify;T;a;b${BEL}`)).toEqual([{ title: "T", body: "a;b" }]);
  });

  it("outro subcomando do 777 é ignorado", () => {
    expect(scan(`${ESC}]777;precmd;x${BEL}`)).toEqual([]);
  });
});

describe("o que não é notificação", () => {
  it("ignora o OSC 7 do diretório, que o zshrc manda o tempo todo", () => {
    expect(scan(`${ESC}]7;file://host/Users/gs${BEL}`)).toEqual([]);
  });

  it("ignora o OSC 0 do título da janela", () => {
    expect(scan(`${ESC}]0;zsh${BEL}`)).toEqual([]);
  });

  it("saída sem ESC não guarda nada", () => {
    const s = new OscScanner();
    s.push(Buffer.from("linha comum\r\n", "utf8"));
    expect(s.pendingLength).toBe(0);
  });

  // Sem teto, uma sequência sem terminador comeria memória para sempre.
  it("desiste da sequência que passa do teto", () => {
    const s = new OscScanner();
    s.push(Buffer.from(`${ESC}]9;${"x".repeat(OSC_MAX_PENDING + 10)}`, "utf8"));
    expect(s.pendingLength).toBe(0);
    expect(s.push(Buffer.from(BEL, "utf8"))).toEqual([]);
  });

  it("volta a funcionar depois de desistir", () => {
    const s = new OscScanner();
    s.push(Buffer.from(`${ESC}]9;${"x".repeat(OSC_MAX_PENDING + 10)}`, "utf8"));
    expect(s.push(Buffer.from(`${ESC}]9;Pronto${BEL}`, "utf8"))).toEqual([{ title: "Pronto", body: null }]);
  });

  it("corta mensagem longa demais para o painel", () => {
    const [n] = scan(`${ESC}]9;${"t".repeat(500)}${BEL}`);
    expect(n.title).toHaveLength(120);
  });
});

/**
 * Limpa o texto que sai do terminal antes de ir para o clipboard.
 * A saída dos CLIs traz separadores exóticos e caracteres invisíveis que viram
 * lixo quando colados fora do terminal.
 */
export function cleanSelection(text: string): string {
  return (
    text
      // U+2028/U+2029 são quebras que muitos editores e sites não entendem.
      .replace(/[\u2028\u2029]/g, "\n")
      // BOM e caracteres de largura zero: invisíveis aqui, sujeira no destino.
      .replace(/[\ufeff\u200b-\u200d]/g, "")
      // Sobras de sequência de escape que escaparam do parser do terminal.
      .replace(/\u001b\[[0-9;?]*[\u0020-\u002f]*[\u0040-\u007e]/g, "")
      .replace(/\r\n?/g, "\n")
      // Espaço à direita vem do preenchimento das colunas do terminal.
      .split("\n")
      .map((line) => line.replace(/[ \t]+$/, ""))
      .join("\n")
  );
}

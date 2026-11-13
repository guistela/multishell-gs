// Leitura de notificação na saída do terminal, sem o agente saber de nada.
//
// Dois formatos de fato usados pelos harnesses e pelos scripts de build:
//   OSC 9   — `ESC ] 9 ; texto BEL`            (iTerm2, Windows Terminal)
//   OSC 777 — `ESC ] 777 ; notify ; título ; corpo BEL`  (urxvt, notify-send)
//
// O scanner só observa. Ele não tira nada da saída: o xterm já ignora OSC que
// não conhece, e remover bytes quebraria o replay do ring buffer.
import { MAX_BODY, MAX_TITLE } from "./notifications";

/** Teto do que fica guardado entre rajadas. Sequência sem terminador é lixo. */
export const OSC_MAX_PENDING = 8 * 1024;

export interface OscNotice { title: string; body: string | null }

const ESC = 0x1b;
const BEL = 0x07;

/** Alimentado com as rajadas do PTY. Devolve o que achou em cada uma. */
export class OscScanner {
  /** Sequência começada e ainda sem terminador. Vazio na maior parte do tempo. */
  private pendente = "";

  get pendingLength(): number {
    return this.pendente.length;
  }

  push(bytes: Buffer): OscNotice[] {
    // Caminho rápido: sem ESC e sem sequência aberta, não há nada a fazer.
    if (!this.pendente && !bytes.includes(ESC)) return [];

    let texto = this.pendente + bytes.toString("utf8");
    this.pendente = "";
    const achados: OscNotice[] = [];

    for (;;) {
      const inicio = texto.indexOf("\x1b]");
      if (inicio < 0) {
        // Um ESC solto no fim pode ser o começo da próxima sequência.
        this.pendente = texto.endsWith("\x1b") ? "\x1b" : "";
        break;
      }
      const resto = texto.slice(inicio);
      const fim = terminador(resto);
      if (fim < 0) {
        // Incompleta: guarda para a próxima rajada, dentro do teto.
        if (resto.length <= OSC_MAX_PENDING) this.pendente = resto;
        break;
      }
      const corpo = resto.slice(2, fim);
      const achado = interpreta(corpo);
      if (achado) achados.push(achado);
      texto = resto.slice(fim + (resto[fim] === "\x1b" ? 2 : 1));
    }
    return achados;
  }
}

/** Posição do BEL ou do ST (`ESC \`) que fecha a sequência. -1 quando não fechou. */
function terminador(s: string): number {
  for (let i = 2; i < s.length; i += 1) {
    if (s.charCodeAt(i) === BEL) return i;
    if (s.charCodeAt(i) === ESC && s[i + 1] === "\\") return i;
    // Outro ESC no meio: a sequência anterior foi abandonada pelo emissor.
    if (s.charCodeAt(i) === ESC) return -1;
  }
  return -1;
}

function corta(v: string, max: number): string {
  return v.slice(0, max);
}

/** O miolo da sequência, sem `ESC ]` e sem terminador. */
function interpreta(corpo: string): OscNotice | null {
  if (corpo.startsWith("9;")) {
    const title = corta(corpo.slice(2).trim(), MAX_TITLE);
    return title ? { title, body: null } : null;
  }
  if (corpo.startsWith("777;notify;")) {
    const resto = corpo.slice("777;notify;".length);
    const corte = resto.indexOf(";");
    const title = corta((corte < 0 ? resto : resto.slice(0, corte)).trim(), MAX_TITLE);
    const body = corte < 0 ? null : corta(resto.slice(corte + 1).trim(), MAX_BODY) || null;
    return title ? { title, body } : null;
  }
  return null;
}

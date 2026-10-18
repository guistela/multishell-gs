/**
 * Tamanho dos tiles num layout de uma dimensão (vertical ou horizontal).
 * Guardamos frações, não pixels: a janela muda de tamanho e a proporção fica.
 * Módulo puro: a conta é testável sem montar a tela.
 */

/** Abaixo disto um terminal deixa de ser usável. Limita o quanto o vizinho encolhe. */
export const MIN_TILE_PX = 180;

/** Fração de um tile que o usuário nunca mexeu. */
const PADRAO = 1;

const valido = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;

/** Lista de frações com exatamente `count` itens. O que veio torto vira o padrão. */
export function normalizeSizes(raw: unknown, count: number): number[] {
  const guardado = Array.isArray(raw) ? raw : [];
  return Array.from({ length: Math.max(0, count) }, (_, i) => (valido(guardado[i]) ? guardado[i] : PADRAO));
}

/**
 * Arrasta a divisória entre `index` e `index + 1`. Só esse par muda: a soma das
 * frações fica igual, então os outros tiles não se mexem.
 */
export function resizeAt(
  sizes: number[],
  index: number,
  deltaPx: number,
  totalPx: number,
  minPx: number = MIN_TILE_PX,
): number[] {
  if (index < 0 || index + 1 >= sizes.length || totalPx <= 0) return sizes;

  const totalFr = sizes.reduce((a, b) => a + b, 0);
  if (totalFr <= 0) return sizes;

  const pxPorFr = totalPx / totalFr;
  const minFr = minPx / pxPorFr;
  const par = sizes[index] + sizes[index + 1];
  // Par pequeno demais para respeitar o mínimo dos dois: não mexe.
  if (par < minFr * 2) return sizes;

  const bruto = sizes[index] + deltaPx / pxPorFr;
  const esquerda = Math.min(Math.max(bruto, minFr), par - minFr);

  const next = [...sizes];
  next[index] = esquerda;
  next[index + 1] = par - esquerda;
  return next;
}

/** Valor de `grid-template-*`. `undefined` quando não há tile: deixa o CSS padrão agir. */
export function sizesTemplate(sizes: number[]): string | undefined {
  return sizes.length === 0 ? undefined : sizes.map((fr) => `minmax(0, ${fr}fr)`).join(" ");
}

import { useRef } from "react";

/**
 * Divisória arrastável entre dois tiles vizinhos.
 * Mede o container uma vez, no pointerdown: durante o arrasto as frações mudam,
 * e remedir a cada movimento faria o tamanho perseguir o próprio resultado.
 */
export function TileSplitter({
  index,
  axis,
  label,
  onResize,
  onCommit,
  onReset,
}: {
  index: number;
  axis: "row" | "column";
  label: string;
  /** Chamado a cada movimento, com o deslocamento desde o início e o tamanho medido. */
  onResize: (index: number, deltaPx: number, totalPx: number) => void;
  onCommit: () => void;
  onReset: () => void;
}) {
  const inicio = useRef<{ pos: number; total: number } | null>(null);
  const horizontal = axis === "column";

  const medir = (el: HTMLElement): number => {
    const pai = el.parentElement;
    if (!pai) return 0;
    const caixa = pai.getBoundingClientRect();
    return horizontal ? caixa.width : caixa.height;
  };

  return (
    <div
      className={`tile-splitter ${axis}`}
      data-testid={`tile-splitter-${index}`}
      role="separator"
      aria-orientation={horizontal ? "vertical" : "horizontal"}
      aria-label={label}
      tabIndex={0}
      title={label}
      onDoubleClick={onReset}
      onKeyDown={(e) => {
        // Teclado move de 24 em 24 px: quem não usa mouse também redimensiona.
        const passo = e.key === "ArrowLeft" || e.key === "ArrowUp" ? -24 : e.key === "ArrowRight" || e.key === "ArrowDown" ? 24 : 0;
        if (passo === 0) return;
        e.preventDefault();
        onResize(index, passo, medir(e.currentTarget));
        onCommit();
      }}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        inicio.current = { pos: horizontal ? e.clientX : e.clientY, total: medir(e.currentTarget) };
      }}
      onPointerMove={(e) => {
        const base = inicio.current;
        if (!base) return;
        onResize(index, (horizontal ? e.clientX : e.clientY) - base.pos, base.total);
      }}
      onPointerUp={(e) => {
        if (!inicio.current) return;
        inicio.current = null;
        e.currentTarget.releasePointerCapture?.(e.pointerId);
        onCommit();
      }}
      onPointerCancel={() => { inicio.current = null; }}
    >
      <span className="tile-splitter-grip" aria-hidden="true" />
    </div>
  );
}

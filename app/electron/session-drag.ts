export interface Point { x: number; y: number }
export interface Bounds extends Point { width: number; height: number }
export type DropAction = "detach" | "reattach" | "none";

export function contains(bounds: Bounds, point: Point): boolean {
  return point.x >= bounds.x && point.x < bounds.x + bounds.width
    && point.y >= bounds.y && point.y < bounds.y + bounds.height;
}

/** All coordinates are Electron DIP coordinates, including on mixed-DPI displays. */
export function dropAction(point: Point, source: Bounds, main: Bounds | null, detached: boolean): DropAction {
  if (contains(source, point)) return "none";
  if (!detached) return "detach";
  return main && contains(main, point) ? "reattach" : "none";
}

export function detachedPosition(point: Point, workArea: Bounds): Point {
  return {
    x: Math.round(Math.max(workArea.x, Math.min(point.x - 100, workArea.x + Math.max(0, workArea.width - 900)))),
    y: Math.round(Math.max(workArea.y, Math.min(point.y - 24, workArea.y + Math.max(0, workArea.height - 600)))),
  };
}

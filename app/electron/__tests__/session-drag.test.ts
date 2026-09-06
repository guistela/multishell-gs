import { describe, expect, it } from "vitest";
import { detachedPosition, dropAction } from "../session-drag";

const main = { x: 100, y: 100, width: 1000, height: 700 };
const detached = { x: 900, y: 200, width: 500, height: 400 };

describe("terminal drop geometry", () => {
  it("only detaches outside the source window, including its native frame", () => {
    expect(dropAction({ x: 105, y: 105 }, main, main, false)).toBe("none");
    expect(dropAction({ x: 1100, y: 300 }, main, main, false)).toBe("detach");
  });
  it("returns to the main window only outside the detached source", () => {
    expect(dropAction({ x: 200, y: 300 }, detached, main, true)).toBe("reattach");
    expect(dropAction({ x: 950, y: 300 }, detached, main, true)).toBe("none");
    expect(dropAction({ x: 1600, y: 300 }, detached, main, true)).toBe("none");
    expect(dropAction({ x: 200, y: 300 }, detached, null, true)).toBe("none");
  });
  it("positions the new window within a display with negative coordinates", () => {
    const work = { x: -1920, y: 25, width: 1920, height: 1055 };
    expect(detachedPosition({ x: -1919, y: 26 }, work)).toEqual({ x: -1920, y: 25 });
    expect(detachedPosition({ x: -1, y: 1079 }, work)).toEqual({ x: -900, y: 480 });
  });
});

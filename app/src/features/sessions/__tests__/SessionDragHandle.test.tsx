import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { invokeMock, spaceA } from "../../../test/bridge-mocks";
import "../../../i18n";
import { useAppStore } from "../../../store";
import type { Session } from "../../../types";
import { SessionDragHandle } from "../SessionDragHandle";

const session: Session = { id: "s1", title: "Shell", space_id: spaceA.id, provider_id: null, bypass: false, cwd: null, harness_running: false, detached: false };
beforeEach(() => {
  // jsdom has no native pointer capture; retain real mouse coordinates.
  window.PointerEvent = MouseEvent as typeof PointerEvent;
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.hasPointerCapture = () => true;
  HTMLElement.prototype.releasePointerCapture = vi.fn();
  invokeMock.mockReset();
  invokeMock.mockImplementation(async (cmd: string) => cmd === "session_drop" ? "none" : undefined);
  useAppStore.setState({ sessions: [session], selectedSessionId: "s1" });
});

function start() {
  render(<SessionDragHandle session={session} />);
  const handle = screen.getByRole("button", { name: "Arrastar Shell" });
  fireEvent.pointerDown(handle, { button: 0, clientX: 10, clientY: 10 });
  return handle;
}

describe("terminal drag gesture", () => {
  it("click and small movement do not detach", () => {
    const handle = start();
    fireEvent.pointerMove(handle, { clientX: 12, clientY: 12 });
    fireEvent.pointerUp(handle);
    expect(invokeMock).not.toHaveBeenCalledWith("session_drop", expect.anything());
  });
  it("releases outside through IPC without killing the PTY or a stale click write", async () => {
    const handle = start();
    fireEvent.pointerMove(handle, { clientX: 2000, clientY: 20 });
    expect(handle).toHaveClass("dragging");
    await act(async () => fireEvent.pointerUp(handle));
    fireEvent.click(handle);
    expect(invokeMock.mock.calls.filter((c) => c[0] !== "session_drag_preview")).toEqual([["session_drop", { sessionId: "s1" }]]);
    expect(screen.queryByRole("status")).toBeNull();
  });
  it.each(["escape", "cancel", "capture lost"])("%s cancels the drop", (reason) => {
    const handle = start();
    fireEvent.pointerMove(handle, { clientX: 2000, clientY: 20 });
    if (reason === "escape") fireEvent.keyDown(window, { key: "Escape" });
    if (reason === "cancel") fireEvent.pointerCancel(handle);
    if (reason === "capture lost") fireEvent.lostPointerCapture(handle);
    fireEvent.pointerUp(handle);
    expect(invokeMock).not.toHaveBeenCalledWith("session_drop", expect.anything());
  });
  it("surfaces a failed move", async () => {
    invokeMock.mockRejectedValue(new Error("offline"));
    const handle = start();
    fireEvent.pointerMove(handle, { clientX: 2000, clientY: 20 });
    await act(async () => fireEvent.pointerUp(handle));
    expect(screen.getByRole("alert")).toHaveTextContent("offline");
  });
});

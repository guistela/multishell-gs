import { act, render, screen } from "@testing-library/react";
import { beforeEach, expect, it } from "vitest";
import "../../../i18n";
import { resetBridge, sessionDragListeners } from "../../../test/bridge-mocks";
import { SessionDropOverlay } from "../SessionDropOverlay";

beforeEach(() => resetBridge());

it("shows drop readiness and clears on cancellation", () => {
  const { unmount } = render(<SessionDropOverlay detachedSessionId={null} />);
  expect(screen.queryByRole("status")).toBeNull();
  act(() => sessionDragListeners.forEach((cb) => cb({ session_id: "s1", detached: false, action: "none" })));
  expect(screen.getByRole("status")).toHaveTextContent("Arraste para fora desta janela");
  act(() => sessionDragListeners.forEach((cb) => cb({ session_id: "s1", detached: false, action: "detach" })));
  expect(screen.getByRole("status")).toHaveClass("ready");
  expect(screen.getByRole("status")).toHaveTextContent("Solte para destacar");
  act(() => sessionDragListeners.forEach((cb) => cb({ session_id: "s1", detached: true, action: "reattach" })));
  expect(screen.getByRole("status")).toHaveTextContent("Solte para devolver ao espaço");
  act(() => sessionDragListeners.forEach((cb) => cb(null)));
  expect(screen.queryByRole("status")).toBeNull();
  unmount();
  expect(sessionDragListeners.size).toBe(0);
});

it("does not cover unrelated detached windows", () => {
  render(<SessionDropOverlay detachedSessionId="other-session" />);
  act(() => sessionDragListeners.forEach((cb) => cb({ session_id: "s1", detached: true, action: "reattach" })));
  expect(screen.queryByRole("status")).toBeNull();
});

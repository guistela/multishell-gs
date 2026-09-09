import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { claude, spaceA, spaceB, invokeMock } from "../../../test/bridge-mocks";
import { DEFAULT_SETTINGS, useAppStore } from "../../../store";
import { NewAgentDialog } from "../NewAgentDialog";

beforeEach(() => {
  localStorage.clear();
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  invokeMock.mockResolvedValue(undefined);
  useAppStore.setState({ sessions: [], spaces: [spaceA, spaceB], providers: [claude, { ...claude, id: "other", name: "Other" }], settings: DEFAULT_SETTINGS });
});
it("starts chosen provider in chosen space and folder, remembering choices", () => {
  const close = vi.fn();
  const view = render(<NewAgentDialog spaceId={spaceA.id} onClose={close} />);
  fireEvent.change(screen.getByLabelText("Espaço"), { target: { value: spaceB.id } });
  fireEvent.change(screen.getByLabelText("Agente"), { target: { value: "other" } });
  fireEvent.change(screen.getByLabelText("Pasta de trabalho"), { target: { value: "/project" } });
  fireEvent.click(screen.getByRole("button", { name: "Iniciar agente" }));
  expect(useAppStore.getState().sessions[0]).toMatchObject({ space_id: spaceB.id, provider_id: "other", cwd: "/project", bypass: false, auto_start_harness: true });
  expect(close).toHaveBeenCalled();
  view.unmount();
  render(<NewAgentDialog spaceId={spaceB.id} onClose={close} />);
  expect(screen.getByLabelText("Agente")).toHaveValue("other");
  expect(screen.getByLabelText("Pasta de trabalho")).toHaveValue("/project");
});
it("cancel does not create a terminal", () => {
  const close = vi.fn();
  render(<NewAgentDialog spaceId={spaceA.id} onClose={close} />);
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(close).toHaveBeenCalled();
  expect(useAppStore.getState().sessions).toHaveLength(0);
});

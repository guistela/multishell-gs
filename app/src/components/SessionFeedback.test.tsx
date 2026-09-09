import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useAppStore } from "../store";
import { SessionFeedback } from "./SessionFeedback";

it("offers cancellation first and only runs interruption on confirmation", () => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  const action = vi.fn();
  useAppStore.setState({ confirmation: { message: "Fechar agente?", action }, notice: null });
  const view = render(<SessionFeedback />);
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Continuar trabalhando" }));
  expect(action).not.toHaveBeenCalled();
  expect(useAppStore.getState().confirmation).toBeNull();
  view.unmount();
  useAppStore.setState({ confirmation: { message: "Fechar agente?", action } });
  render(<SessionFeedback />);
  fireEvent.click(screen.getByRole("button", { name: "Confirmar interrupção" }));
  expect(action).toHaveBeenCalledTimes(1);
});

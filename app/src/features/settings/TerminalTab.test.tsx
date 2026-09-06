import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import "../../i18n";

import "../../test/bridge-mocks";
const saveSettings = vi.fn();
vi.mock("../../store", () => ({
  useAppStore: (sel: (s: unknown) => unknown) =>
    sel({
      settings: { shell: null, default_cwd: null, font_family: "Menlo", font_size: 13, theme: "dark", language: "pt-BR" },
      saveSettings,
    }),
}));

import TerminalTab, { FONT_MAX, FONT_MIN } from "./TerminalTab";

describe("TerminalTab", () => {
  it("bloqueia salvar com tamanho de fonte fora de 10–20", () => {
    render(<TerminalTab />);
    const input = screen.getByRole("spinbutton");
    const save = screen.getByRole("button");
    expect(save).toBeEnabled();

    fireEvent.change(input, { target: { value: String(FONT_MAX + 1) } });
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(save).toBeDisabled();

    fireEvent.change(input, { target: { value: String(FONT_MIN) } });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(save).toBeEnabled();
  });
});

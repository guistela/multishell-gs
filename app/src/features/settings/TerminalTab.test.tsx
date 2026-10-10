import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import "../../i18n";

import { invokeMock } from "../../test/bridge-mocks";
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

  it("escolhe Git Bash no seletor de shell e salva o token", async () => {
    invokeMock.mockImplementation(async (cmd: string) =>
      cmd === "shell_options" ? { default: "pwsh.exe", git_bash: "C:\\Git\\bin\\bash.exe" } : undefined);
    saveSettings.mockClear();
    render(<TerminalTab />);
    const select = screen.getByRole("combobox", { name: "Shell" });
    const gitBash = await screen.findByRole("option", { name: /Git Bash/ });
    await waitFor(() => expect(gitBash).toBeEnabled());
    expect(screen.getByRole("option", { name: /pwsh\.exe/ })).toBeInTheDocument();
    fireEvent.change(select, { target: { value: "git-bash" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(saveSettings).toHaveBeenCalledWith(expect.objectContaining({ shell: "git-bash" })));
  });

  it("Git Bash fica desabilitado quando não foi encontrado", async () => {
    invokeMock.mockImplementation(async (cmd: string) =>
      cmd === "shell_options" ? { default: "/bin/zsh", git_bash: null } : undefined);
    render(<TerminalTab />);
    await screen.findByRole("option", { name: /\/bin\/zsh/ });
    expect(screen.getByRole("option", { name: /Git Bash/ })).toBeDisabled();
  });

  it("caminho personalizado mostra campo de texto e salva o caminho", async () => {
    invokeMock.mockImplementation(async () => undefined);
    saveSettings.mockClear();
    render(<TerminalTab />);
    fireEvent.change(screen.getByRole("combobox", { name: "Shell" }), { target: { value: "custom" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Caminho do shell" }), { target: { value: " /bin/bash " } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(saveSettings).toHaveBeenCalledWith(expect.objectContaining({ shell: "/bin/bash" })));
  });
});

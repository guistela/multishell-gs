import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import "../../i18n";
import type { Provider } from "../../types";
import { invokeMock } from "../../test/bridge-mocks";

invokeMock.mockImplementation(async (cmd: string, args: { provider: Provider; bypass: boolean }) => {
  const p = args.provider;
  if (cmd === "provider_command_line") return [p.executable, ...p.args, ...(args.bypass ? p.bypass_args : [])].join(" ");
  if (cmd === "provider_resume_line") return [p.executable, ...p.args, ...p.resume_args, ...(args.bypass ? p.bypass_args : [])].join(" ");
  throw new Error(`unexpected ${cmd}`);
});

import ProviderEditor from "./ProviderEditor";

const provider: Provider = {
  id: "p1", name: "Claude Code", executable: "claude", args: ["--model", "opus"],
  bypass_args: ["--dangerously-skip-permissions"], config_env_key: "CLAUDE_CONFIG_DIR", extra_env: [], icon: "", resume_args: ["--continue"],
};

describe("ProviderEditor", () => {
  it("mostra prévia do comando com e sem args de bypass", async () => {
    render(<ProviderEditor provider={provider} onSave={() => {}} onCancel={() => {}} />);
    await waitFor(() => {
      const preview = screen.getByTestId("preview");
      expect(preview).toHaveTextContent("claude --model opus --dangerously-skip-permissions");
      expect(preview.querySelectorAll("code")[0]).toHaveTextContent(/^claude --model opus$/);
    });
  });

  it("mostra prévia da linha de resume", async () => {
    render(<ProviderEditor provider={provider} onSave={() => {}} onCancel={() => {}} />);
    await waitFor(() => {
      expect(screen.getByTestId("preview-resume")).toHaveTextContent(/^claude --model opus --continue$/);
    });
    expect(screen.getByLabelText(/Args de resume/)).toHaveValue("--continue");
  });

  it("mostra feedback de sucesso ao salvar", async () => {
    const { fireEvent, act } = await import("@testing-library/react");
    render(<ProviderEditor provider={provider} onSave={async () => {}} onCancel={() => {}} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Salvar" })));
    expect(screen.getByRole("status")).toHaveTextContent("Salvo");
  });

  it("mostra mensagem de erro ao falhar o salvamento", async () => {
    const { fireEvent, act } = await import("@testing-library/react");
    render(<ProviderEditor provider={provider} onSave={async () => { throw new Error("Falha no provider"); }} onCancel={() => {}} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Salvar" })));
    expect(screen.getByRole("alert")).toHaveTextContent("Falha no provider");
  });
});

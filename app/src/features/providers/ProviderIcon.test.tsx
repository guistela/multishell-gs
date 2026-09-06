import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Provider } from "../../types";
import { ICON_NAMES, ProviderIcon } from "./ProviderIcon";

const base: Provider = {
  id: "p", name: "Claude Code", executable: "claude", args: [], bypass_args: [],
  config_env_key: null, extra_env: [], icon: "sparkles", resume_args: [],
};

describe("ProviderIcon", () => {
  it("desenha o ícone do harness pelo nome guardado no provider", () => {
    const { container } = render(<ProviderIcon provider={base} />);
    expect(container.querySelector('[data-icon="sparkles"]')).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Claude Code" })).toBeInTheDocument();
  });

  it("terminal sem harness recebe o ícone de shell", () => {
    const { container } = render(<ProviderIcon />);
    expect(container.querySelector('[data-icon="terminal"]')).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Shell" })).toBeInTheDocument();
  });

  it("respeita emoji escolhido pelo usuário", () => {
    const { container } = render(<ProviderIcon provider={{ ...base, icon: "🦊" }} />);
    expect(container.querySelector('[data-icon="emoji"]')).toHaveTextContent("🦊");
  });

  it("cai na inicial do nome quando o ícone é desconhecido", () => {
    const { container } = render(<ProviderIcon provider={{ ...base, name: "Zed", icon: "nao-existe" }} />);
    expect(container.querySelector('[data-icon="letter"]')).toHaveTextContent("Z");
  });

  it("todos os ícones oferecidos no editor desenham de fato", () => {
    for (const name of ICON_NAMES) {
      const { container } = render(<ProviderIcon provider={{ ...base, icon: name }} />);
      expect(container.querySelector(`[data-icon="${name}"]`), name).toBeInTheDocument();
    }
  });
});

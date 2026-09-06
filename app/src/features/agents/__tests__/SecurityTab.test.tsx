import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { spaceA } from "../../../test/bridge-mocks";
import "../../../i18n";
import { useAppStore } from "../../../store";
import type { Session, Space } from "../../../types";

import { SecurityTab } from "../WorkspaceTabs";

const guarded: Space = { ...spaceA, security: { ...spaceA.security, block_destructive_commands: true } };
const session: Session = { id: "a", title: "Claude", space_id: spaceA.id, provider_id: "p", bypass: true, cwd: null, harness_running: true, detached: false };

beforeEach(() => {
  useAppStore.setState({ spaces: [spaceA], sessions: [session], selectedSpaceId: spaceA.id });
});

describe("SecurityTab: status reais", () => {
  it("mostra o guardrail desligado quando o espaço não o ativou", () => {
    render(<SecurityTab />);
    const card = screen.getByTestId("security-guardrail");
    expect(card).toHaveTextContent(/DESLIGADO/i);
    expect(card).toHaveTextContent(/Configurações do espaço/i);
  });

  it("mostra o guardrail ativo quando o espaço o ativou", () => {
    useAppStore.setState({ spaces: [guarded], selectedSpaceId: guarded.id });
    render(<SecurityTab />);
    expect(screen.getByTestId("security-guardrail")).toHaveTextContent(/ATIVO/i);
  });

  it("informa o que o espaço compartilha com o host em vez de prometer isolamento total", () => {
    useAppStore.setState({ spaces: [{ ...spaceA, security: { ...spaceA.security, share_ssh: true } }], selectedSpaceId: spaceA.id });
    render(<SecurityTab />);
    expect(screen.getByTestId("security-isolation")).toHaveTextContent(/SSH/i);
  });

  it("conta os terminais com bypass no espaço", () => {
    render(<SecurityTab />);
    expect(screen.getByTestId("security-bypass")).toHaveTextContent("1");
  });

  it("não anuncia proteção que o app não executa", () => {
    render(<SecurityTab />);
    expect(screen.queryByText(/Sanitizador PII/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Port Manager/i)).not.toBeInTheDocument();
  });
});

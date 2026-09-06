import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { invokeMock, spaceA } from "../test/bridge-mocks";
import "../i18n";
import { useAppStore } from "../store";
import type { Space } from "../types";

vi.mock("../features/terminal/Terminal", () => ({ Terminal: () => <div /> }));
import App from "../App";

const compartilhado: Space = { ...spaceA, security: { ...spaceA.security, share_ssh: true, share_keychain: true } };

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockResolvedValue(undefined);
  useAppStore.setState({ spaces: [spaceA], sessions: [], selectedSpaceId: spaceA.id, loaded: true, loadError: null });
});

describe("statusbar: isolamento real do espaço", () => {
  it("diz isolado quando o espaço não compartilha nada com o host", () => {
    render(<App />);
    expect(screen.getByTestId("status-isolation")).toHaveTextContent(/isolado/i);
  });

  it("lista o que o espaço compartilha em vez de prometer isolamento total", () => {
    act(() => useAppStore.setState({ spaces: [compartilhado], selectedSpaceId: compartilhado.id, loadError: null }));
    render(<App />);
    const el = screen.getByTestId("status-isolation");
    expect(el).toHaveTextContent(/SSH/i);
    expect(el).toHaveTextContent(/Keychain/i);
    expect(el).not.toHaveTextContent(/hermético/i);
  });

  it("não exibe selo estático de keyring na barra de título", () => {
    render(<App />);
    expect(screen.queryByText(/Hardware Keyring/i)).not.toBeInTheDocument();
  });
});

describe("statusbar: contagem de terminais vivos", () => {
  const viva = { id: "s1", title: "A", space_id: spaceA.id, provider_id: null, bypass: false, cwd: null, harness_running: false, detached: false };
  const morta = { ...viva, id: "s2", title: "B", exit_code: 0 };

  it("conta só os terminais que ainda estão rodando", () => {
    useAppStore.setState({ sessions: [viva, morta], loadError: null });
    render(<App />);
    const el = screen.getByTestId("status-terminals");
    expect(el).toHaveTextContent("1 terminal");
    expect(el).not.toHaveTextContent("2");
  });

  it("informa quantos encerraram quando há terminais mortos abertos", () => {
    useAppStore.setState({ sessions: [viva, morta], loadError: null });
    render(<App />);
    expect(screen.getByTestId("status-terminals")).toHaveTextContent(/1 encerrado/i);
  });
});

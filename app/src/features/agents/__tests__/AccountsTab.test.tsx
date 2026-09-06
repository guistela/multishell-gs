import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { invokeMock, spaceA, spaceB } from "../../../test/bridge-mocks";
import "../../../i18n";
import { useAppStore } from "../../../store";
import type { AuthSessionStatus } from "../../../api";
import type { Provider, Session } from "../../../types";

const writeMock = vi.fn(() => Promise.resolve());
vi.mock("../../terminal/pty", () => ({ pty: { write: (...args: unknown[]) => writeMock(...(args as [])), kill: () => Promise.resolve() } }));

import { AccountsTab } from "../WorkspaceTabs";

const claude: Provider = {
  id: "p-claude", name: "Claude Code", executable: "claude", args: [], bypass_args: [],
  config_env_key: null, extra_env: [], icon: "c", resume_args: [],
};

/** Shell puro: destino certo para comando de login. */
const shell: Session = { id: "sh", title: "Shell 1", space_id: spaceA.id, provider_id: null, bypass: false, cwd: "/a", harness_running: false, detached: false };
/** Terminal com agente rodando: o login viraria prompt do agente, não comando. */
const agente: Session = { ...shell, id: "ag", title: "claude", provider_id: claude.id, harness_running: true };
const outroEspaco: Session = { ...shell, id: "ou", title: "Shell do trabalho", space_id: spaceB.id };

const gh: AuthSessionStatus = {
  id: "gh", name: "GitHub CLI", installed: true, logged_in: true,
  account: "guistela", detail: "github.com",
  login_command: "gh auth login", logout_command: "gh auth logout",
};
const gcloud: AuthSessionStatus = {
  id: "gcloud", name: "Google Cloud CLI", installed: true, logged_in: false,
  account: null, detail: null,
  login_command: "gcloud auth login", logout_command: "gcloud auth revoke",
};
const aws: AuthSessionStatus = {
  id: "aws", name: "AWS CLI", installed: false, logged_in: false,
  account: null, detail: null,
  login_command: "aws configure", logout_command: null,
};
const vercel: AuthSessionStatus = {
  id: "vercel", name: "Vercel CLI", installed: true, logged_in: true,
  account: null, detail: null,
  login_command: "vercel login", logout_command: null,
};

/** Resposta por espaço: prova que a aba consulta o espaço selecionado. */
const porEspaco: Record<string, AuthSessionStatus[]> = {};

function mockAuth(): void {
  invokeMock.mockImplementation(async (cmd: string, args?: any) => {
    if (cmd === "auth_sessions") return porEspaco[args?.spaceId] ?? [];
    return undefined;
  });
}

beforeEach(() => {
  for (const k of Object.keys(porEspaco)) delete porEspaco[k];
  porEspaco[spaceA.id] = [gh, gcloud, aws];
  porEspaco[spaceB.id] = [{ ...gh, account: "conta-trabalho" }];
  writeMock.mockClear();
  invokeMock.mockReset();
  mockAuth();
  useAppStore.setState({
    spaces: [spaceA, spaceB], sessions: [shell, agente, outroEspaco], providers: [claude],
    selectedSessionId: "sh", selectedSpaceId: spaceA.id,
  });
});

describe("Contas: sessões de CLI do espaço", () => {
  it("consulta as CLIs do espaço ao abrir e mostra estado de carregando", async () => {
    let liberar: (v: AuthSessionStatus[]) => void = () => {};
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "auth_sessions") return new Promise((resolve) => { liberar = resolve as typeof liberar; });
      return Promise.resolve(undefined);
    });

    render(<AccountsTab />);
    expect(screen.getByTestId("accounts-loading")).toBeInTheDocument();

    await act(async () => { liberar([gh]); });

    await waitFor(() => expect(screen.queryByTestId("accounts-loading")).toBeNull());
    expect(invokeMock).toHaveBeenCalledWith("auth_sessions", { spaceId: spaceA.id });
    expect(screen.getByText("GitHub CLI")).toBeInTheDocument();
  });

  it("deixa claro que os logins são por espaço", async () => {
    render(<AccountsTab />);
    await screen.findByText("GitHub CLI");
    expect(screen.getByTestId("accounts-scope-hint")).toHaveTextContent(/por espaço/i);
  });

  it("separa ativas, sem sessão e não instaladas, nessa ordem", async () => {
    render(<AccountsTab />);
    await screen.findByText("GitHub CLI");

    const ativas = screen.getByTestId("accounts-active");
    const semSessao = screen.getByTestId("accounts-logged-out");
    const naoInstaladas = screen.getByTestId("accounts-missing");

    expect(within(ativas).getByText("GitHub CLI")).toBeInTheDocument();
    expect(within(semSessao).getByText("Google Cloud CLI")).toBeInTheDocument();
    expect(within(naoInstaladas).getByText("AWS CLI")).toBeInTheDocument();

    // As não instaladas ficam por último: o usuário não precisa agir nelas.
    expect(ativas.compareDocumentPosition(semSessao) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(semSessao.compareDocumentPosition(naoInstaladas) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("mostra identidade e complemento, sem inventar dado quando account é null", async () => {
    porEspaco[spaceA.id] = [gh, vercel];
    render(<AccountsTab />);
    await screen.findByText("GitHub CLI");

    const linhaGh = screen.getByTestId("account-row-gh");
    expect(within(linhaGh).getByText("guistela")).toBeInTheDocument();
    expect(within(linhaGh).getByText(/github\.com/)).toBeInTheDocument();

    const linhaVercel = screen.getByTestId("account-row-vercel");
    expect(within(linhaVercel).queryByTestId("account-identity-vercel")).toBeNull();
  });

  it("recarrega ao trocar de espaço", async () => {
    render(<AccountsTab />);
    await screen.findByText("guistela");

    act(() => useAppStore.getState().selectSpace(spaceB.id));

    expect(await screen.findByText("conta-trabalho")).toBeInTheDocument();
    expect(invokeMock).toHaveBeenCalledWith("auth_sessions", { spaceId: spaceB.id });
  });

  it("consulta de novo no botão Atualizar", async () => {
    render(<AccountsTab />);
    await screen.findByText("GitHub CLI");
    const antes = invokeMock.mock.calls.filter((c) => c[0] === "auth_sessions").length;

    fireEvent.click(screen.getByRole("button", { name: /Atualizar/i }));

    await waitFor(() =>
      expect(invokeMock.mock.calls.filter((c) => c[0] === "auth_sessions").length).toBe(antes + 1)
    );
  });

  it("escreve o comando de login no terminal sem agente e foca aquele terminal", async () => {
    useAppStore.setState({ selectedSessionId: "ag" });
    render(<AccountsTab />);
    await screen.findByText("Google Cloud CLI");

    fireEvent.click(screen.getByRole("button", { name: /Entrar em Google Cloud CLI/i }));

    await waitFor(() => expect(writeMock).toHaveBeenCalled());
    // Prefere o shell puro mesmo com o terminal do agente selecionado.
    expect(writeMock.mock.calls[0]).toEqual(["sh", "gcloud auth login\n"]);
    expect(useAppStore.getState().selectedSessionId).toBe("sh");
  });

  it("avisa quando só há terminais com agente rodando, sem escrever no agente", async () => {
    useAppStore.setState({ sessions: [agente, outroEspaco], selectedSessionId: "ag" });
    render(<AccountsTab />);
    await screen.findByText("Google Cloud CLI");

    fireEvent.click(screen.getByRole("button", { name: /Entrar em Google Cloud CLI/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/terminal comum|sem agente/i);
    expect(writeMock).not.toHaveBeenCalled();
  });

  it("explica que é preciso abrir um terminal quando o espaço não tem nenhum", async () => {
    useAppStore.setState({ sessions: [outroEspaco], selectedSessionId: null, selectedSpaceId: spaceA.id });
    render(<AccountsTab />);
    await screen.findByText("Google Cloud CLI");

    expect(screen.getByTestId("accounts-no-terminal")).toHaveTextContent(/abr[ia]/i);
    fireEvent.click(screen.getByRole("button", { name: /Entrar em Google Cloud CLI/i }));
    expect(writeMock).not.toHaveBeenCalled();
  });

  it("pede confirmação antes de sair e respeita o cancelamento", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<AccountsTab />);
    await screen.findByText("GitHub CLI");

    fireEvent.click(screen.getByRole("button", { name: /Sair de GitHub CLI/i }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(writeMock).not.toHaveBeenCalled();

    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: /Sair de GitHub CLI/i }));
    await waitFor(() => expect(writeMock).toHaveBeenCalledWith("sh", "gh auth logout\n"));
    confirmSpy.mockRestore();
  });

  it("não oferece Sair quando a CLI não expõe comando de logout", async () => {
    porEspaco[spaceA.id] = [vercel];
    render(<AccountsTab />);
    await screen.findByText("Vercel CLI");

    expect(screen.queryByRole("button", { name: /Sair de Vercel CLI/i })).toBeNull();
  });

  it("nunca pede nem mostra token ou senha", async () => {
    render(<AccountsTab />);
    await screen.findByText("GitHub CLI");

    expect(screen.queryByText(/token|senha|password/i)).toBeNull();
    expect(document.querySelectorAll("input[type=password]")).toHaveLength(0);
  });
});

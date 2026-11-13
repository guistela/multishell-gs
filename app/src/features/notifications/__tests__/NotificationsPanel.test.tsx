import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { invokeMock, resetBridge, spaceA } from "../../../test/bridge-mocks";
import "../../../i18n";
import { DEFAULT_SETTINGS, useAppStore } from "../../../store";
import type { AgentNotification } from "../../../types";
import { NotificationsBell } from "../NotificationsBell";
import { NotificationsPanel } from "../NotificationsPanel";

const aviso = (over: Partial<AgentNotification> = {}): AgentNotification => ({
  id: "n1", session_id: "s1", space_id: spaceA.id, title: "Testes verdes", body: null,
  level: "info", created_at: "2026-01-01T00:00:00Z", ask: null, answer: null, read: true, ...over,
});

const ZERO = { total: 0, unread: 0, pending: 0, bySession: {}, bySpace: {} };

beforeEach(() => {
  resetBridge();
  invokeMock.mockResolvedValue(undefined);
  useAppStore.setState({
    spaces: [spaceA], providers: [], settings: DEFAULT_SETTINGS, loaded: true,
    sessions: [{ id: "s1", title: "Alpha", space_id: spaceA.id, provider_id: null, bypass: false, cwd: null, harness_running: false, detached: false }],
    selectedSessionId: null, notifications: [], notifyCounts: ZERO, notificationsOpen: false,
  });
});

describe("NotificationsBell", () => {
  it("sem nada pendente, não mostra número", () => {
    render(<NotificationsBell />);
    expect(screen.queryByTestId("notify-badge")).not.toBeInTheDocument();
  });

  it("mostra a contagem do que eu perdi", () => {
    useAppStore.setState({ notifyCounts: { ...ZERO, total: 4, unread: 4 } });
    render(<NotificationsBell />);
    expect(screen.getByTestId("notify-badge")).toHaveTextContent("4");
  });

  // Acima de 99 o número não cabe no sino.
  it("acima de 99 mostra 99+", () => {
    useAppStore.setState({ notifyCounts: { ...ZERO, total: 150, unread: 150 } });
    render(<NotificationsBell />);
    expect(screen.getByTestId("notify-badge")).toHaveTextContent("99+");
  });

  // Pergunta esperando é mais urgente que novidade: o sino precisa gritar.
  it("com pergunta pendente o sino fica em destaque", () => {
    useAppStore.setState({ notifyCounts: { ...ZERO, total: 1, pending: 1 } });
    render(<NotificationsBell />);
    expect(screen.getByTestId("notify-bell")).toHaveClass("has-pending");
  });

  it("clicar abre o painel e marca tudo como lido", async () => {
    render(<NotificationsBell />);
    fireEvent.click(screen.getByTestId("notify-bell"));
    await waitFor(() => expect(useAppStore.getState().notificationsOpen).toBe(true));
    expect(invokeMock).toHaveBeenCalledWith("notifications_mark_read", { sessionId: undefined });
  });
});

describe("NotificationsPanel", () => {
  const abrir = (items: AgentNotification[]) => {
    useAppStore.setState({ notifications: items, notificationsOpen: true });
    render(<NotificationsPanel />);
  };

  it("fechado não aparece", () => {
    useAppStore.setState({ notifications: [aviso()], notificationsOpen: false });
    render(<NotificationsPanel />);
    expect(screen.queryByTestId("notify-panel")).not.toBeInTheDocument();
  });

  it("lista título, corpo e de qual terminal veio", () => {
    abrir([aviso({ body: "340 passaram" })]);
    const item = within(screen.getByTestId("notify-item-n1"));
    expect(item.getByText("Testes verdes")).toBeInTheDocument();
    expect(item.getByText("340 passaram")).toBeInTheDocument();
    expect(item.getByText(/Alpha/)).toBeInTheDocument();
  });

  // O terminal pode ter sido fechado depois do aviso. O aviso continua valendo.
  it("sessão que não existe mais não quebra o painel", () => {
    abrir([aviso({ session_id: "sumiu" })]);
    expect(screen.getByTestId("notify-item-n1")).toBeInTheDocument();
  });

  it("painel vazio explica como o agente avisa", () => {
    abrir([]);
    expect(screen.getByTestId("notify-empty")).toHaveTextContent("multishell notify");
  });

  it("dispensar tira o aviso da lista", async () => {
    abrir([aviso()]);
    fireEvent.click(within(screen.getByTestId("notify-item-n1")).getByRole("button", { name: /dispensar/i }));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("notification_dismiss", { id: "n1" }));
  });

  it("dispensar tudo limpa o painel", async () => {
    abrir([aviso(), aviso({ id: "n2" })]);
    fireEvent.click(screen.getByTestId("notify-dismiss-all"));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("notifications_dismiss_all", { sessionId: undefined }));
  });

  it("clicar no aviso leva ao terminal que mandou", () => {
    abrir([aviso()]);
    fireEvent.click(screen.getByTestId("notify-goto-n1"));
    expect(useAppStore.getState().selectedSessionId).toBe("s1");
    expect(useAppStore.getState().notificationsOpen).toBe(false);
  });

  describe("pergunta", () => {
    const pergunta = (over: Partial<AgentNotification> = {}) =>
      aviso({ ask: { options: [], placeholder: "escreva" }, answer: undefined, ...over });

    it("com opções, cada opção é um botão", async () => {
      abrir([pergunta({ ask: { options: ["sim", "não"], placeholder: null } })]);
      fireEvent.click(screen.getByRole("button", { name: "sim" }));
      await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("notification_answer", { id: "n1", answer: "sim" }));
    });

    it("sem opções, um campo de texto", async () => {
      abrir([pergunta()]);
      const campo = screen.getByPlaceholderText("escreva");
      fireEvent.change(campo, { target: { value: "manda bala" } });
      fireEvent.submit(campo.closest("form")!);
      await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("notification_answer", { id: "n1", answer: "manda bala" }));
    });

    it("resposta em branco não vai: o agente ficaria sem saber o que fazer", () => {
      abrir([pergunta()]);
      fireEvent.submit(screen.getByPlaceholderText("escreva").closest("form")!);
      expect(invokeMock).not.toHaveBeenCalledWith("notification_answer", expect.anything());
    });

    it("cancelar manda null e solta o agente", async () => {
      abrir([pergunta()]);
      fireEvent.click(within(screen.getByTestId("notify-item-n1")).getByRole("button", { name: /cancelar/i }));
      await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("notification_answer", { id: "n1", answer: null }));
    });

    // Pergunta sobe para o topo: é o que me trava.
    it("pergunta pendente vem antes de aviso comum", () => {
      abrir([aviso({ id: "velho" }), pergunta({ id: "p1" })]);
      const ids = screen.getAllByTestId(/^notify-item-/).map((e) => e.getAttribute("data-testid"));
      expect(ids).toEqual(["notify-item-p1", "notify-item-velho"]);
    });

    it("pergunta já respondida vira aviso comum", () => {
      abrir([pergunta({ answer: "sim" })]);
      expect(screen.queryByPlaceholderText("escreva")).not.toBeInTheDocument();
      expect(screen.getByTestId("notify-item-n1")).toHaveTextContent("sim");
    });
  });

  it("Esc fecha o painel", () => {
    abrir([aviso()]);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(useAppStore.getState().notificationsOpen).toBe(false);
  });
});

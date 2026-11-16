import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { invokeMock, resetBridge, spaceA } from "../../../test/bridge-mocks";
import "../../../i18n";
import { DEFAULT_SETTINGS, useAppStore } from "../../../store";
import type { AgentNotification } from "../../../types";
import { FloatingAsks } from "../FloatingAsks";

const base = (over: Partial<AgentNotification> = {}): AgentNotification => ({
  id: "n1", session_id: "s1", space_id: spaceA.id, title: "Aviso", body: null,
  level: "info", created_at: "2026-01-01T00:00:00Z", ask: null, answer: null, read: true, ...over,
});

const pergunta = (over: Partial<AgentNotification> = {}) =>
  base({ id: "p1", title: "Permitir Bash?", body: "git push --force", level: "warn",
    ask: { options: ["Permitir", "Negar"], placeholder: "ou diga o que fazer" }, answer: undefined, ...over });

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

describe("FloatingAsks", () => {
  // A janela existe para responder. Aviso comum não tem o que responder.
  it("mostra só pergunta esperando, nunca aviso comum nem já respondida", () => {
    useAppStore.setState({ notifications: [
      base({ id: "a1", title: "Testes verdes" }),
      pergunta(),
      base({ id: "r1", title: "Já respondi", ask: { options: ["sim"], placeholder: null }, answer: "sim" }),
    ] });
    render(<FloatingAsks />);
    expect(screen.getByText("Permitir Bash?")).toBeInTheDocument();
    expect(screen.queryByText("Testes verdes")).not.toBeInTheDocument();
    expect(screen.queryByText("Já respondi")).not.toBeInTheDocument();
  });

  it("diz de qual terminal veio a pergunta", () => {
    useAppStore.setState({ notifications: [pergunta()] });
    render(<FloatingAsks />);
    expect(screen.getByTestId("floating-ask-p1")).toHaveTextContent("Alpha");
  });

  it("o botão manda a resposta", async () => {
    useAppStore.setState({ notifications: [pergunta()] });
    render(<FloatingAsks />);
    fireEvent.click(screen.getByRole("button", { name: "Permitir" }));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("notification_answer", { id: "p1", answer: "Permitir" }));
  });

  it("o campo livre manda o texto", async () => {
    useAppStore.setState({ notifications: [pergunta()] });
    render(<FloatingAsks />);
    const campo = screen.getByPlaceholderText("ou diga o que fazer");
    fireEvent.change(campo, { target: { value: "use --force-with-lease" } });
    fireEvent.submit(campo);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("notification_answer", { id: "p1", answer: "use --force-with-lease" }));
  });

  // Cancelar solta o agente sem decidir. Ele não pode ficar preso.
  it("cancelar manda null", async () => {
    useAppStore.setState({ notifications: [pergunta()] });
    render(<FloatingAsks />);
    const item = screen.getByTestId("floating-ask-p1");
    fireEvent.click(within(item).getByRole("button", { name: /cancelar/i }));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("notification_answer", { id: "p1", answer: null }));
  });

  it("sem pergunta, avisa que não há nada esperando", () => {
    render(<FloatingAsks />);
    expect(screen.getByTestId("floating-asks-empty")).toBeInTheDocument();
  });

  // A janela não tem moldura: sem área de arraste eu não consigo movê-la.
  it("o cabeçalho é área de arraste da janela", () => {
    useAppStore.setState({ notifications: [pergunta()] });
    render(<FloatingAsks />);
    expect(screen.getByTestId("floating-asks-head").className).toContain("drag");
  });

  it("mostra quantas perguntas esperam", () => {
    useAppStore.setState({ notifications: [pergunta(), pergunta({ id: "p2" })] });
    render(<FloatingAsks />);
    expect(screen.getByTestId("floating-asks-count")).toHaveTextContent("2");
  });
});

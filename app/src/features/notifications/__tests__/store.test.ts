import { beforeEach, describe, expect, it } from "vitest";
import { emitNotificationsChanged, invokeMock, resetBridge } from "../../../test/bridge-mocks";
import { useAppStore } from "../../../store";
import { watchNotifications } from "../watch";
import type { AgentNotification } from "../../../types";

const aviso = (over: Partial<AgentNotification> = {}): AgentNotification => ({
  id: "n1", session_id: "s1", space_id: "e1", title: "Testes verdes", body: null,
  level: "info", created_at: "2026-01-01T00:00:00Z", ask: null, answer: null, read: false, ...over,
});

const ZERO = { total: 0, unread: 0, pending: 0, bySession: {}, bySpace: {} };

beforeEach(() => {
  resetBridge();
  invokeMock.mockResolvedValue(undefined);
  useAppStore.setState({ notifications: [], notifyCounts: ZERO, notificationsOpen: false });
});

describe("loadNotifications", () => {
  it("traz a lista e o badge do main", async () => {
    invokeMock.mockImplementation((cmd: string) =>
      cmd === "notifications_list" ? [aviso()] : { ...ZERO, total: 1, bySession: { s1: 1 } });
    await useAppStore.getState().loadNotifications();
    const st = useAppStore.getState();
    expect(st.notifications.map((n) => n.id)).toEqual(["n1"]);
    expect(st.notifyCounts.total).toBe(1);
  });

  // Main sem o command devolve undefined. Zerar a tela com isso é pior que nada.
  it("resposta vazia não apaga o que está na tela", async () => {
    useAppStore.setState({ notifications: [aviso()], notifyCounts: { ...ZERO, total: 1 } });
    invokeMock.mockResolvedValue(undefined);
    await useAppStore.getState().loadNotifications();
    const st = useAppStore.getState();
    expect(st.notifications).toHaveLength(1);
    expect(st.notifyCounts.total).toBe(1);
  });

  // O main é a fonte. Falha de IPC não pode deixar a lista num estado meia-boca.
  it("erro no main deixa o que já estava", async () => {
    useAppStore.setState({ notifications: [aviso()] });
    invokeMock.mockRejectedValue(new Error("sem main"));
    await useAppStore.getState().loadNotifications();
    expect(useAppStore.getState().notifications).toHaveLength(1);
  });
});

describe("evento do main", () => {
  it("o badge chega pelo evento, sem pedir nada", () => {
    const off = watchNotifications();
    emitNotificationsChanged({ total: 3, unread: 3, bySpace: { e1: 3 } });
    expect(useAppStore.getState().notifyCounts).toMatchObject({ total: 3, bySpace: { e1: 3 } });
    expect(invokeMock).not.toHaveBeenCalled();
    off();
  });

  // Com o painel aberto a lista tem de acompanhar: o aviso novo aparece sozinho.
  it("com o painel aberto, a lista é recarregada", () => {
    useAppStore.setState({ notificationsOpen: true });
    const off = watchNotifications();
    emitNotificationsChanged({ total: 1 });
    expect(invokeMock).toHaveBeenCalledWith("notifications_list");
    off();
  });

  it("desligar o ouvinte para de atualizar", () => {
    watchNotifications()();
    emitNotificationsChanged({ total: 9 });
    expect(useAppStore.getState().notifyCounts.total).toBe(0);
  });
});

describe("ações", () => {
  it("answerNotification manda a resposta e recarrega", async () => {
    await useAppStore.getState().answerNotification("n1", "sim");
    expect(invokeMock).toHaveBeenCalledWith("notification_answer", { id: "n1", answer: "sim" });
    expect(invokeMock).toHaveBeenCalledWith("notifications_list");
  });

  it("cancelar manda answer null", async () => {
    await useAppStore.getState().answerNotification("n1", null);
    expect(invokeMock).toHaveBeenCalledWith("notification_answer", { id: "n1", answer: null });
  });

  // Some da tela na hora. Esperar o main voltar deixa o clique com cara de travado.
  it("dismissNotification tira da lista antes do main responder", () => {
    useAppStore.setState({ notifications: [aviso(), aviso({ id: "n2" })] });
    void useAppStore.getState().dismissNotification("n1");
    expect(useAppStore.getState().notifications.map((n) => n.id)).toEqual(["n2"]);
  });

  it("dismissAllNotifications limpa a lista inteira", () => {
    useAppStore.setState({ notifications: [aviso(), aviso({ id: "n2" })] });
    void useAppStore.getState().dismissAllNotifications();
    expect(useAppStore.getState().notifications).toEqual([]);
    expect(invokeMock).toHaveBeenCalledWith("notifications_dismiss_all", { sessionId: undefined });
  });

  it("dismissAllNotifications de uma sessão só tira as dela", () => {
    useAppStore.setState({ notifications: [aviso(), aviso({ id: "n2", session_id: "s2" })] });
    void useAppStore.getState().dismissAllNotifications("s1");
    expect(useAppStore.getState().notifications.map((n) => n.id)).toEqual(["n2"]);
  });

  it("abrir o painel marca tudo como lido", async () => {
    await useAppStore.getState().setNotificationsOpen(true);
    expect(useAppStore.getState().notificationsOpen).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith("notifications_mark_read", { sessionId: undefined });
  });

  it("fechar o painel não marca nada", async () => {
    await useAppStore.getState().setNotificationsOpen(false);
    expect(invokeMock).not.toHaveBeenCalledWith("notifications_mark_read", expect.anything());
  });
});

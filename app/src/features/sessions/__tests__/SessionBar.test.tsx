import { beforeEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { claude, invokeMock, spaceA, spaceB } from "../../../test/bridge-mocks";
import "../../../i18n";
import { DEFAULT_SETTINGS, useAppStore } from "../../../store";
import { SessionBar } from "../SessionBar";
import type { Session } from "../../../types";

const session: Session = { id: "s1", title: "Alpha", space_id: spaceA.id, provider_id: claude.id, bypass: false, cwd: null, harness_running: false, detached: false };

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockImplementation(async (cmd: string, args?: { bypass?: boolean }) =>
    cmd === "provider_command_line" ? `claude${args?.bypass ? " --dangerously-skip-permissions" : ""}` : undefined,
  );
  useAppStore.setState({ spaces: [spaceA, spaceB], providers: [claude], sessions: [session], selectedSessionId: "s1", settings: DEFAULT_SETTINGS, loaded: true, migration: null, restoredSessionIds: new Set() });
});

function current() { return useAppStore.getState().sessions[0]; }
/** Como no App: a barra recebe sempre a sessão atual do store. */
function Bar() { const s = useAppStore((st) => st.sessions[0]); return s ? <SessionBar session={s} /> : null; }
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

describe("SessionBar", () => {
  it("Iniciar harness chama provider_command_line com bypass e escreve no PTY", async () => {
    render(<Bar />);
    fireEvent.click(screen.getByRole("button", { name: "Bypass" }));
    expect(current().bypass).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /Iniciar harness/ }));
    await flush();
    expect(invokeMock).toHaveBeenCalledWith("provider_command_line", { provider: claude, bypass: true });
    const write = invokeMock.mock.calls.find((c) => c[0] === "pty_write")!;
    expect(write[1].sessionId).toBe("s1");
    expect(new TextDecoder().decode(new Uint8Array(write[1].data))).toBe("claude --dangerously-skip-permissions\n");
    expect(current().harness_running).toBe(true);
  });

  it("com harness rodando o bypass avisa que aplica no próximo início", () => {
    useAppStore.setState({ sessions: [{ ...session, harness_running: true, detached: false }] });
    render(<Bar />);
    expect(screen.getByRole("button", { name: "Bypass" })).toHaveAttribute("title", "Aplica no próximo início");
  });

  it("trocar provider só muda provider_id", () => {
    render(<Bar />);
    fireEvent.change(screen.getByRole("combobox", { name: "Provider" }), { target: { value: "" } });
    expect(current()).toMatchObject({ id: "s1", provider_id: null });
  });

  it("trocar espaço recria a sessão com id novo e mesmo título", () => {
    render(<Bar />);
    fireEvent.change(screen.getByRole("combobox", { name: "Espaço" }), { target: { value: spaceB.id } });
    const s = current();
    expect(s.id).not.toBe("s1");
    expect(s).toMatchObject({ title: "Alpha", space_id: spaceB.id });
  });

  it("✕ fecha a sessão", () => {
    render(<Bar />);
    fireEvent.click(screen.getByRole("button", { name: "Fechar sessão" }));
    expect(useAppStore.getState().sessions).toHaveLength(0);
  });
});

describe("SessionBar: destacar (Fase 8)", () => {
  it("⧉ Destacar chama session_detach e marca detached", async () => {
    render(<Bar />);
    fireEvent.click(screen.getByRole("button", { name: "Destacar" }));
    await flush();
    expect(invokeMock).toHaveBeenCalledWith("session_detach", { sessionId: "s1" });
    expect(current().detached).toBe(true);
  });

  it("sessão já detached na janela principal: botão vira Trazer de volta", async () => {
    useAppStore.setState({ sessions: [{ ...session, detached: true }] });
    render(<Bar />);
    expect(screen.queryByRole("button", { name: "Destacar" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Trazer de volta" }));
    await flush();
    expect(invokeMock).toHaveBeenCalledWith("session_reattach", { sessionId: "s1" });
    expect(current().detached).toBe(false);
  });

  it("modo janela destacada: espaço desabilitado e botão Devolver ao espaço", async () => {
    render(<SessionBar session={session} detachedWindow />);
    expect(screen.getByRole("combobox", { name: "Espaço" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Devolver ao espaço" }));
    await flush();
    expect(invokeMock).toHaveBeenCalledWith("session_reattach", { sessionId: "s1" });
  });

  it("botão direito na barra abre menu de contexto", () => {
    render(<Bar />);
    const bar = screen.getByRole("combobox", { name: "Espaço" }).closest(".session-bar")!;
    fireEvent.contextMenu(bar);
    expect(screen.getByText("Reiniciar terminal")).toBeInTheDocument();
    expect(screen.getByText("Duplicar terminal")).toBeInTheDocument();
  });

  it("duplo clique na barra alterna visualização para grid e volta", () => {
    render(<Bar />);
    const bar = screen.getByRole("combobox", { name: "Espaço" }).closest(".session-bar")!;
    fireEvent.doubleClick(bar);
    expect(useAppStore.getState().spaceLayouts[spaceA.id]).toBe("grid");
    fireEvent.doubleClick(bar);
    expect(useAppStore.getState().spaceLayouts[spaceA.id]).toBe("single");
  });
});

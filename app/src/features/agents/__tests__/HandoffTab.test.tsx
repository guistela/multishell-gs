import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { invokeMock, spaceA } from "../../../test/bridge-mocks";
import "../../../i18n";
import { useAppStore } from "../../../store";
import type { Provider, Session } from "../../../types";

const writeMock = vi.fn(() => Promise.resolve());
vi.mock("../../terminal/pty", () => ({ pty: { write: (...args: unknown[]) => writeMock(...(args as [])), kill: () => Promise.resolve() } }));

import { HandoffTab } from "../WorkspaceTabs";

const claude: Provider = {
  id: "p-claude", name: "Claude Code", executable: "claude", args: [], bypass_args: ["--dangerously-skip-permissions"],
  config_env_key: null, extra_env: [], icon: "🤖", resume_args: [],
};
const gemini: Provider = { ...claude, id: "p-gemini", name: "Gemini CLI", executable: "gemini" };

const a: Session = { id: "a", title: "Claude Code", space_id: spaceA.id, provider_id: claude.id, bypass: true, cwd: "/a", harness_running: true, detached: false };
const b: Session = { ...a, id: "b", title: "Codex", provider_id: "p-codex", bypass: false, harness_running: true };
const shellPuro: Session = { ...a, id: "sh", title: "Shell Auxiliar", provider_id: null, bypass: false, harness_running: false };

beforeEach(() => {
  writeMock.mockClear();
  invokeMock.mockReset();
  invokeMock.mockResolvedValue(undefined);
  useAppStore.setState({
    sessions: [a, b], spaces: [spaceA], providers: [claude, gemini],
    selectedSessionId: "a", selectedSpaceId: spaceA.id, workspaceTab: "handoff",
  });
});

describe("HandoffTab — continuidade entre agentes", () => {
  it("recusa handoff para terminal sem agente e explica o porquê", async () => {
    useAppStore.setState({ sessions: [a, shellPuro], selectedSessionId: "a" });
    render(<HandoffTab />);
    fireEvent.click(screen.getByRole("button", { name: /Transferir Bastão/i }));
    expect(await screen.findByText(/não tem agente rodando/i)).toBeInTheDocument();
    expect(writeMock).not.toHaveBeenCalled();
  });

  it("transfere o bastão para outro terminal já aberto no mesmo espaço", async () => {
    render(<HandoffTab />);
    fireEvent.click(screen.getByRole("button", { name: /Transferir Bastão/i }));

    await vi.waitFor(() => expect(writeMock).toHaveBeenCalled());
    const [sessionId, payload] = writeMock.mock.calls[0] as unknown as [string, string];
    expect(sessionId).toBe("b");
    expect(payload).toContain("PROTOCOLO DE CONTINUIDADE MULTIAGENTE");
    expect(payload).toContain("Limite de Tokens");
    await vi.waitFor(() => expect(useAppStore.getState().selectedSessionId).toBe("b"));
    expect(useAppStore.getState().workspaceTab).toBe("terminals");
  });

  it("inicia um novo terminal com outro agente e só injeta o contexto após o harness subir", async () => {
    vi.useFakeTimers();
    render(<HandoffTab />);
    fireEvent.change(screen.getByRole("combobox", { name: /novo harness/i }), { target: { value: gemini.id } });
    fireEvent.click(screen.getByRole("button", { name: /Iniciar Terminal & Passar Bastão/i }));

    const created = useAppStore.getState().sessions.find((s) => s.provider_id === gemini.id);
    expect(created).toBeDefined();
    expect(created?.space_id).toBe(spaceA.id);
    expect(created?.auto_start_harness).toBe(true);
    expect(useAppStore.getState().selectedSessionId).toBe(created?.id);

    // Harness ainda subindo: nada é digitado no terminal.
    await vi.advanceTimersByTimeAsync(2000);
    expect(writeMock).not.toHaveBeenCalled();

    // Terminal.tsx zera auto_start_harness quando lança o harness.
    act(() => useAppStore.getState().updateSession(created!.id, { auto_start_harness: false, harness_running: true }));
    await vi.advanceTimersByTimeAsync(3000);
    expect(writeMock).toHaveBeenCalledWith(created?.id, expect.stringContaining("PROTOCOLO DE CONTINUIDADE MULTIAGENTE"));
    vi.useRealTimers();
  });

  it("usa o motivo do handoff escolhido no pacote de contexto", async () => {
    render(<HandoffTab />);
    fireEvent.change(screen.getByRole("combobox", { name: /Motivo do Handoff/i }), { target: { value: "role_transition" } });
    fireEvent.click(screen.getByRole("button", { name: /Transferir Bastão/i }));

    await vi.waitFor(() => expect(writeMock).toHaveBeenCalled());
    expect((writeMock.mock.calls[0] as unknown as [string, string])[1]).toContain("Passagem de bastão especialista");
  });
});

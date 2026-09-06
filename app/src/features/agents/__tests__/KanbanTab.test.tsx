import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { invokeMock, spaceA, spaceB } from "../../../test/bridge-mocks";
import "../../../i18n";
import { useAppStore } from "../../../store";
import type { Provider, Session } from "../../../types";

const writeMock = vi.fn(() => Promise.resolve());
vi.mock("../../terminal/pty", () => ({ pty: { write: (...args: unknown[]) => writeMock(...(args as [])), kill: () => Promise.resolve() } }));

import { KanbanTab, type Task } from "../WorkspaceTabs";

const claude: Provider = {
  id: "p-claude", name: "Claude Code", executable: "claude", args: [], bypass_args: [],
  config_env_key: null, extra_env: [], icon: "c", resume_args: [],
};

/** Terminal com agente rodando: recebe tarefa. */
const agente: Session = { id: "ag", title: "claude", space_id: spaceA.id, provider_id: claude.id, bypass: false, cwd: "/a", harness_running: true, detached: false };
/** Shell puro: não recebe tarefa, porque o texto viraria comando. */
const shell: Session = { ...agente, id: "sh", title: "Shell 2", provider_id: null, harness_running: false };
const outroEspaco: Session = { ...agente, id: "ou", title: "Codex", space_id: spaceB.id };

const tarefa: Task = { id: "t1", key: "TASK-1", title: "Revisar guardrail", status: "todo", source: "Local" };

const boards: Record<string, { tasks: Task[] }> = {};

beforeEach(() => {
  for (const k of Object.keys(boards)) delete boards[k];
  writeMock.mockClear();
  invokeMock.mockReset();
  invokeMock.mockImplementation(async (cmd: string, args?: any) => {
    if (cmd === "store_get" && args?.name === "kanban") return Object.keys(boards).length ? boards : null;
    if (cmd === "store_set" && args?.name === "kanban") {
      Object.assign(boards, args.value);
      return undefined;
    }
    return undefined;
  });
  useAppStore.setState({
    spaces: [spaceA, spaceB], sessions: [agente, shell, outroEspaco], providers: [claude],
    selectedSessionId: "ag", selectedSpaceId: spaceA.id,
  });
});

describe("Kanban local do espaço", () => {
  it("abre vazio, sem tarefas de exemplo e sem sincronização externa", async () => {
    render(<KanbanTab />);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("store_get", { name: "kanban" }));
    expect(screen.getByTestId("kanban-empty")).toBeInTheDocument();
    expect(screen.queryByText(/gh CLI|GitHub|Jira|Azure/i)).not.toBeInTheDocument();
  });

  it("mostra só o board do espaço selecionado e troca junto com o espaço", async () => {
    boards[spaceA.id] = { tasks: [tarefa] };
    boards[spaceB.id] = { tasks: [{ ...tarefa, id: "t2", key: "TASK-9", title: "Outro espaço" }] };
    render(<KanbanTab />);
    expect(await screen.findByText("Revisar guardrail")).toBeInTheDocument();

    act(() => useAppStore.getState().selectSpace(spaceB.id));

    expect(await screen.findByText("Outro espaço")).toBeInTheDocument();
    expect(screen.queryByText("Revisar guardrail")).not.toBeInTheDocument();
  });

  it("lista como responsáveis os terminais do espaço, identificados pelo harness", async () => {
    boards[spaceA.id] = { tasks: [tarefa] };
    render(<KanbanTab />);
    await screen.findByText("Revisar guardrail");

    const select = screen.getByLabelText(/Responsável por TASK-1/i);
    const options = Array.from(select.querySelectorAll("option")).map((o) => o.textContent);
    expect(options.some((o) => o?.includes("claude") && o?.includes("Claude Code"))).toBe(true);
    expect(options.some((o) => o?.includes("Shell 2"))).toBe(true);
    // Terminal de outro espaço não entra.
    expect(options.some((o) => o?.includes("Codex"))).toBe(false);
  });

  it("envia a tarefa ao agente responsável e move para Em Execução", async () => {
    boards[spaceA.id] = { tasks: [{ ...tarefa, assignee_session_id: agente.id }] };
    render(<KanbanTab />);
    await screen.findByText("Revisar guardrail");

    fireEvent.click(screen.getByRole("button", { name: /Enviar TASK-1/i }));

    await waitFor(() => expect(writeMock).toHaveBeenCalled());
    const [sessionId, payload] = writeMock.mock.calls[0] as unknown as [string, string];
    expect(sessionId).toBe("ag");
    expect(payload).toContain("TASK-1");
    expect(payload).toContain("Revisar guardrail");
    expect(payload.slice(0, -1)).not.toContain("\n");
    await waitFor(() => expect(boards[spaceA.id].tasks[0].status).toBe("in_progress"));
  });

  it("recusa envio para terminal sem agente rodando", async () => {
    boards[spaceA.id] = { tasks: [{ ...tarefa, assignee_session_id: shell.id }] };
    render(<KanbanTab />);
    await screen.findByText("Revisar guardrail");

    fireEvent.click(screen.getByRole("button", { name: /Enviar TASK-1/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/sem agente|não tem agente/i);
    expect(writeMock).not.toHaveBeenCalled();
  });

  it("avisa quando o terminal responsável foi encerrado", async () => {
    boards[spaceA.id] = { tasks: [{ ...tarefa, assignee_session_id: "sumiu" }] };
    render(<KanbanTab />);
    await screen.findByText("Revisar guardrail");
    expect(screen.getByTestId("assignee-warning-t1")).toHaveTextContent(/encerrado/i);
  });

  it("grava a atribuição escolhida no board do espaço", async () => {
    boards[spaceA.id] = { tasks: [tarefa] };
    render(<KanbanTab />);
    await screen.findByText("Revisar guardrail");

    fireEvent.change(screen.getByLabelText(/Responsável por TASK-1/i), { target: { value: agente.id } });

    await waitFor(() => expect(boards[spaceA.id].tasks[0].assignee_session_id).toBe(agente.id));
  });

  it("cria tarefa local no board do espaço atual", async () => {
    render(<KanbanTab />);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("store_get", { name: "kanban" }));
    fireEvent.click(screen.getByRole("button", { name: /Nova Tarefa/i }));
    fireEvent.change(screen.getByLabelText(/título da tarefa/i), { target: { value: "Rodar os testes" } });
    fireEvent.submit(screen.getByTestId("new-task-form"));

    await waitFor(() => expect(boards[spaceA.id]?.tasks.some((t) => t.title === "Rodar os testes")).toBe(true));
    expect(boards[spaceB.id]).toBeUndefined();
  });
});

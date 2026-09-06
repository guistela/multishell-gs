import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { markOutput, resetActivity } from "../../terminal/agentActivity";
import { invokeMock, spaceA, spaceB } from "../../../test/bridge-mocks";
import "../../../i18n";
import { useAppStore } from "../../../store";
import type { Session } from "../../../types";

vi.mock("../../terminal/Terminal", () => ({ Terminal: ({ session }: { session: Session }) => <div data-testid={`terminal-${session.id}`} /> }));
import { Workspace } from "../Workspace";

const a: Session = { id: "a", title: "Alpha", space_id: spaceA.id, provider_id: null, bypass: false, cwd: "/a", harness_running: false, detached: false };
const b = { ...a, id: "b", title: "Beta" };
const c = { ...a, id: "c", title: "Work", space_id: spaceB.id };

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockResolvedValue(undefined);
  resetActivity();
  useAppStore.setState({ sessions: [a, b, c], spaces: [spaceA, spaceB], selectedSessionId: "a", selectedSpaceId: spaceA.id, spaceLayouts: {}, workspaceTab: "terminals" });
});

describe("workspace layouts", () => {
  it("shows only the current space and keeps terminal instances across layout changes", () => {
    render(<Workspace />);
    const alpha = screen.getByTestId("terminal-a");
    const beta = screen.getByTestId("terminal-b");
    expect(screen.getAllByRole("article").map((x) => x.getAttribute("aria-label"))).toEqual(["Alpha"]);
    for (const mode of ["grid", "vertical", "horizontal"]) {
      fireEvent.change(screen.getByRole("combobox", { name: "Visualização" }), { target: { value: mode } });
      expect(screen.getAllByRole("article").map((x) => x.getAttribute("aria-label"))).toEqual(["Alpha", "Beta"]);
      expect(screen.getByTestId("terminal-a")).toBe(alpha);
      expect(screen.getByTestId("terminal-b")).toBe(beta);
    }
    act(() => useAppStore.getState().selectSpace(spaceB.id));
    expect(screen.getAllByRole("article").map((x) => x.getAttribute("aria-label"))).toEqual(["Work"]);
    expect(screen.getByTestId("terminal-a")).toBe(alpha);
  });

  it("persists separate preferences for each space", () => {
    render(<Workspace />);
    const select = screen.getByRole("combobox", { name: "Visualização" });
    fireEvent.change(select, { target: { value: "grid" } });
    act(() => useAppStore.getState().selectSpace(spaceB.id));
    expect(select).toHaveValue("single");
    fireEvent.change(select, { target: { value: "horizontal" } });
    act(() => useAppStore.getState().selectSpace(spaceA.id));
    expect(select).toHaveValue("grid");
    expect(invokeMock).toHaveBeenCalledWith("store_set", { name: "workspace-layouts", value: { [spaceA.id]: "grid", [spaceB.id]: "horizontal" } });
  });

  it("list selects a terminal while keeping the overview", () => {
    render(<Workspace />);
    fireEvent.change(screen.getByRole("combobox", { name: "Visualização" }), { target: { value: "list" } });
    fireEvent.click(screen.getByRole("button", { name: "Selecionar Beta" }));
    expect(screen.getAllByRole("article").map((x) => x.getAttribute("aria-label"))).toEqual(["Beta"]);
    expect(screen.getByRole("button", { name: "Selecionar Alpha" })).toBeInTheDocument();
  });

  it("selects an empty space and creates its first terminal there", () => {
    useAppStore.setState({ sessions: [a, b] });
    render(<Workspace />);
    act(() => useAppStore.getState().selectSpace(spaceB.id));
    expect(screen.queryAllByRole("article")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "+ Terminal" }));
    const state = useAppStore.getState();
    expect(state.sessions.find((s) => s.id === state.selectedSessionId)?.space_id).toBe(spaceB.id);
  });

  it("permite fechar terminal diretamente pelo botão do tile mantendo o espaço atual", () => {
    render(<Workspace />);
    // Alpha está visível no modo single do spaceA
    const closeAlpha = screen.getByRole("button", { name: "Fechar Alpha" });
    fireEvent.click(closeAlpha);
    const state = useAppStore.getState();
    expect(state.sessions.find((s) => s.id === "a")).toBeUndefined();
    // Como sobrou 'b' no spaceA, b deve ser selecionado e o espaço continua spaceA
    expect(state.selectedSessionId).toBe("b");
    expect(state.selectedSpaceId).toBe(spaceA.id);
  });

  it("permite minimizar da tela cheia para grade e maximizar da grade para tela cheia", () => {
    render(<Workspace />);
    // Em modo single com 2 sessões no spaceA, deve haver botão de restaurar/minimizar
    const restoreBtn = screen.getByRole("button", { name: "Minimizar tela cheia (voltar para grade)" });
    fireEvent.click(restoreBtn);
    expect(useAppStore.getState().spaceLayouts[spaceA.id]).toBe("grid");

    // Na grade, agora ambos Alpha e Beta têm botão de expandir/maximizar
    const focusAlpha = screen.getByRole("button", { name: "Expandir Alpha" });
    fireEvent.click(focusAlpha);
    expect(useAppStore.getState().spaceLayouts[spaceA.id]).toBe("single");
    expect(useAppStore.getState().selectedSessionId).toBe("a");
  });

  it("mostra uma aba para cada terminal do espaço e troca o terminal ativo ao clicar", () => {
    render(<Workspace />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((x) => x.textContent)).toEqual(expect.arrayContaining([expect.stringContaining("Alpha"), expect.stringContaining("Beta")]));
    fireEvent.click(screen.getByRole("tab", { name: /Beta/ }));
    expect(useAppStore.getState().selectedSessionId).toBe("b");
    expect(screen.getByRole("tab", { name: /Beta/ })).toHaveAttribute("aria-selected", "true");
  });

  it("fecha um terminal pelo X da própria aba", () => {
    render(<Workspace />);
    fireEvent.click(screen.getByRole("button", { name: "Fechar aba Alpha" }));
    const state = useAppStore.getState();
    expect(state.sessions.find((s) => s.id === "a")).toBeUndefined();
    expect(state.selectedSessionId).toBe("b");
  });

  it("mostra apenas as abas dos terminais do espaço atual", () => {
    render(<Workspace />);
    act(() => useAppStore.getState().selectSpace(spaceB.id));
    expect(screen.getAllByRole("tab").map((x) => x.querySelector(".terminal-tab-title")?.textContent)).toEqual(["Work"]);
  });

  it("concentra as ações de terminal na faixa de abas, sem duplicar na barra de abas", () => {
    render(<Workspace />);
    const strip = within(screen.getByRole("tablist", { name: /abas dos terminais/i }));
    expect(strip.getByRole("button", { name: "+ Terminal" })).toBeInTheDocument();
    expect(strip.getByRole("button", { name: "+ Agente" })).toBeInTheDocument();
    expect(strip.getByRole("combobox", { name: "Visualização" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "+ Terminal" })).toHaveLength(1);
  });

  it("mantém a faixa de abas disponível em espaço sem terminais", () => {
    render(<Workspace />);
    act(() => useAppStore.getState().selectSpace(spaceB.id));
    act(() => useAppStore.getState().removeSession("c"));
    expect(screen.getByRole("button", { name: "+ Terminal" })).toBeInTheDocument();
  });

  it("não usa emojis de raio nas abas dos terminais", () => {
    useAppStore.setState({ sessions: [{ ...a, bypass: true }, b, c] });
    render(<Workspace />);
    expect(screen.queryAllByText("⚡")).toHaveLength(0);
    expect(within(screen.getByRole("tab", { name: /Alpha/ })).getByTestId("tab-dot")).toBeInTheDocument();
  });

  it("mostra na aba se o agente está trabalhando ou parado", async () => {
    useAppStore.setState({ sessions: [{ ...a, harness_running: true }, b, c] });
    markOutput("a", Date.now());
    render(<Workspace />);

    const alpha = screen.getByRole("tab", { name: /Alpha/ });
    expect(within(alpha).getByTestId("tab-agent-state")).toHaveAttribute("data-state", "working");

    // Passado o silêncio, o agente conta como parado esperando o usuário.
    markOutput("a", Date.now() - 5000);
    await waitFor(() =>
      expect(within(screen.getByRole("tab", { name: /Alpha/ })).getByTestId("tab-agent-state")).toHaveAttribute("data-state", "idle")
    );
  });

  it("terminal sem harness não mostra estado de agente", () => {
    render(<Workspace />);
    expect(within(screen.getByRole("tab", { name: /Beta/ })).queryByTestId("tab-agent-state")).toBeNull();
  });

  it("mostra na aba um indicador de memória só para o terminal que está pesando", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "session_metrics") {
        return [
          { session_id: "a", pid: 1, bytes_in: 0, bytes_out: 0, started_at: new Date().toISOString(), memory_bytes: 2 * 1024 * 1024 * 1024 },
          { session_id: "b", pid: 2, bytes_in: 0, bytes_out: 0, started_at: new Date().toISOString(), memory_bytes: 30 * 1024 * 1024 },
        ];
      }
      return undefined;
    });
    render(<Workspace />);
    const alpha = await screen.findByRole("tab", { name: /Alpha/ });
    expect(within(alpha).getByTestId("tab-memory")).toHaveTextContent("2 GB");
    expect(within(screen.getByRole("tab", { name: /Beta/ })).queryByTestId("tab-memory")).toBeNull();
  });

  it("oferece handoff multiagente no menu da aba do terminal", () => {
    render(<Workspace />);
    fireEvent.contextMenu(screen.getByRole("tab", { name: /Alpha/ }));
    expect(screen.getByText("Passar contexto para")).toBeInTheDocument();
    expect(screen.getByText("Continuar em novo agente")).toBeInTheDocument();
    expect(screen.getByText("Abrir central de handoff")).toBeInTheDocument();
  });

  it("permite alternar para a aba de Kanban do espaço", () => {
    render(<Workspace />);
    fireEvent.click(screen.getByRole("button", { name: /Kanban/i }));
    expect(useAppStore.getState().workspaceTab).toBe("kanban");
    expect(screen.getByRole("button", { name: /Nova Tarefa/i })).toBeInTheDocument();
  });

  it("permite alternar para a aba de Contas do espaço", async () => {
    render(<Workspace />);
    fireEvent.click(screen.getByRole("button", { name: /^Contas$/ }));
    expect(useAppStore.getState().workspaceTab).toBe("accounts");
    expect(await screen.findByTestId("accounts-scope-hint")).toBeInTheDocument();
  });
});

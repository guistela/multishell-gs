import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
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
  useAppStore.setState({ sessions: [a, b, c], spaces: [spaceA, spaceB], selectedSessionId: "a", selectedSpaceId: spaceA.id, spaceLayouts: {} });
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
});

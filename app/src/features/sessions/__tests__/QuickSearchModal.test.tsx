import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { claude, spaceA, spaceB } from "../../../test/bridge-mocks";
import "../../../i18n";
import { DEFAULT_SETTINGS, useAppStore } from "../../../store";
import { QuickSearchModal } from "../QuickSearchModal";

beforeEach(() => {
  useAppStore.setState({
    spaces: [spaceA, spaceB],
    providers: [claude],
    settings: DEFAULT_SETTINGS,
    loaded: true,
    migration: null,
    restoredSessionIds: new Set(),
    sessions: [
      { id: "s1", title: "Frontend Server", space_id: spaceA.id, provider_id: claude.id, bypass: true, cwd: "/proj/web", harness_running: true, detached: false },
      { id: "s2", title: "Backend API", space_id: spaceB.id, provider_id: null, bypass: false, cwd: "/proj/api", harness_running: false, detached: false },
    ],
    selectedSessionId: "s1",
    selectedSpaceId: spaceA.id,
  });
});

describe("QuickSearchModal", () => {
  it("não renderiza nada quando open é false", () => {
    const { container } = render(<QuickSearchModal open={false} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it("renderiza espaços e terminais quando aberto", () => {
    render(<QuickSearchModal open={true} onClose={() => {}} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Buscar terminais e espaços...")).toBeInTheDocument();
    // Espaços
    expect(screen.getAllByText("Pessoal").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Trabalho").length).toBeGreaterThan(0);
    // Terminais
    expect(screen.getByText("Frontend Server")).toBeInTheDocument();
    expect(screen.getByText("Backend API")).toBeInTheDocument();
  });

  it("filtra terminais pelo título e cwd", () => {
    render(<QuickSearchModal open={true} onClose={() => {}} />);
    const input = screen.getByPlaceholderText("Buscar terminais e espaços...");

    fireEvent.change(input, { target: { value: "Frontend" } });
    expect(screen.getByText("Frontend Server")).toBeInTheDocument();
    expect(screen.queryByText("Backend API")).toBeNull();

    // Busca por caminho cwd
    fireEvent.change(input, { target: { value: "/proj/api" } });
    expect(screen.getByText("Backend API")).toBeInTheDocument();
    expect(screen.queryByText("Frontend Server")).toBeNull();
  });

  it("filtra espaços pelo nome", () => {
    render(<QuickSearchModal open={true} onClose={() => {}} />);
    const input = screen.getByPlaceholderText("Buscar terminais e espaços...");

    fireEvent.change(input, { target: { value: "Trabalho" } });
    expect(screen.getAllByText("Trabalho").length).toBeGreaterThan(0);
  });

  it("seleciona espaço com Enter e fecha o modal", () => {
    const close = vi.fn();
    render(<QuickSearchModal open={true} onClose={close} />);
    const input = screen.getByPlaceholderText("Buscar terminais e espaços...");

    fireEvent.change(input, { target: { value: "Trabalho" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(useAppStore.getState().selectedSpaceId).toBe(spaceB.id);
    expect(close).toHaveBeenCalled();
  });

  it("seleciona terminal com clique e fecha o modal", () => {
    const close = vi.fn();
    render(<QuickSearchModal open={true} onClose={close} />);

    fireEvent.click(screen.getByText("Backend API"));
    expect(useAppStore.getState().selectedSessionId).toBe("s2");
    expect(close).toHaveBeenCalled();
  });

  it("fecha com tecla Escape", () => {
    const close = vi.fn();
    render(<QuickSearchModal open={true} onClose={close} />);
    const input = screen.getByPlaceholderText("Buscar terminais e espaços...");

    fireEvent.keyDown(input, { key: "Escape" });
    expect(close).toHaveBeenCalled();
  });
});

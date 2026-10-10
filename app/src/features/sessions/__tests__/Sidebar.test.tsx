import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { claude, invokeMock, spaceA, spaceB } from "../../../test/bridge-mocks";
import "../../../i18n";
import { DEFAULT_SETTINGS, useAppStore } from "../../../store";
import { IDLE_AFTER_MS, markOutput, resetActivity } from "../../terminal/agentActivity";
import { Sidebar } from "../Sidebar";

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockResolvedValue(undefined);
  resetActivity();
  useAppStore.setState({
    spaces: [spaceA, spaceB], providers: [claude], settings: DEFAULT_SETTINGS, loaded: true, migration: null, restoredSessionIds: new Set(),
    sessions: [
      { id: "s1", title: "Alpha", space_id: spaceA.id, provider_id: claude.id, bypass: true, cwd: null, harness_running: false, detached: false },
      { id: "s2", title: "Beta", space_id: spaceB.id, provider_id: null, bypass: false, cwd: null, harness_running: false, detached: false },
      { id: "s3", title: "Gamma", space_id: spaceA.id, provider_id: null, bypass: false, cwd: null, harness_running: false, detached: false },
    ],
    selectedSessionId: "s1",
  });
});

describe("Sidebar", () => {
  it("agrupa sessões por espaço, com cor e nome", () => {
    render(<Sidebar onOpenSettings={() => {}} />);
    const a = within(screen.getByTestId(`space-${spaceA.id}`));
    const b = within(screen.getByTestId(`space-${spaceB.id}`));
    expect(a.getByText("Pessoal")).toBeInTheDocument();
    expect(a.getAllByRole("listitem").map((li) => li.querySelector(".title")?.textContent)).toEqual(["Alpha", "Gamma"]);
    expect(b.getAllByRole("listitem").map((li) => li.querySelector(".title")?.textContent)).toEqual(["Beta"]);
  });

  it("mostra ícone do provider e marcador discreto de bypass, sem emoji de raio", () => {
    render(<Sidebar onOpenSettings={() => {}} />);
    // O ícone aparece na sessão e na lista de harnesses disponíveis.
    expect(screen.getAllByRole("img", { name: "Claude Code" }).length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("bypass-dot")).toHaveLength(1);
    expect(screen.queryAllByText("⚡")).toHaveLength(0);
  });

  it("o ponto do harness distingue agente trabalhando de agente parado", async () => {
    const rodando = { id: "s1", title: "Alpha", space_id: spaceA.id, provider_id: claude.id, bypass: false, cwd: null, harness_running: true, detached: false };
    useAppStore.setState({ sessions: [rodando] });
    markOutput("s1", Date.now());
    render(<Sidebar onOpenSettings={() => {}} />);
    expect(screen.getByTestId("harness-dot")).toHaveAttribute("data-state", "working");

    // A marca só avança: para simular o silêncio, zera e remarca no passado.
    resetActivity();
    markOutput("s1", Date.now() - IDLE_AFTER_MS - 1000);
    await waitFor(() => expect(screen.getByTestId("harness-dot")).toHaveAttribute("data-state", "idle"));
  });

  it("sessão com harness_running mostra ponto verde no glyph", () => {
    useAppStore.setState({ sessions: [{ id: "s1", title: "Alpha", space_id: spaceA.id, provider_id: claude.id, bypass: false, cwd: null, harness_running: true, detached: false }] });
    render(<Sidebar onOpenSettings={() => {}} />);
    expect(screen.getByTestId("harness-dot")).toBeInTheDocument();
  });

  it("sem harness_running não mostra ponto", () => {
    render(<Sidebar onOpenSettings={() => {}} />);
    expect(screen.queryByTestId("harness-dot")).toBeNull();
  });

  it("sessão detached mostra glyph ⧉ e continua selecionável", () => {
    useAppStore.setState({ sessions: [{ id: "s1", title: "Alpha", space_id: spaceA.id, provider_id: null, bypass: false, cwd: null, harness_running: false, detached: true }], selectedSessionId: null });
    render(<Sidebar onOpenSettings={() => {}} />);
    expect(screen.getByTitle("Este terminal está em outra janela")).toHaveTextContent("⧉");
    fireEvent.click(screen.getByText("Alpha"));
    expect(useAppStore.getState().selectedSessionId).toBe("s1");
  });

  it("sessão não detached não mostra ⧉", () => {
    render(<Sidebar onOpenSettings={() => {}} />);
    expect(screen.queryByText("⧉")).toBeNull();
  });

  it("+ cria sessão no espaço certo", () => {
    render(<Sidebar onOpenSettings={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Nova sessão em Trabalho" }));
    const created = useAppStore.getState().sessions[useAppStore.getState().sessions.length - 1];
    expect(created.space_id).toBe(spaceB.id);
    expect(useAppStore.getState().selectedSessionId).toBe(created.id);
  });

  it("duplo clique renomeia", () => {
    render(<Sidebar onOpenSettings={() => {}} />);
    fireEvent.doubleClick(screen.getByText("Beta"));
    const input = screen.getByDisplayValue("Beta");
    fireEvent.change(input, { target: { value: "Delta" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(useAppStore.getState().sessions.find((s) => s.id === "s2")?.title).toBe("Delta");
  });

  it("engrenagem abre settings", () => {
    const open = vi.fn();
    render(<Sidebar onOpenSettings={open} />);
    fireEvent.click(screen.getByRole("button", { name: "Configurações" }));
    expect(open).toHaveBeenCalled();
  });

  it("botão direito no espaço abre menu com opções de espaço", () => {
    render(<Sidebar onOpenSettings={() => {}} />);
    fireEvent.contextMenu(screen.getByText("Pessoal"));
    expect(screen.getByText("Novo terminal neste espaço")).toBeInTheDocument();
    expect(screen.getByText("Novo terminal em pasta…")).toBeInTheDocument();
    expect(screen.getByText("Abrir pasta do espaço")).toBeInTheDocument();
    expect(screen.getByText("Configurações do espaço...")).toBeInTheDocument();
  });

  it("botão direito na sessão abre menu e permite duplicar", () => {
    render(<Sidebar onOpenSettings={() => {}} />);
    fireEvent.contextMenu(screen.getByText("Alpha"));
    expect(screen.getByText("Duplicar terminal")).toBeInTheDocument();
    expect(screen.getByText("Reiniciar terminal")).toBeInTheDocument();
    expect(screen.getByText("Limpar tela")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Duplicar terminal"));
    const sessions = useAppStore.getState().sessions;
    expect(sessions).toHaveLength(4);
    expect(sessions[sessions.length - 1].title).toBe("Alpha (2)");
  });

  it("botão + no cabeçalho abre criação de espaço em settings", () => {
    const open = vi.fn();
    render(<Sidebar onOpenSettings={open} />);
    fireEvent.click(screen.getByTestId("sidebar-add-space"));
    expect(open).toHaveBeenCalledWith("spaces", true);
  });

  it("botão Criar espaço na lista abre criação de espaço em settings", () => {
    const open = vi.fn();
    render(<Sidebar onOpenSettings={open} />);
    fireEvent.click(screen.getByTestId("sidebar-new-space-btn"));
    expect(open).toHaveBeenCalledWith("spaces", true);
  });

  it("botão + no modo recolhido abre criação de espaço", () => {
    const open = vi.fn();
    render(<Sidebar collapsed onOpenSettings={open} />);
    fireEvent.click(screen.getByTestId("sidebar-add-space-avatar"));
    expect(open).toHaveBeenCalledWith("spaces", true);
  });

  it("menu de contexto do espaço inclui opção Criar espaço", () => {
    const open = vi.fn();
    render(<Sidebar onOpenSettings={open} />);
    fireEvent.contextMenu(screen.getByText("Pessoal"));
    const menu = screen.getByRole("menu");
    const createItem = within(menu).getByText("Criar espaço");
    expect(createItem).toBeInTheDocument();
    fireEvent.click(createItem);
    expect(open).toHaveBeenCalledWith("spaces", true);
  });

  it("permite collapsar e expandir um espaço no sidebar", () => {
    render(<Sidebar onOpenSettings={() => {}} />);
    const collapseBtn = screen.getByTestId(`collapse-space-${spaceA.id}`);
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Gamma")).toBeInTheDocument();

    // Collapsa o espaço A
    fireEvent.click(collapseBtn);
    expect(screen.queryByText("Alpha")).toBeNull();
    expect(screen.queryByText("Gamma")).toBeNull();
    // Espaço B continua visível
    expect(screen.getByText("Beta")).toBeInTheDocument();
    // Mostra badge com número de sessões
    expect(screen.getByText("2")).toBeInTheDocument();

    // Expande o espaço A novamente
    fireEvent.click(collapseBtn);
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Gamma")).toBeInTheDocument();
  });

  it("pesquisa no sidebar filtra espaços e sessões em tempo real", () => {
    render(<Sidebar onOpenSettings={() => {}} />);
    const searchInput = screen.getByPlaceholderText("Buscar terminais e espaços...");

    // Busca por "Beta" -> só mostra Beta no espaço Trabalho
    fireEvent.change(searchInput, { target: { value: "Beta" } });
    expect(screen.queryByText("Alpha")).toBeNull();
    expect(screen.queryByText("Gamma")).toBeNull();
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.getByText("Trabalho")).toBeInTheDocument();

    // Busca sem correspondência -> mensagem de nenhum resultado
    fireEvent.change(searchInput, { target: { value: "inexistente" } });
    expect(screen.getByText("Nenhum resultado encontrado")).toBeInTheDocument();

    // Limpar busca pelo botão ✕
    const clearBtn = screen.getByRole("button", { name: "Limpar busca" });
    fireEvent.click(clearBtn);
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.getByText("Gamma")).toBeInTheDocument();
  });
});

describe("Sidebar: informação por espaço", () => {
  it("o cabeçalho do espaço sempre mostra quantos terminais ele tem", () => {
    render(<Sidebar onOpenSettings={() => {}} />);
    expect(screen.getByTestId(`space-count-${spaceA.id}`)).toHaveTextContent("2");
    expect(screen.getByTestId(`space-count-${spaceB.id}`)).toHaveTextContent("1");
  });

  it("espaço vazio não mostra contador", () => {
    useAppStore.setState({ sessions: [] });
    render(<Sidebar onOpenSettings={() => {}} />);
    expect(screen.queryByTestId(`space-count-${spaceA.id}`)).not.toBeInTheDocument();
  });

  it("mostra quantos agentes estão trabalhando no espaço", () => {
    useAppStore.setState({
      sessions: [
        { id: "s1", title: "Alpha", space_id: spaceA.id, provider_id: claude.id, bypass: false, cwd: null, harness_running: true, detached: false },
        { id: "s3", title: "Gamma", space_id: spaceA.id, provider_id: null, bypass: false, cwd: null, harness_running: false, detached: false },
      ],
    });
    markOutput("s1", Date.now());
    render(<Sidebar onOpenSettings={() => {}} />);
    expect(screen.getByTestId(`space-working-${spaceA.id}`)).toHaveTextContent("1");
  });

  it("sem agente trabalhando, o espaço não mostra o indicador", () => {
    render(<Sidebar onOpenSettings={() => {}} />);
    expect(screen.queryByTestId(`space-working-${spaceA.id}`)).not.toBeInTheDocument();
  });
});

describe("Sidebar: pasta da sessão", () => {
  it("mostra o nome da pasta abaixo do título", () => {
    useAppStore.setState({
      sessions: [{ id: "s1", title: "Claude Code", space_id: spaceA.id, provider_id: claude.id, bypass: false, cwd: "/Users/gs/Projects/multishell-gs", harness_running: false, detached: false }],
    });
    render(<Sidebar onOpenSettings={() => {}} />);
    const linha = screen.getByTestId("session-cwd");
    expect(linha).toHaveTextContent("multishell-gs");
    // O caminho inteiro fica no title, para quem precisar conferir.
    expect(linha).toHaveAttribute("title", "/Users/gs/Projects/multishell-gs");
  });

  it("sessão sem cwd não mostra linha de pasta", () => {
    render(<Sidebar onOpenSettings={() => {}} />);
    expect(screen.queryByTestId("session-cwd")).not.toBeInTheDocument();
  });

  it("renomeando, a linha da pasta some para o input caber", () => {
    useAppStore.setState({
      sessions: [{ id: "s1", title: "Alpha", space_id: spaceA.id, provider_id: null, bypass: false, cwd: "/tmp/x", harness_running: false, detached: false }],
    });
    render(<Sidebar onOpenSettings={() => {}} />);
    fireEvent.doubleClick(screen.getByText("Alpha"));
    expect(screen.queryByTestId("session-cwd")).not.toBeInTheDocument();
  });
});

describe("Sidebar: seção de harnesses", () => {
  it("recolhe e expande a lista de harnesses", () => {
    render(<Sidebar onOpenSettings={() => {}} />);
    const botao = screen.getByTestId("harness-section-toggle");
    expect(botao).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("sidebar-harness-list")).toBeInTheDocument();

    fireEvent.click(botao);
    expect(botao).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("sidebar-harness-list")).not.toBeInTheDocument();
  });
});

describe("Sidebar: ordem dos espaços", () => {
  const order = () => screen.getAllByTestId(/^space-/).filter((el) => el.tagName === "SECTION").map((el) => el.getAttribute("data-testid"));

  it("o menu do espaço move para baixo e para cima", () => {
    invokeMock.mockImplementation(async (cmd: string, args?: { ids: string[] }) =>
      cmd === "spaces_reorder" ? args!.ids.map((id) => [spaceA, spaceB].find((s) => s.id === id)) : undefined);
    render(<Sidebar onOpenSettings={() => {}} />);
    fireEvent.contextMenu(screen.getByText("Pessoal"));
    expect(screen.getByText("Mover para cima").closest("button")).toBeDisabled();
    fireEvent.click(screen.getByText("Mover para baixo"));
    expect(order()).toEqual([`space-${spaceB.id}`, `space-${spaceA.id}`]);
    expect(invokeMock).toHaveBeenCalledWith("spaces_reorder", { ids: [spaceB.id, spaceA.id] });
    fireEvent.contextMenu(screen.getByText("Pessoal"));
    fireEvent.click(screen.getByText("Mover para cima"));
    expect(order()).toEqual([`space-${spaceA.id}`, `space-${spaceB.id}`]);
  });

  it("arrastar o título de um espaço sobre outro troca a posição", () => {
    render(<Sidebar onOpenSettings={() => {}} />);
    const data = new Map<string, string>();
    const dataTransfer = { setData: (k: string, v: string) => data.set(k, v), getData: (k: string) => data.get(k) ?? "", types: ["application/x-multishell-space"], effectAllowed: "", dropEffect: "" };
    const header = (id: string) => screen.getByTestId(`space-${id}`).querySelector("h2")!;
    fireEvent.dragStart(header(spaceB.id), { dataTransfer });
    fireEvent.dragOver(header(spaceA.id), { dataTransfer });
    fireEvent.drop(header(spaceA.id), { dataTransfer });
    expect(order()).toEqual([`space-${spaceB.id}`, `space-${spaceA.id}`]);
  });
});

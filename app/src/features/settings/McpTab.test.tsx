import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { invokeMock, spaceA, spaceB } from "../../test/bridge-mocks";
import "../../i18n";
import { useAppStore } from "../../store";
import type { McpServer } from "../../api";

import McpTab from "./McpTab";

const filesystem: McpServer = {
  id: "mcp-1",
  name: "filesystem",
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-filesystem", "/meu projeto"],
  env: { ROOT: "/repo" },
  enabled: true,
};

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockImplementation(async (cmd: string) => {
    if (cmd === "mcp_list") return [filesystem];
    if (cmd === "mcp_save") return { path: "/espaco/projeto/.mcp.json", enabled: 1 };
    return undefined;
  });
  useAppStore.setState({ spaces: [spaceA], selectedSpaceId: spaceA.id });
});

describe("McpTab", () => {
  it("carrega os servidores do espaço selecionado ao abrir", async () => {
    render(<McpTab />);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("mcp_list", { spaceId: spaceA.id }));
    expect(await screen.findByDisplayValue("filesystem")).toBeInTheDocument();
    expect(screen.getByDisplayValue("npx")).toBeInTheDocument();
    // Um argumento por linha: caminhos com espaço continuam inteiros.
    expect(screen.getByRole("textbox", { name: /argumentos/i })).toHaveValue("-y\n@modelcontextprotocol/server-filesystem\n/meu projeto");
    expect(screen.getByRole("checkbox", { name: /habilitado/i })).toBeChecked();
  });

  it("salva o servidor editado com args por linha e env em pares chave/valor", async () => {
    render(<McpTab />);
    await screen.findByDisplayValue("filesystem");

    fireEvent.change(screen.getByDisplayValue("npx"), { target: { value: "node" } });
    fireEvent.change(screen.getByRole("textbox", { name: /argumentos/i }), {
      target: { value: "server.js\n--root=/meu projeto\n" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^salvar$/i }));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("mcp_save", {
        spaceId: spaceA.id,
        servers: [
          { id: "mcp-1", name: "filesystem", command: "node", args: ["server.js", "--root=/meu projeto"], env: { ROOT: "/repo" }, enabled: true },
        ],
      })
    );
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("/espaco/projeto/.mcp.json");
    expect(status).toHaveTextContent("1");
  });

  it("adiciona e remove servidor da lista antes de salvar", async () => {
    render(<McpTab />);
    await screen.findByDisplayValue("filesystem");

    fireEvent.click(screen.getByRole("button", { name: /adicionar servidor/i }));
    const names = screen.getAllByRole("textbox", { name: /nome/i });
    expect(names).toHaveLength(2);
    fireEvent.change(names[1], { target: { value: "github" } });

    fireEvent.click(screen.getAllByRole("button", { name: /remover servidor/i })[0]);
    fireEvent.click(screen.getByRole("button", { name: /^salvar$/i }));

    await waitFor(() => {
      const call = invokeMock.mock.calls.find((c) => c[0] === "mcp_save");
      expect(call?.[1].servers).toEqual([
        { id: expect.any(String), name: "github", command: "", args: [], enabled: true },
      ]);
    });
  });

  it("mostra o erro do backend quando o nome está repetido", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "mcp_list") return [filesystem];
      throw new Error("Nome de servidor repetido: filesystem.");
    });
    render(<McpTab />);
    await screen.findByDisplayValue("filesystem");

    fireEvent.click(screen.getByRole("button", { name: /^salvar$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/repetido/i);
  });

  it("permite salvar com nome vazio para o backend recusar", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "mcp_list") return [];
      throw new Error("Servidor sem nome.");
    });
    render(<McpTab />);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("mcp_list", { spaceId: spaceA.id }));

    fireEvent.click(screen.getByRole("button", { name: /adicionar servidor/i }));
    const save = screen.getByRole("button", { name: /^salvar$/i });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    expect(await screen.findByRole("alert")).toHaveTextContent(/sem nome/i);
  });

  it("troca de espaço recarrega a lista", async () => {
    useAppStore.setState({ spaces: [spaceA, spaceB], selectedSpaceId: spaceA.id });
    render(<McpTab />);
    await screen.findByDisplayValue("filesystem");

    fireEvent.change(screen.getByRole("combobox", { name: /espaço/i }), { target: { value: spaceB.id } });
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("mcp_list", { spaceId: spaceB.id }));
  });
});

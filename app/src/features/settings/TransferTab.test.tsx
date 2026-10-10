import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import "../../i18n";
import { invokeMock, spaceA, spaceB } from "../../test/bridge-mocks";
import { useAppStore } from "../../store";
import TransferTab from "./TransferTab";

beforeEach(() => {
  invokeMock.mockReset();
  useAppStore.setState({ spaces: [spaceA] });
});

describe("TransferTab", () => {
  it("avisa que segredos não vão no arquivo", () => {
    render(<TransferTab />);
    expect(screen.getByText(/segredos não vão/i)).toBeInTheDocument();
  });

  it("exporta e mostra onde gravou", async () => {
    invokeMock.mockResolvedValue("/Users/gs/multishell.json");
    render(<TransferTab />);
    fireEvent.click(screen.getByRole("button", { name: "Exportar configurações" }));
    expect(await screen.findByRole("status")).toHaveTextContent("/Users/gs/multishell.json");
    expect(invokeMock).toHaveBeenCalledWith("settings_export", {});
  });

  it("importa, recarrega espaços e mostra o resumo", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "settings_import") return { spaces: 2, providers: 1, mcp: 3, backup: "/tmp/b.json" };
      if (cmd === "spaces_list") return [spaceA, spaceB];
      if (cmd === "providers_list") return [];
      return null;
    });
    render(<TransferTab />);
    fireEvent.click(screen.getByRole("button", { name: "Importar configurações" }));
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("2 espaços");
    expect(status).toHaveTextContent("/tmp/b.json");
    expect(useAppStore.getState().spaces).toEqual([spaceA, spaceB]);
  });

  it("cancelar não mostra nada e erro aparece em alerta", async () => {
    invokeMock.mockResolvedValueOnce(null);
    render(<TransferTab />);
    fireEvent.click(screen.getByRole("button", { name: "Importar configurações" }));
    const importBtn = screen.getByRole("button", { name: "Importar configurações" });
    await waitFor(() => expect(importBtn).toBeEnabled());
    expect(screen.queryByRole("status")).toBeNull();

    invokeMock.mockRejectedValueOnce(new Error("Arquivo inválido: não é uma exportação do Multishell."));
    fireEvent.click(screen.getByRole("button", { name: "Importar configurações" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/não é uma exportação/);
  });
});

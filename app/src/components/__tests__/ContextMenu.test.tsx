import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ContextMenu, type MenuItem } from "../ContextMenu";

describe("ContextMenu", () => {
  it("renderiza itens normais, atalhos e separadores", () => {
    const onClick = vi.fn();
    const onClose = vi.fn();
    const items: MenuItem[] = [
      { id: "item1", label: "Copiar", icon: "📋", shortcut: "⌘C", onClick },
      { separator: true },
      { id: "item2", label: "Excluir", icon: "✕", danger: true, onClick },
      { id: "item3", label: "Desabilitado", disabled: true },
    ];

    render(<ContextMenu x={100} y={100} items={items} onClose={onClose} />);

    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByText("Copiar")).toBeInTheDocument();
    expect(screen.getByText("⌘C")).toBeInTheDocument();
    expect(screen.getByText("Excluir")).toBeInTheDocument();
    expect(screen.getByText("Desabilitado")).toBeInTheDocument();

    // Clicar em item executa onClick e onClose
    fireEvent.click(screen.getByText("Copiar"));
    expect(onClick).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();

    // Item desabilitado não chama onClick
    const disabledBtn = screen.getByRole("menuitem", { name: /Desabilitado/ });
    expect(disabledBtn).toBeDisabled();
  });

  it("fecha com tecla Escape", () => {
    const onClose = vi.fn();
    render(<ContextMenu x={50} y={50} items={[{ id: "1", label: "Teste" }]} onClose={onClose} />);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("fecha ao clicar fora", () => {
    const onClose = vi.fn();
    render(
      <div>
        <div data-testid="outside">Fora</div>
        <ContextMenu x={50} y={50} items={[{ id: "1", label: "Teste" }]} onClose={onClose} />
      </div>,
    );

    fireEvent.pointerDown(screen.getByTestId("outside"));
    expect(onClose).toHaveBeenCalled();
  });

  it("exibe submenu ao passar o mouse", () => {
    const onSubClick = vi.fn();
    const onClose = vi.fn();
    const items: MenuItem[] = [
      {
        id: "parent",
        label: "Visualização",
        children: [
          { id: "sub1", label: "Grade", onClick: onSubClick },
          { id: "sub2", label: "Individual" },
        ],
      },
    ];

    render(<ContextMenu x={50} y={50} items={items} onClose={onClose} />);

    expect(screen.queryByText("Grade")).toBeNull();
    fireEvent.mouseEnter(screen.getByText("Visualização").closest(".context-menu-item-wrapper")!);
    expect(screen.getByText("Grade")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Grade"));
    expect(onSubClick).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});

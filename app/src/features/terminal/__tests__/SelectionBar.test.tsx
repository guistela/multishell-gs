import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { spaceA } from "../../../test/bridge-mocks";
import "../../../i18n";
import { useAppStore } from "../../../store";
import type { Provider, Session } from "../../../types";

const writeMock = vi.fn(() => Promise.resolve());
vi.mock("../pty", () => ({ pty: { write: (...args: unknown[]) => writeMock(...(args as [])), kill: () => Promise.resolve() } }));

import { SelectionBar } from "../SelectionBar";

const claude: Provider = {
  id: "p-claude", name: "Claude Code", executable: "claude", args: [], bypass_args: [],
  config_env_key: null, extra_env: [], icon: "sparkles", resume_args: [],
};
const origem: Session = { id: "orig", title: "build", space_id: spaceA.id, provider_id: null, bypass: false, cwd: "/a", harness_running: false, detached: false };
const agente: Session = { ...origem, id: "ag", title: "Claude", provider_id: claude.id, harness_running: true };
const shellPuro: Session = { ...origem, id: "sh", title: "Shell 2" };

const onClose = vi.fn();
const props = { session: origem, selection: "erro de build\nlinha 2", at: { x: 10, y: 20 }, onClose };

beforeEach(() => {
  writeMock.mockClear();
  onClose.mockClear();
  Object.assign(navigator, { clipboard: { writeText: vi.fn(() => Promise.resolve()) } });
  useAppStore.setState({ sessions: [origem, agente, shellPuro], spaces: [spaceA], providers: [claude], selectedSessionId: "orig", selectedSpaceId: spaceA.id });
});

describe("SelectionBar", () => {
  it("copia o trecho limpo e fecha", () => {
    render(<SelectionBar {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Copiar" }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("erro de build\nlinha 2");
    expect(onClose).toHaveBeenCalled();
  });

  it("lista como destino só os agentes rodando no mesmo espaço", () => {
    render(<SelectionBar {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Nova conversa" }));
    expect(screen.getByRole("button", { name: "Claude" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Shell 2" })).toBeNull();
    expect(screen.queryByRole("button", { name: "build" })).toBeNull();
  });

  it("manda o trecho para o agente escolhido, com a instrução padrão", async () => {
    render(<SelectionBar {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Nova conversa" }));
    fireEvent.click(screen.getByRole("button", { name: "Claude" }));

    await waitFor(() => expect(writeMock).toHaveBeenCalled());
    const [id, payload] = writeMock.mock.calls[0] as unknown as [string, string];
    expect(id).toBe("ag");
    expect(payload).toContain("erro de build");
    expect(payload).toContain('terminal "build"');
    expect(payload).toContain("próximo passo");
  });

  it("usa a instrução escrita pelo usuário", async () => {
    render(<SelectionBar {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Nova conversa" }));
    fireEvent.change(screen.getByLabelText(/Instrução/i), { target: { value: "Corrige e roda os testes" } });
    fireEvent.click(screen.getByRole("button", { name: "Claude" }));

    await waitFor(() => expect(writeMock).toHaveBeenCalled());
    expect((writeMock.mock.calls[0] as unknown as [string, string])[1]).toContain("Corrige e roda os testes");
  });

  it("abre um agente novo no mesmo espaço quando pedido", () => {
    render(<SelectionBar {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Nova conversa" }));
    fireEvent.click(screen.getByRole("button", { name: "Claude Code" }));

    const nova = useAppStore.getState().sessions.find((s) => s.provider_id === claude.id && s.id !== "ag");
    expect(nova?.space_id).toBe(spaceA.id);
    expect(nova?.auto_start_harness).toBe(true);
    expect(onClose).toHaveBeenCalled();
  });

  it("fecha com Escape", () => {
    render(<SelectionBar {...props} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("fecha ao clicar fora", () => {
    render(<SelectionBar {...props} />);
    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalled();
  });
});

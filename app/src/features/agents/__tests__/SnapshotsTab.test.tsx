import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { invokeMock, spaceA } from "../../../test/bridge-mocks";
import "../../../i18n";
import { useAppStore } from "../../../store";
import type { Session } from "../../../types";

import { SnapshotsTab } from "../WorkspaceTabs";

const session: Session = { id: "a", title: "Claude", space_id: spaceA.id, provider_id: "p", bypass: false, cwd: "/repo", harness_running: true, detached: false };

const meta = { id: "snap-1", spaceId: spaceA.id, timestamp: "2026-09-06T10:12:00.000Z", label: "Antes do refactor", fileCount: 12 };

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockImplementation(async (cmd: string) => {
    if (cmd === "snapshot_list") return [meta];
    if (cmd === "snapshot_create") return { ...meta, id: "snap-2", label: "Novo ponto", skipped: [], truncated: false };
    if (cmd === "snapshot_restore") return { id: "snap-1", cwd: "/repo", restored: 12, files: [] };
    return undefined;
  });
  useAppStore.setState({ spaces: [spaceA], sessions: [session], selectedSessionId: "a", selectedSpaceId: spaceA.id });
});

describe("SnapshotsTab", () => {
  it("lista os snapshots gravados em disco, sem selo de demonstração", async () => {
    render(<SnapshotsTab />);
    expect(await screen.findByText("Antes do refactor")).toBeInTheDocument();
    expect(screen.queryByTestId("demo-badge")).not.toBeInTheDocument();
    expect(invokeMock).toHaveBeenCalledWith("snapshot_list", { spaceId: spaceA.id });
  });

  it("captura um snapshot com o cwd do terminal ativo", async () => {
    render(<SnapshotsTab />);
    await screen.findByText("Antes do refactor");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Novo ponto" } });
    fireEvent.click(screen.getByRole("button", { name: /Capturar/i }));
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("snapshot_create", { spaceId: spaceA.id, label: "Novo ponto", cwd: "/repo" })
    );
  });

  it("mostra o erro do main quando a pasta não é repositório git", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "snapshot_list") return [];
      throw new Error('A pasta "/repo" não é um repositório git.');
    });
    render(<SnapshotsTab />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "X" } });
    fireEvent.click(screen.getByRole("button", { name: /Capturar/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/não é um repositório git/i);
  });

  it("pede confirmação antes de sobrescrever arquivos no rollback", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<SnapshotsTab />);
    await screen.findByText("Antes do refactor");
    fireEvent.click(screen.getByRole("button", { name: /Rollback/i }));
    await waitFor(() => expect(confirmSpy).toHaveBeenCalled());
    expect(invokeMock).not.toHaveBeenCalledWith("snapshot_restore", expect.anything());

    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: /Rollback/i }));
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("snapshot_restore", { spaceId: spaceA.id, snapshotId: "snap-1", cwd: "/repo" })
    );
    confirmSpy.mockRestore();
  });

  it("avisa quando não há terminal com pasta para capturar", async () => {
    useAppStore.setState({ sessions: [{ ...session, cwd: null }] });
    invokeMock.mockImplementation(async (cmd: string) => (cmd === "snapshot_list" ? [] : null));
    render(<SnapshotsTab />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "X" } });
    fireEvent.click(screen.getByRole("button", { name: /Capturar/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/pasta/i);
  });
});

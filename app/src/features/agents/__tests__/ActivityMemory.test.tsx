import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { invokeMock, spaceA } from "../../../test/bridge-mocks";
import "../../../i18n";
import { useAppStore } from "../../../store";
import type { Session } from "../../../types";

import { ActivityTab } from "../WorkspaceTabs";

const leve: Session = { id: "a", title: "Shell", space_id: spaceA.id, provider_id: null, bypass: false, cwd: null, harness_running: false, detached: false };
const pesada: Session = { ...leve, id: "b", title: "Claude", provider_id: "p", harness_running: true };

const metric = (id: string, mem: number | null) => ({
  session_id: id, pid: 1, bytes_in: 10, bytes_out: 20,
  started_at: new Date(Date.now() - 60_000).toISOString(), memory_bytes: mem,
});

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockImplementation(async (cmd: string) => {
    if (cmd === "session_metrics") return [metric("a", 40 * 1024 * 1024), metric("b", 1600 * 1024 * 1024)];
    return undefined;
  });
  useAppStore.setState({ spaces: [spaceA], sessions: [leve, pesada], selectedSpaceId: spaceA.id });
});

describe("Atividade: memória por sessão", () => {
  it("mostra a memória de cada terminal", async () => {
    render(<ActivityTab />);
    expect(await screen.findByTestId("activity-row-a")).toHaveTextContent("40 MB");
    expect(screen.getByTestId("activity-row-b")).toHaveTextContent("1.6 GB");
  });

  it("marca a sessão que está pesando", async () => {
    render(<ActivityTab />);
    await screen.findByTestId("activity-row-a");
    expect(screen.getByTestId("activity-row-b").querySelector(".mem-heavy")).toBeInTheDocument();
    expect(screen.getByTestId("activity-row-a").querySelector(".mem-heavy")).toBeNull();
  });

  it("soma a memória do espaço no cartão", async () => {
    render(<ActivityTab />);
    await screen.findByTestId("activity-row-a");
    expect(screen.getByTestId("metric-memory")).toHaveTextContent("1.6 GB");
  });

  it("não inventa número quando a leitura falhou", async () => {
    invokeMock.mockImplementation(async (cmd: string) => (cmd === "session_metrics" ? [metric("a", null)] : undefined));
    render(<ActivityTab />);
    expect(await screen.findByTestId("activity-row-a")).toHaveTextContent("—");
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { invokeMock, spaceA } from "../../../test/bridge-mocks";
import "../../../i18n";
import { useAppStore } from "../../../store";
import type { Session } from "../../../types";

import { ActivityTab } from "../WorkspaceTabs";

const a: Session = { id: "a", title: "Claude Code", space_id: spaceA.id, provider_id: "p", bypass: false, cwd: "/w", harness_running: true, detached: false };
const b: Session = { ...a, id: "b", title: "Shell 2", provider_id: null, harness_running: false };

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockImplementation(async (cmd: string) => {
    if (cmd === "session_metrics") {
      return [
        { session_id: "a", bytes_in: 2048, bytes_out: 1048576, started_at: new Date(Date.now() - 65_000).toISOString() },
        { session_id: "b", bytes_in: 10, bytes_out: 512, started_at: new Date(Date.now() - 5_000).toISOString() },
      ];
    }
    return undefined;
  });
  useAppStore.setState({ spaces: [spaceA], sessions: [a, b], selectedSpaceId: spaceA.id });
});

describe("ActivityTab", () => {
  it("mostra o tráfego real de cada terminal do espaço", async () => {
    render(<ActivityTab />);
    const row = await screen.findByTestId("activity-row-a");
    expect(row).toHaveTextContent("Claude Code");
    expect(row).toHaveTextContent("1 MB");
    expect(row).toHaveTextContent("2 KB");
  });

  it("não exibe tokens, custo estimado nem selo de demonstração", async () => {
    render(<ActivityTab />);
    await screen.findByTestId("activity-row-a");
    expect(screen.queryByTestId("demo-badge")).not.toBeInTheDocument();
    expect(screen.queryByText(/token/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/USD|custo/i)).not.toBeInTheDocument();
  });

  it("avisa quando não há terminal vivo no espaço", async () => {
    invokeMock.mockImplementation(async () => []);
    useAppStore.setState({ sessions: [] });
    render(<ActivityTab />);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/nenhum terminal/i));
  });
});

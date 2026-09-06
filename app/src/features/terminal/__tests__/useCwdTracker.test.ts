import { beforeEach, describe, expect, it } from "vitest";
import { invokeMock, spaceA } from "../../../test/bridge-mocks";
import { DEFAULT_SETTINGS, useAppStore } from "../../../store";
import { pollCwds } from "../useCwdTracker";
import type { Session } from "../../../types";

const base: Session = { id: "s1", title: "A", space_id: spaceA.id, provider_id: null, bypass: false, cwd: "/home", harness_running: false, detached: false };

function mockCwd(map: Record<string, string | null>) {
  invokeMock.mockImplementation(async (cmd: string, args?: { sessionId?: string }) => (cmd === "pty_cwd" ? map[args!.sessionId!] ?? null : undefined));
}
const uiSets = () => invokeMock.mock.calls.filter((c) => c[0] === "store_set" && c[1].name === "ui-state");

beforeEach(() => {
  invokeMock.mockReset();
  useAppStore.setState({ spaces: [spaceA], providers: [], sessions: [base], selectedSessionId: "s1", settings: DEFAULT_SETTINGS, loaded: true, migration: null, restoredSessionIds: new Set() });
});

describe("pollCwds", () => {
  it("cwd mudou: atualiza a sessão e persiste 1x", async () => {
    mockCwd({ s1: "/work" });
    await pollCwds();
    expect(useAppStore.getState().sessions[0].cwd).toBe("/work");
    expect(uiSets()).toHaveLength(1);
  });

  it("cwd igual: não atualiza nem persiste", async () => {
    mockCwd({ s1: "/home" });
    await pollCwds();
    expect(uiSets()).toHaveLength(0);
  });

  it("sessão encerrada não é consultada; erro de pty_cwd é ignorado", async () => {
    useAppStore.setState({ sessions: [{ ...base, exit_code: 0 }, { ...base, id: "s2" }] });
    invokeMock.mockImplementation(async (cmd: string) => { if (cmd === "pty_cwd") throw new Error("boom"); });
    await expect(pollCwds()).resolves.toBeUndefined();
    expect(invokeMock.mock.calls.filter((c) => c[0] === "pty_cwd").map((c) => c[1].sessionId)).toEqual(["s2"]);
    expect(uiSets()).toHaveLength(0);
  });

  it("null (windows) não sobrescreve o cwd salvo", async () => {
    mockCwd({ s1: null });
    await pollCwds();
    expect(useAppStore.getState().sessions[0].cwd).toBe("/home");
    expect(uiSets()).toHaveLength(0);
  });
});

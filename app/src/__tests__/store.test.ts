import { beforeEach, describe, expect, it } from "vitest";
import { invokeMock, spaceA, spaceB } from "../test/bridge-mocks";
import { DEFAULT_SETTINGS, useAppStore } from "../store";

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockResolvedValue(undefined);
  useAppStore.setState({ spaces: [spaceA, spaceB], providers: [], sessions: [], selectedSessionId: null, settings: DEFAULT_SETTINGS, loaded: true, migration: null, restoredSessionIds: new Set() });
});

describe("store: sessões", () => {
  it("addSession cria, seleciona e persiste ui-state", () => {
    const s = useAppStore.getState().addSession({ space_id: spaceA.id, title: "Shell 1" });
    const st = useAppStore.getState();
    expect(st.sessions).toHaveLength(1);
    expect(st.selectedSessionId).toBe(s.id);
    expect(s).toMatchObject({ space_id: spaceA.id, provider_id: null, bypass: false, cwd: null });
    expect(invokeMock).toHaveBeenCalledWith("store_set", expect.objectContaining({ name: "ui-state" }));
  });

  it("removeSession mantém o espaço ativo e seleciona a próxima sessão do mesmo espaço", () => {
    const a = useAppStore.getState().addSession({ space_id: spaceA.id });
    const b1 = useAppStore.getState().addSession({ space_id: spaceB.id });
    const b2 = useAppStore.getState().addSession({ space_id: spaceB.id });
    useAppStore.getState().removeSession(b2.id);
    let st = useAppStore.getState();
    expect(st.sessions.map((x) => x.id)).toEqual([a.id, b1.id]);
    expect(st.selectedSessionId).toBe(b1.id);
    expect(st.selectedSpaceId).toBe(spaceB.id);

    useAppStore.getState().removeSession(b1.id);
    st = useAppStore.getState();
    expect(st.sessions.map((x) => x.id)).toEqual([a.id]);
    expect(st.selectedSessionId).toBeNull();
    expect(st.selectedSpaceId).toBe(spaceB.id);
  });

  it("selectSession muda a seleção", () => {
    const a = useAppStore.getState().addSession({ space_id: spaceA.id });
    useAppStore.getState().addSession({ space_id: spaceA.id });
    useAppStore.getState().selectSession(a.id);
    expect(useAppStore.getState().selectedSessionId).toBe(a.id);
  });

  it("restartSession troca o id, mantém o título e aplica o patch", () => {
    const a = useAppStore.getState().addSession({ space_id: spaceA.id, title: "Meu shell" });
    useAppStore.getState().markHarnessStarted(a.id);
    const fresh = useAppStore.getState().restartSession(a.id, { space_id: spaceB.id })!;
    const st = useAppStore.getState();
    expect(fresh.id).not.toBe(a.id);
    expect(fresh).toMatchObject({ title: "Meu shell", space_id: spaceB.id });
    expect(st.sessions).toHaveLength(1);
    expect(st.selectedSessionId).toBe(fresh.id);
    expect(fresh.harness_running).toBe(false);
  });
});

describe("store: harness_running", () => {
  const lastUi = () => { const calls = invokeMock.mock.calls.filter((c) => c[0] === "store_set" && c[1].name === "ui-state"); return calls[calls.length - 1][1].value; };

  it("addSession começa com harness_running false", () => {
    const s = useAppStore.getState().addSession({ space_id: spaceA.id });
    expect(s.harness_running).toBe(false);
  });

  it("markHarnessStarted seta true e persiste no ui-state", () => {
    const s = useAppStore.getState().addSession({ space_id: spaceA.id });
    useAppStore.getState().markHarnessStarted(s.id);
    expect(useAppStore.getState().sessions[0].harness_running).toBe(true);
    expect(lastUi().sessions[0].harness_running).toBe(true);
  });

  it("removeSession tira a sessão do ui-state persistido", () => {
    const s = useAppStore.getState().addSession({ space_id: spaceA.id });
    useAppStore.getState().markHarnessStarted(s.id);
    useAppStore.getState().removeSession(s.id);
    expect(lastUi().sessions).toEqual([]);
  });

  it("patchSessions aplica vários patches e persiste 1x", () => {
    const a = useAppStore.getState().addSession({ space_id: spaceA.id });
    const b = useAppStore.getState().addSession({ space_id: spaceA.id });
    invokeMock.mockClear();
    useAppStore.getState().patchSessions({ [a.id]: { cwd: "/a" }, [b.id]: { cwd: "/b" } });
    expect(useAppStore.getState().sessions.map((s) => s.cwd)).toEqual(["/a", "/b"]);
    expect(invokeMock.mock.calls.filter((c) => c[0] === "store_set")).toHaveLength(1);
  });
});

describe("store: load", () => {
  it("sem ui-state chama migrate_from_swift e guarda o relatório", async () => {
    let uiState: unknown = null;
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "store_get") return uiState;
      if (cmd === "migrate_from_swift") { uiState = { sessions: [{ id: "s1", title: "X", space_id: spaceA.id, provider_id: null, bypass: false, cwd: null }], selectedSessionId: "s1" }; return { spaces: 2, providers: 0, sessions: 1, notes: [] }; }
      if (cmd === "spaces_list") return [spaceA, spaceB];
      if (cmd === "providers_list") return [];
      return undefined;
    });
    await useAppStore.getState().load();
    const st = useAppStore.getState();
    expect(st.migration).toEqual({ spaces: 2, providers: 0, sessions: 1, notes: [] });
    expect(st.sessions).toHaveLength(1);
    expect(st.loaded).toBe(true);
  });

  it("com ui-state não migra e restaura sessões", async () => {
    invokeMock.mockImplementation(async (cmd: string, args?: { name?: string }) => {
      if (cmd === "store_get" && args?.name === "ui-state") return { sessions: [{ id: "s1", title: "X", space_id: spaceA.id, provider_id: null, bypass: false, cwd: "/tmp" }], selectedSessionId: "s1" };
      if (cmd === "store_get") return null;
      if (cmd === "spaces_list") return [spaceA];
      if (cmd === "providers_list") return [];
      return undefined;
    });
    await useAppStore.getState().load();
    expect(invokeMock).not.toHaveBeenCalledWith("migrate_from_swift");
    expect(useAppStore.getState().sessions[0]).toMatchObject({ id: "s1", cwd: "/tmp", harness_running: false });
    expect(useAppStore.getState().migration).toBeNull();
  });

  it("load preenche restoredSessionIds e consumeRestored remove", async () => {
    invokeMock.mockImplementation(async (cmd: string, args?: { name?: string }) => {
      if (cmd === "store_get" && args?.name === "ui-state") return { sessions: [{ id: "s1", title: "X", space_id: spaceA.id, provider_id: null, bypass: false, cwd: null, harness_running: true }], selectedSessionId: "s1" };
      if (cmd === "store_get") return null;
      if (cmd === "spaces_list") return [spaceA];
      if (cmd === "providers_list") return [];
      return undefined;
    });
    await useAppStore.getState().load();
    expect(useAppStore.getState().restoredSessionIds.has("s1")).toBe(true);
    expect(useAppStore.getState().sessions[0].harness_running).toBe(true);
    expect(useAppStore.getState().consumeRestored("s1")).toBe(true);
    expect(useAppStore.getState().consumeRestored("s1")).toBe(false);
    expect(useAppStore.getState().restoredSessionIds.size).toBe(0);
  });
});

describe("store: destacar (Fase 8)", () => {
  const lastUi = () => { const calls = invokeMock.mock.calls.filter((c) => c[0] === "store_set" && c[1].name === "ui-state"); return calls[calls.length - 1][1].value; };
  const killed = () => invokeMock.mock.calls.filter((c) => c[0] === "pty_kill").map((c) => c[1].sessionId);

  it("addSession começa com detached false", () => {
    const s = useAppStore.getState().addSession({ space_id: spaceA.id });
    expect(s.detached).toBe(false);
  });

  it("removeSession mata o PTY antes de remover", () => {
    const s = useAppStore.getState().addSession({ space_id: spaceA.id });
    useAppStore.getState().removeSession(s.id);
    expect(killed()).toEqual([s.id]);
    expect(useAppStore.getState().sessions).toHaveLength(0);
  });

  it("restartSession mata o PTY antigo", () => {
    const s = useAppStore.getState().addSession({ space_id: spaceA.id });
    const fresh = useAppStore.getState().restartSession(s.id)!;
    expect(killed()).toEqual([s.id]);
    expect(fresh.id).not.toBe(s.id);
  });

  it("detachSession chama session_detach e persiste detached true", async () => {
    const s = useAppStore.getState().addSession({ space_id: spaceA.id });
    await useAppStore.getState().detachSession(s.id);
    expect(invokeMock).toHaveBeenCalledWith("session_detach", { sessionId: s.id });
    expect(useAppStore.getState().sessions[0].detached).toBe(true);
    expect(lastUi().sessions[0].detached).toBe(true);
  });

  it("reattachSession zera detached e chama session_reattach", async () => {
    const s = useAppStore.getState().addSession({ space_id: spaceA.id, detached: true });
    await useAppStore.getState().reattachSession(s.id);
    expect(useAppStore.getState().sessions[0].detached).toBe(false);
    expect(invokeMock).toHaveBeenCalledWith("session_reattach", { sessionId: s.id });
    expect(lastUi().sessions[0].detached).toBe(false);
  });

  it("ui-state persistido não leva exit_code", () => {
    const s = useAppStore.getState().addSession({ space_id: spaceA.id });
    useAppStore.getState().updateSession(s.id, { exit_code: 1 });
    expect(lastUi().sessions[0]).not.toHaveProperty("exit_code");
  });

  it("load normaliza detached ?? false", async () => {
    invokeMock.mockImplementation(async (cmd: string, args?: { name?: string }) => {
      if (cmd === "store_get" && args?.name === "ui-state") return { sessions: [
        { id: "s1", title: "X", space_id: spaceA.id, provider_id: null, bypass: false, cwd: null },
        { id: "s2", title: "Y", space_id: spaceA.id, provider_id: null, bypass: false, cwd: null, detached: true },
      ], selectedSessionId: "s1" };
      if (cmd === "store_get") return null;
      if (cmd === "spaces_list") return [spaceA];
      if (cmd === "providers_list") return [];
      return undefined;
    });
    await useAppStore.getState().load();
    expect(useAppStore.getState().sessions.map((s) => s.detached)).toEqual([false, true]);
  });

  it("reloadUiState troca sessions/selectedSessionId e mantém a identidade dos objetos inalterados", async () => {
    const a = useAppStore.getState().addSession({ space_id: spaceA.id, title: "A" });
    const b = useAppStore.getState().addSession({ space_id: spaceA.id, title: "B" });
    const persisted = lastUi();
    const aRef = useAppStore.getState().sessions[0];
    invokeMock.mockImplementation(async (cmd: string, args?: { name?: string }) =>
      cmd === "store_get" && args?.name === "ui-state"
        ? { sessions: [persisted.sessions[0], { ...persisted.sessions[1], title: "B2", detached: true }], selectedSessionId: a.id }
        : undefined,
    );
    await useAppStore.getState().reloadUiState();
    const st = useAppStore.getState();
    expect(st.sessions[0]).toBe(aRef);
    expect(st.sessions[1]).not.toBe(b);
    expect(st.sessions[1]).toMatchObject({ id: b.id, title: "B2", detached: true, harness_running: false });
    expect(st.selectedSessionId).toBe(a.id);
  });

  it("reloadUiState preserva exit_code local de sessão que mudou", async () => {
    const a = useAppStore.getState().addSession({ space_id: spaceA.id, title: "A" });
    useAppStore.getState().updateSession(a.id, { exit_code: 2 });
    const persisted = lastUi();
    invokeMock.mockImplementation(async (cmd: string, args?: { name?: string }) =>
      cmd === "store_get" && args?.name === "ui-state" ? { sessions: [{ ...persisted.sessions[0], title: "A2" }], selectedSessionId: a.id } : undefined,
    );
    await useAppStore.getState().reloadUiState();
    expect(useAppStore.getState().sessions[0]).toMatchObject({ title: "A2", exit_code: 2 });
  });

  it("reloadUiState sem ui-state não mexe no estado", async () => {
    useAppStore.getState().addSession({ space_id: spaceA.id });
    const before = useAppStore.getState().sessions;
    invokeMock.mockImplementation(async () => null);
    await useAppStore.getState().reloadUiState();
    expect(useAppStore.getState().sessions).toBe(before);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { spaceA } from "../../../test/bridge-mocks";
import { useAppStore } from "../../../store";
import type { Provider, Session } from "../../../types";

const writeMock = vi.fn(() => Promise.resolve());
vi.mock("../../terminal/pty", () => ({ pty: { write: (...args: unknown[]) => writeMock(...(args as [])), kill: () => Promise.resolve() } }));

import {
  CONVERSATION_INSTRUCTION,
  SELECTION_MAX,
  buildConversationPrompt,
  startConversationInNewAgent,
  startConversationInSession,
} from "../newConversation";

const claude: Provider = {
  id: "p-claude", name: "Claude Code", executable: "claude", args: [], bypass_args: ["--dangerously-skip-permissions"],
  config_env_key: null, extra_env: [], icon: "sparkles", resume_args: [],
};
const origem: Session = { id: "orig", title: "build", space_id: spaceA.id, provider_id: null, bypass: false, cwd: "/a", harness_running: false, detached: false };
const agente: Session = { ...origem, id: "ag", title: "Claude", provider_id: claude.id, harness_running: true };

beforeEach(() => {
  writeMock.mockClear();
  useAppStore.setState({ sessions: [origem, agente], spaces: [spaceA], providers: [claude], selectedSessionId: "orig", selectedSpaceId: spaceA.id });
});

describe("buildConversationPrompt", () => {
  it("junta instrução, origem e trecho numa linha só", () => {
    const p = buildConversationPrompt({ selection: "erro X\nlinha 2", originTitle: "build", spaceName: "Pessoal" });
    expect(p).toContain(CONVERSATION_INSTRUCTION);
    expect(p).toContain('terminal "build"');
    expect(p).toContain('espaço "Pessoal"');
    expect(p).toContain("erro X");
    expect(p).not.toContain("\n");
  });

  it("aceita instrução escrita pelo usuário no lugar da padrão", () => {
    const p = buildConversationPrompt({ selection: "erro", originTitle: "build", instruction: "Corrija isso e rode os testes" });
    expect(p).toContain("Corrija isso e rode os testes");
    expect(p).not.toContain(CONVERSATION_INSTRUCTION);
  });

  it("limpa o trecho e corta o que passa do limite", () => {
    const p = buildConversationPrompt({ selection: `[31mvermelho[0m ${"x".repeat(SELECTION_MAX * 2)}`, originTitle: "t" });
    expect(p).toContain("vermelho");
    expect(p).not.toContain("");
    expect(p.length).toBeLessThan(SELECTION_MAX + 500);
  });
});

describe("startConversationInSession", () => {
  it("entrega no agente e foca o terminal dele", async () => {
    const res = await startConversationInSession({ targetSessionId: "ag", prompt: "contexto" });
    expect(res.delivered).toBe(true);
    expect(writeMock).toHaveBeenCalledWith("ag", "contexto\n");
    expect(useAppStore.getState().selectedSessionId).toBe("ag");
  });

  it("recusa terminal sem agente rodando", async () => {
    const res = await startConversationInSession({ targetSessionId: "orig", prompt: "contexto" });
    expect(res).toMatchObject({ delivered: false, reason: "no_harness" });
    expect(writeMock).not.toHaveBeenCalled();
  });

  it("recusa terminal que não existe mais", async () => {
    const res = await startConversationInSession({ targetSessionId: "sumiu", prompt: "x" });
    expect(res.reason).toBe("not_found");
  });
});

describe("startConversationInNewAgent", () => {
  it("abre o agente no mesmo espaço, sem bypass, e entrega quando o harness sobe", async () => {
    vi.useFakeTimers();
    const nova = startConversationInNewAgent({ spaceId: spaceA.id, provider: claude, prompt: "contexto" });
    expect(nova.space_id).toBe(spaceA.id);
    expect(nova.bypass).toBe(false);
    expect(nova.auto_start_harness).toBe(true);
    expect(useAppStore.getState().selectedSessionId).toBe(nova.id);

    await vi.advanceTimersByTimeAsync(1000);
    expect(writeMock).not.toHaveBeenCalled();

    useAppStore.getState().updateSession(nova.id, { auto_start_harness: false, harness_running: true });
    await vi.advanceTimersByTimeAsync(3000);
    expect(writeMock).toHaveBeenCalledWith(nova.id, "contexto\n");
    vi.useRealTimers();
  });
});

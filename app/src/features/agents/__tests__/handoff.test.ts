import { beforeEach, describe, expect, it, vi } from "vitest";
import { spaceA } from "../../../test/bridge-mocks";
import { useAppStore } from "../../../store";
import type { Provider, Session } from "../../../types";

const writeMock = vi.fn(() => Promise.resolve());
vi.mock("../../terminal/pty", () => ({ pty: { write: (...args: unknown[]) => writeMock(...(args as [])), kill: () => Promise.resolve() } }));

import { buildHandoffPrompt, handoffToSession } from "../handoff";

const claude: Provider = {
  id: "p-claude", name: "Claude Code", executable: "claude", args: [], bypass_args: ["--dangerously-skip-permissions"],
  config_env_key: null, extra_env: [], icon: "🤖", resume_args: [],
};
const agent: Session = { id: "agent", title: "Claude Code", space_id: spaceA.id, provider_id: claude.id, bypass: false, cwd: "/a", harness_running: true, detached: false };
const shell: Session = { ...agent, id: "shell", title: "Shell 2", provider_id: null, harness_running: false };

beforeEach(() => {
  writeMock.mockClear();
  useAppStore.setState({ sessions: [agent, shell], spaces: [spaceA], providers: [claude], selectedSessionId: "agent", selectedSpaceId: spaceA.id });
});

const prompt = () =>
  buildHandoffPrompt({
    origin: agent, originProvider: claude, space: spaceA, targetName: "destino",
    reason: "token_exhausted", objective: "Terminar o guardrail",
  });

describe("handoffToSession", () => {
  it("recusa terminal sem harness: o pacote viraria comandos no shell", async () => {
    const res = await handoffToSession(shell.id, prompt());
    expect(res.delivered).toBe(false);
    expect(res.reason).toBe("no_harness");
    expect(writeMock).not.toHaveBeenCalled();
  });

  it("entrega em um agente e escreve uma única linha, sem quebras internas", async () => {
    const res = await handoffToSession(agent.id, prompt());
    expect(res.delivered).toBe(true);
    const [sessionId, payload] = writeMock.mock.calls[0] as unknown as [string, string];
    expect(sessionId).toBe("agent");
    expect(payload.endsWith("\n")).toBe(true);
    expect(payload.slice(0, -1)).not.toContain("\n");
    expect(payload).toContain("PROTOCOLO DE CONTINUIDADE MULTIAGENTE");
    expect(payload).toContain("Objetivo da tarefa");
  });

  it("foca o terminal de destino quando entrega", async () => {
    await handoffToSession(agent.id, prompt());
    expect(useAppStore.getState().selectedSessionId).toBe("agent");
    expect(useAppStore.getState().workspaceTab).toBe("terminals");
  });
});

describe("prompt de handoff sem texto inventado", () => {
  it("omite as seções que o usuário não preencheu", () => {
    const p = buildHandoffPrompt({ origin: agent, originProvider: claude, space: spaceA, targetName: "x", reason: "token_exhausted" });
    expect(p).not.toContain("Continuidade de desenvolvimento e testes");
    expect(p).not.toContain("Inspecionar últimos arquivos alterados");
    expect(p).not.toContain("Objetivo da tarefa");
    expect(p).not.toContain("Próximas ações");
  });

  it("inclui só o que foi escrito", () => {
    const p = buildHandoffPrompt({
      origin: agent, originProvider: claude, space: spaceA, targetName: "x",
      reason: "token_exhausted", objective: "Terminar o guardrail",
    });
    expect(p).toContain("Objetivo da tarefa");
    expect(p).toContain("Terminar o guardrail");
    expect(p).not.toContain("Próximas ações");
  });
});

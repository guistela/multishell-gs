import { beforeEach, describe, expect, it } from "vitest";
import { IDLE_AFTER_MS, agentState, forgetSession, markOutput, resetActivity } from "../agentActivity";

beforeEach(() => resetActivity());

describe("agentState", () => {
  it("sem harness rodando não há estado de agente", () => {
    markOutput("s1", 1000);
    expect(agentState("s1", false, 1000)).toBe("off");
  });

  it("output recente significa trabalhando", () => {
    markOutput("s1", 1000);
    expect(agentState("s1", true, 1000 + IDLE_AFTER_MS - 1)).toBe("working");
  });

  it("silêncio prolongado significa que terminou e espera", () => {
    markOutput("s1", 1000);
    expect(agentState("s1", true, 1000 + IDLE_AFTER_MS)).toBe("idle");
  });

  it("harness que ainda não escreveu nada conta como parado", () => {
    expect(agentState("nova", true, 5000)).toBe("idle");
  });

  it("volta a trabalhando quando o agente escreve de novo", () => {
    markOutput("s1", 1000);
    expect(agentState("s1", true, 3000)).toBe("idle");
    markOutput("s1", 3100);
    expect(agentState("s1", true, 3200)).toBe("working");
  });

  it("cada sessão tem seu próprio estado", () => {
    markOutput("s1", 2000);
    markOutput("s2", 1);
    expect(agentState("s1", true, 2200)).toBe("working");
    expect(agentState("s2", true, 2200)).toBe("idle");
  });

  it("esquece a sessão encerrada", () => {
    markOutput("s1", 1000);
    forgetSession("s1");
    expect(agentState("s1", true, 1100)).toBe("idle");
  });
});

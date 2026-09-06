import { beforeEach, describe, expect, it } from "vitest";
import { IDLE_AFTER_MS, agentState, forgetSession, markOutput, resetActivity, setSessionCpu } from "../agentActivity";

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
    expect(agentState("s1", true, 1000 + IDLE_AFTER_MS + 1)).toBe("idle");
    markOutput("s1", 9000);
    expect(agentState("s1", true, 9100)).toBe("working");
  });

  it("cada sessão tem seu próprio estado", () => {
    const agora = 10000;
    markOutput("s1", agora - 100);
    markOutput("s2", agora - IDLE_AFTER_MS - 1);
    expect(agentState("s1", true, agora)).toBe("working");
    expect(agentState("s2", true, agora)).toBe("idle");
  });

  it("esquece a sessão encerrada", () => {
    markOutput("s1", 1000);
    forgetSession("s1");
    expect(agentState("s1", true, 1100)).toBe("idle");
  });
});

describe("agentState com CPU", () => {
  it("agente calado mas queimando CPU conta como trabalhando", () => {
    setSessionCpu("s1", 45);
    expect(agentState("s1", true, 999999)).toBe("working");
  });

  it("CPU baixa e silêncio significam que ele terminou", () => {
    markOutput("s1", 1000);
    setSessionCpu("s1", 0.4);
    expect(agentState("s1", true, 1000 + IDLE_AFTER_MS + 1)).toBe("idle");
  });

  it("CPU some quando a leitura falha, sem travar em trabalhando", () => {
    setSessionCpu("s1", 90);
    setSessionCpu("s1", null);
    expect(agentState("s1", true, 999999)).toBe("idle");
  });

  it("sem harness continua sem estado, mesmo com CPU alta", () => {
    setSessionCpu("s1", 90);
    expect(agentState("s1", false, 1)).toBe("off");
  });
});

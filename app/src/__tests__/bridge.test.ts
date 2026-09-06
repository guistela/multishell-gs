import { beforeEach, describe, expect, it } from "vitest";
import { installBridge, invokeMock, uninstallBridge } from "../test/bridge-mocks";
import { BRIDGE_MISSING, bridge, hasBridge, invoke } from "../bridge";
import { reportFront } from "../ErrorBoundary";

beforeEach(() => { invokeMock.mockReset(); installBridge(); });

describe("bridge", () => {
  it("devolve window.multishell", () => {
    expect(hasBridge()).toBe(true);
    expect(bridge()).toBe(window.multishell);
    expect(bridge().platform).toBe("darwin");
  });

  it("ausente: erro claro", () => {
    uninstallBridge();
    expect(hasBridge()).toBe(false);
    expect(() => bridge()).toThrow(BRIDGE_MISSING);
  });

  it("invoke repassa command e args; sem args não manda undefined", async () => {
    invokeMock.mockResolvedValue("ok");
    await expect(invoke("spaces_list")).resolves.toBe("ok");
    expect(invokeMock.mock.calls[0]).toEqual(["spaces_list"]);
    await invoke("store_get", { name: "x" });
    expect(invokeMock.mock.calls[1]).toEqual(["store_get", { name: "x" }]);
  });

  it("invoke sem bridge rejeita em vez de lançar síncrono", async () => {
    uninstallBridge();
    await expect(invoke("spaces_list")).rejects.toThrow(BRIDGE_MISSING);
  });

  it("reportFront chama log_front e não lança sem bridge", () => {
    reportFront("warn", "oi");
    expect(invokeMock).toHaveBeenCalledWith("log_front", { level: "warn", message: "oi" });
    uninstallBridge();
    expect(() => reportFront("error", "x")).not.toThrow();
  });
});

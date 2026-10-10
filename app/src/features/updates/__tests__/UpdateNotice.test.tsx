import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { invokeMock } from "../../../test/bridge-mocks";
import "../../../i18n";
import { CHECK_EVERY_MS, UpdateNotice } from "../UpdateNotice";

const info = {
  version: "0.9.0",
  download_url: "https://github.com/guistela/multishell-gs/releases/download/v0.9.0/Multishell-0.9.0-mac-arm64.dmg",
  release_url: "https://github.com/guistela/multishell-gs/releases/tag/v0.9.0",
};

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockImplementation(async (cmd: string) => (cmd === "update_check" ? info : undefined));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("UpdateNotice", () => {
  it("não mostra nada sem versão nova", async () => {
    invokeMock.mockResolvedValue(null);
    render(<UpdateNotice />);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("update_check", {}));
    expect(screen.queryByTestId("update-notice")).toBeNull();
  });

  it("mostra a versão nova e Baixar abre o instalador", async () => {
    render(<UpdateNotice />);
    expect(await screen.findByTestId("update-notice")).toHaveTextContent("v0.9.0");
    fireEvent.click(screen.getByRole("button", { name: "Baixar" }));
    expect(invokeMock).toHaveBeenCalledWith("update_open", { url: info.download_url });
  });

  it("Ignorar persiste a versão e esconde o aviso", async () => {
    render(<UpdateNotice />);
    fireEvent.click(await screen.findByRole("button", { name: "Ignorar esta versão" }));
    expect(invokeMock).toHaveBeenCalledWith("update_ignore", { version: "0.9.0" });
    await waitFor(() => expect(screen.queryByTestId("update-notice")).toBeNull());
  });

  it("dispara uma notificação do sistema por versão", async () => {
    const Notif = vi.fn();
    vi.stubGlobal("Notification", Object.assign(Notif, { permission: "granted" }));
    vi.useFakeTimers();
    render(<UpdateNotice />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(Notif).toHaveBeenCalledTimes(1);
    expect(Notif.mock.calls[0][0]).toMatch(/0\.9\.0/);

    // Novo ciclo com a mesma versão: consulta de novo, sem notificar outra vez.
    await act(async () => { await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS); });
    expect(invokeMock.mock.calls.filter(([c]) => c === "update_check")).toHaveLength(2);
    expect(Notif).toHaveBeenCalledTimes(1);
  });
});

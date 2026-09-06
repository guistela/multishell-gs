import { render, screen, fireEvent, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import type { Space } from "../../types";
import { installBridge, uninstallBridge, invokeMock } from "../../test/bridge-mocks";
import SpaceEditor, { isWindows } from "./SpaceEditor";

const space: Space = {
  id: "s1", name: "Pessoal", color_hex: "#ff0000", directory_name: "pessoal", custom_env: [],
  security: { load_user_shell_profile: false, share_keychain: false, share_ssh: false, share_git_config: false, inherit_process_env: false },
  created_at: "2026-01-01T00:00:00Z",
};

function mockUA(ua: string) {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(ua);
}

describe("SpaceEditor", () => {
  beforeEach(() => installBridge());
  afterEach(() => vi.restoreAllMocks());

  it("esconde share_keychain quando bridge.platform é win32", () => {
    installBridge({ platform: "win32" });
    render(<SpaceEditor space={space} isNew={false} onSave={() => {}} onCancel={() => {}} />);
    expect(screen.queryByLabelText(/Keychain/)).toBeNull();
    expect(screen.getByLabelText(/SSH/)).toBeInTheDocument();
  });

  it("mostra share_keychain no darwin e avisa quando um compartilhamento liga", () => {
    render(<SpaceEditor space={space} isNew={false} onSave={() => {}} onCancel={() => {}} />);
    const keychain = screen.getByLabelText(/Keychain/);
    expect(screen.queryByRole("status")).toBeNull();
    fireEvent.click(keychain);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("bridge.platform ganha do userAgent", () => {
    mockUA("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
    expect(isWindows()).toBe(false);
  });

  it("sem bridge cai no userAgent", () => {
    uninstallBridge();
    mockUA("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
    expect(isWindows()).toBe(true);
    mockUA("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)");
    expect(isWindows()).toBe(false);
  });
});


describe("space base folder picker", () => {
  beforeEach(() => { installBridge(); invokeMock.mockReset(); });
  it("chooses a folder and saves it with the space", async () => {
    invokeMock.mockResolvedValue("/projects/My App");
    const save = vi.fn();
    render(<SpaceEditor space={space} isNew onSave={save} onCancel={() => {}} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Escolher pasta…" })));
    expect(screen.getByLabelText("Pasta base")).toHaveValue("/projects/My App");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Salvar" })));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ base_path: "/projects/My App" }));
  });
  it("canceling the picker keeps the previous folder", async () => {
    invokeMock.mockResolvedValue(null);
    render(<SpaceEditor space={{ ...space, base_path: "/existing" }} isNew={false} onSave={() => {}} onCancel={() => {}} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Escolher pasta…" })));
    expect(screen.getByLabelText("Pasta base")).toHaveValue("/existing");
    expect(invokeMock).toHaveBeenCalledWith("directory_pick", { defaultPath: "/existing" });
  });
  it("shows a validation failure instead of silently ignoring it", async () => {
    render(<SpaceEditor space={space} isNew onSave={async () => { throw new Error("Pasta inexistente"); }} onCancel={() => {}} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Salvar" })));
    expect(screen.getByRole("alert")).toHaveTextContent("Pasta inexistente");
  });
  it("shows success feedback when saved successfully", async () => {
    render(<SpaceEditor space={space} isNew onSave={async () => {}} onCancel={() => {}} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Salvar" })));
    expect(screen.getByRole("status")).toHaveTextContent("Salvo");
  });
});

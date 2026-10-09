import { beforeEach, describe, expect, it } from "vitest";
import { invokeMock, spaceA, spaceB } from "../../../test/bridge-mocks";
import { DEFAULT_SETTINGS, useAppStore } from "../../../store";
import { folderTitle, newTerminalInFolder } from "../newTerminalInFolder";

beforeEach(() => {
  invokeMock.mockReset();
  useAppStore.setState({ sessions: [], spaces: [{ ...spaceA, base_path: "/base" }, spaceB], providers: [], settings: { ...DEFAULT_SETTINGS, default_cwd: "/home" } });
});

describe("folderTitle", () => {
  it("usa o nome da pasta, em qualquer separador", () => {
    expect(folderTitle("/Users/gs/Projects/app")).toBe("app");
    expect(folderTitle("/Users/gs/Projects/app/")).toBe("app");
    expect(folderTitle("C:\\Users\\gs\\proj")).toBe("proj");
  });
});

describe("newTerminalInFolder", () => {
  it("abre o seletor na pasta base do espaço e cria o terminal na pasta escolhida", async () => {
    invokeMock.mockResolvedValue("/Users/gs/Projects/app");
    const session = await newTerminalInFolder(spaceA.id);
    expect(invokeMock).toHaveBeenCalledWith("directory_pick", { defaultPath: "/base" });
    expect(session).toMatchObject({ space_id: spaceA.id, cwd: "/Users/gs/Projects/app", title: "app" });
    expect(useAppStore.getState().sessions).toHaveLength(1);
  });

  it("sem pasta base, parte da pasta padrão das configurações", async () => {
    invokeMock.mockResolvedValue("/x");
    await newTerminalInFolder(spaceB.id);
    expect(invokeMock).toHaveBeenCalledWith("directory_pick", { defaultPath: "/home" });
  });

  it("cancelar o seletor não cria terminal", async () => {
    invokeMock.mockResolvedValue(null);
    expect(await newTerminalInFolder(spaceA.id)).toBeNull();
    expect(useAppStore.getState().sessions).toHaveLength(0);
  });
});

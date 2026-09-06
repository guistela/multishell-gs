import { beforeEach, describe, expect, it } from "vitest";
import { invokeMock, spaceA } from "../../../test/bridge-mocks";
import { addTaskFromTerminal, loadBoards, titleFromSelection, type KanbanStore } from "../kanbanStore";

let stored: KanbanStore = {};

beforeEach(() => {
  stored = {};
  invokeMock.mockReset();
  invokeMock.mockImplementation(async (cmd: string, args?: any) => {
    if (cmd === "store_get" && args?.name === "kanban") return Object.keys(stored).length ? stored : null;
    if (cmd === "store_set" && args?.name === "kanban") {
      stored = args.value;
      return undefined;
    }
    return undefined;
  });
});

describe("titleFromSelection", () => {
  it("usa a primeira linha com conteúdo", () => {
    expect(titleFromSelection("\n\n  npm test falhou  \nstack...")).toBe("npm test falhou");
  });

  it("encurta linha longa", () => {
    expect(titleFromSelection("a".repeat(120), 20)).toHaveLength(20);
    expect(titleFromSelection("a".repeat(120), 20).endsWith("…")).toBe(true);
  });

  it("devolve vazio quando não há texto", () => {
    expect(titleFromSelection("   \n  ")).toBe("");
  });
});

describe("addTaskFromTerminal", () => {
  it("cria a tarefa no board do espaço, atribuída ao próprio terminal", async () => {
    const task = await addTaskFromTerminal({ spaceId: spaceA.id, sessionId: "s1", selection: "corrigir o teste de PTY\nlinha 2" });

    expect(task?.title).toBe("corrigir o teste de PTY");
    expect(task?.assignee_session_id).toBe("s1");
    expect(task?.details).toContain("linha 2");
    expect(task?.source).toBe("Terminal");
    expect(stored[spaceA.id].tasks).toHaveLength(1);
  });

  it("preserva as tarefas que já existiam e os outros espaços", async () => {
    stored = {
      [spaceA.id]: { tasks: [{ id: "old", key: "TASK-1", title: "antiga", status: "todo", source: "Local" }] },
      "sp-outro": { tasks: [{ id: "x", key: "TASK-1", title: "de outro espaço", status: "todo", source: "Local" }] },
    };

    await addTaskFromTerminal({ spaceId: spaceA.id, sessionId: "s1", selection: "nova do terminal" });

    expect(stored[spaceA.id].tasks.map((t) => t.title)).toEqual(["nova do terminal", "antiga"]);
    expect(stored["sp-outro"].tasks).toHaveLength(1);
  });

  it("não cria tarefa a partir de seleção vazia", async () => {
    const task = await addTaskFromTerminal({ spaceId: spaceA.id, sessionId: "s1", selection: "   " });
    expect(task).toBeNull();
    expect(await loadBoards()).toEqual({});
  });

  it("corta trecho gigante para não guardar a tela inteira", async () => {
    const task = await addTaskFromTerminal({ spaceId: spaceA.id, sessionId: "s1", selection: `titulo\n${"x".repeat(5000)}` });
    expect(task!.details!.length).toBeLessThanOrEqual(2000);
  });
});

import { api } from "../../api";

export type TaskStatus = "todo" | "in_progress" | "review" | "done";

export interface Task {
  id: string;
  key: string;
  title: string;
  status: TaskStatus;
  source: string;
  /** Trecho vindo do terminal. Curto de propósito: contexto, não descrição longa. */
  details?: string;
  /** Terminal do espaço responsável. Os agentes são os harnesses rodando nos terminais. */
  assignee_session_id?: string;
}

export interface KanbanBoard {
  tasks: Task[];
}

/** Um board por espaço: o Kanban do espaço A nunca aparece no espaço B. */
export type KanbanStore = Record<string, KanbanBoard>;

export const KANBAN_STORE = "kanban";
export const COLUMNS: TaskStatus[] = ["todo", "in_progress", "review", "done"];
export const COLUMN_TITLES: Record<TaskStatus, string> = {
  todo: "A Fazer",
  in_progress: "Em Execução",
  review: "Revisão",
  done: "Concluído",
};

/** Limite do trecho capturado do terminal: o objetivo é contexto, não colar a tela inteira. */
export const DETAILS_MAX = 2000;

export async function loadBoards(): Promise<KanbanStore> {
  return (await api.storeGet<KanbanStore>(KANBAN_STORE)) ?? {};
}

export async function saveBoard(spaceId: string, tasks: Task[], boards?: KanbanStore): Promise<KanbanStore> {
  const base = boards ?? (await loadBoards());
  const next: KanbanStore = { ...base, [spaceId]: { tasks } };
  await api.storeSet(KANBAN_STORE, next);
  return next;
}

/** Primeira linha não vazia, encurtada: vira o título do cartão. */
export function titleFromSelection(text: string, max = 70): string {
  const line = text.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/** Cria a tarefa direto do terminal, já atribuída a ele. Devolve a tarefa criada. */
export async function addTaskFromTerminal(opts: {
  spaceId: string;
  sessionId: string;
  selection: string;
}): Promise<Task | null> {
  const title = titleFromSelection(opts.selection);
  if (!title) return null;

  const boards = await loadBoards();
  const current = boards[opts.spaceId]?.tasks ?? [];
  const task: Task = {
    id: `task-${Date.now()}`,
    key: `TASK-${current.length + 1}`,
    title,
    status: "todo",
    source: "Terminal",
    details: opts.selection.trim().slice(0, DETAILS_MAX),
    assignee_session_id: opts.sessionId,
  };
  await saveBoard(opts.spaceId, [task, ...current], boards);
  return task;
}

import { useCallback, useEffect, useRef, useState } from "react";
import { useAppStore } from "../../../store";
import type { Session } from "../../../types";
import { toSingleLine } from "../handoff";
import { pty } from "../../terminal/pty";
import {
  COLUMNS,
  COLUMN_TITLES,
  loadBoards,
  saveBoard,
  type KanbanStore,
  type Task,
} from "../kanbanStore";

export type { Task, TaskStatus } from "../kanbanStore";

/** Como o terminal aparece na lista de responsáveis: título e harness que está rodando nele. */
function describeTerminal(session: Session, providerName: string | null): string {
  if (!providerName) return `${session.title} (shell)`;
  return `${session.title} — ${providerName}${session.harness_running ? "" : " (parado)"}`;
}

export function KanbanTab() {
  const sessions = useAppStore((s) => s.sessions);
  const spaces = useAppStore((s) => s.spaces);
  const providers = useAppStore((s) => s.providers);
  const selectedSpaceId = useAppStore((s) => s.selectedSpaceId) ?? spaces[0]?.id;
  const space = spaces.find((s) => s.id === selectedSpaceId);
  const inSpace = sessions.filter((s) => s.space_id === selectedSpaceId && !s.detached);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Boards dos outros espaços, para não sobrescrevê-los ao salvar. */
  const allBoards = useRef<KanbanStore>({});

  useEffect(() => {
    let active = true;
    void (async () => {
      const stored = await loadBoards();
      if (!active) return;
      allBoards.current = stored;
      setTasks((selectedSpaceId ? stored[selectedSpaceId]?.tasks : undefined) ?? []);
      setMessage(null);
      setError(null);
    })();
    return () => {
      active = false;
    };
  }, [selectedSpaceId]);

  const persist = useCallback(
    async (next: Task[]) => {
      if (!selectedSpaceId) return;
      allBoards.current = await saveBoard(selectedSpaceId, next, allBoards.current);
    },
    [selectedSpaceId]
  );

  const update = async (next: Task[]) => {
    setTasks(next);
    await persist(next);
  };

  const providerName = (session: Session): string | null =>
    providers.find((p) => p.id === session.provider_id)?.name ?? null;

  const moveTask = (taskId: string, direction: "next" | "prev") =>
    update(
      tasks.map((t) => {
        if (t.id !== taskId) return t;
        const i = COLUMNS.indexOf(t.status);
        const target = direction === "next" ? Math.min(COLUMNS.length - 1, i + 1) : Math.max(0, i - 1);
        return { ...t, status: COLUMNS[target] };
      })
    );

  const assign = (taskId: string, sessionId: string) =>
    update(tasks.map((t) => (t.id === taskId ? { ...t, assignee_session_id: sessionId || undefined } : t)));

  const removeTask = (taskId: string) => update(tasks.filter((t) => t.id !== taskId));

  const addTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const task: Task = {
      id: `task-${Date.now()}`,
      key: `TASK-${tasks.length + 1}`,
      title: newTitle.trim(),
      status: "todo",
      source: "Local",
    };
    setNewTitle("");
    setShowNewTask(false);
    await update([task, ...tasks]);
  };

  /** Entrega a tarefa ao harness do terminal responsável e marca como em execução. */
  const sendToAgent = async (task: Task) => {
    setError(null);
    setMessage(null);
    const target = inSpace.find((s) => s.id === task.assignee_session_id);
    if (!target) {
      setError(`Escolha um terminal responsável por ${task.key} antes de enviar.`);
      return;
    }
    if (!target.harness_running) {
      setError(`"${target.title}" está sem agente rodando. Inicie o harness nele — num shell puro o texto viraria comando.`);
      return;
    }
    const prompt = toSingleLine(
      [
        `[${task.key}] ${task.title}`,
        task.details ? `Contexto capturado do terminal: ${task.details}` : "",
        `Tarefa do Kanban do espaço ${space?.name ?? "atual"}.`,
        "Ao concluir, responda com um resumo do que mudou.",
      ].join("\n")
    );
    try {
      await pty.write(target.id, prompt + "\n");
    } catch {
      setError(`Não foi possível enviar ${task.key}. A tarefa foi mantida como estava. Tente novamente.`);
      return;
    }
    useAppStore.getState().selectSession(target.id);
    await update(tasks.map((t) => (t.id === task.id ? { ...t, status: "in_progress" } : t)));
    setMessage(`${task.key} enviada para "${target.title}".`);
  };

  return (
    <div className="kanban-view">
      <div className="kanban-sync-bar">
        <div className="kanban-sync-group">
          <span className="kanban-sync-label">
            Atividades do espaço {space?.name ?? "—"} • {inSpace.filter((s) => s.harness_running).length} agentes rodando
          </span>
        </div>
        <div className="kanban-sync-group kanban-sync-actions">
          <button type="button" className="primary kanban-toolbar-btn" onClick={() => setShowNewTask(true)}>
            + Nova Tarefa
          </button>
        </div>
      </div>

      {error && <div className="feedback-msg error" role="alert">{error}</div>}
      {message && <div className="feedback-msg" role="status">{message}</div>}

      {showNewTask && (
        <form className="kanban-new-task" data-testid="new-task-form" onSubmit={(e) => void addTask(e)}>
          <div className="kanban-new-task-row">
            <label className="kanban-field-label" htmlFor="kanban-new-title">Título da tarefa</label>
            <input
              id="kanban-new-title"
              type="text"
              className="kanban-new-task-title"
              placeholder="ex: revisar o guardrail de comandos"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              autoFocus
            />
          </div>
          <div className="kanban-new-task-actions">
            <button type="button" onClick={() => setShowNewTask(false)}>Cancelar</button>
            <button type="submit" className="primary" disabled={!newTitle.trim()}>Adicionar</button>
          </div>
        </form>
      )}

      {tasks.length === 0 ? (
        <div className="kanban-empty" data-testid="kanban-empty" role="status">
          Nenhuma atividade neste espaço. Crie uma tarefa e atribua a um terminal para o agente daquele terminal executá-la.
        </div>
      ) : (
        <div className="kanban-columns">
          {COLUMNS.map((col) => {
            const colTasks = tasks.filter((t) => t.status === col);
            return (
              <div key={col} className={`kanban-column ${col}`}>
                <div className="column-header">
                  <span>{COLUMN_TITLES[col]}</span>
                  <span className="count-badge">{colTasks.length}</span>
                </div>
                <div className="column-cards">
                  {colTasks.map((t) => {
                    const assignee = inSpace.find((s) => s.id === t.assignee_session_id);
                    const orphan = Boolean(t.assignee_session_id) && !assignee;
                    return (
                      <div key={t.id} className="kanban-card">
                        <div className="card-top">
                          <span className="task-key">{t.key}</span>
                          <button
                            type="button"
                            className="card-remove"
                            aria-label={`Remover ${t.key}`}
                            title={`Remover ${t.key}`}
                            onClick={() => void removeTask(t.id)}
                          >
                            ✕
                          </button>
                        </div>
                        <p className="card-title">{t.title}</p>
                        {t.details && (
                          <p className="card-details" title={t.details}>{t.details}</p>
                        )}

                        <div className="card-assign">
                          <label className="visually-hidden" htmlFor={`assign-${t.id}`}>Responsável por {t.key}</label>
                          <select
                            id={`assign-${t.id}`}
                            value={t.assignee_session_id ?? ""}
                            onChange={(e) => void assign(t.id, e.target.value)}
                          >
                            <option value="">Sem responsável</option>
                            {inSpace.map((s) => (
                              <option key={s.id} value={s.id}>{describeTerminal(s, providerName(s))}</option>
                            ))}
                          </select>
                          {orphan && (
                            <span className="assignee-warning" data-testid={`assignee-warning-${t.id}`}>
                              Terminal encerrado — escolha outro
                            </span>
                          )}
                        </div>

                        <div className="card-bottom">
                          <button
                            type="button"
                            className="card-send"
                            aria-label={`Enviar ${t.key} ao agente`}
                            title="Envia a tarefa para o agente do terminal responsável"
                            onClick={() => void sendToAgent(t)}
                          >
                            Enviar ao agente
                          </button>
                          <div className="card-move">
                            {col !== "todo" && (
                              <button type="button" aria-label={`Voltar ${t.key}`} title={`Voltar ${t.key}`} onClick={() => void moveTask(t.id, "prev")}>←</button>
                            )}
                            {col !== "done" && (
                              <button type="button" aria-label={`Avançar ${t.key}`} title={`Avançar ${t.key}`} onClick={() => void moveTask(t.id, "next")}>→</button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Central de notificações dos agentes.
//
// O agente que roda dentro de um terminal avisa o que está fazendo e, quando
// precisa de mim, pergunta e espera. Este módulo é só o modelo: guarda, conta e
// resolve. Quem fala com o agente é o `notify-server`; quem desenha é o renderer.
//
// Módulo puro (sem `electron`): relógio e geração de id entram por `Deps`.
import { randomUUID } from "node:crypto";

export type NotifyLevel = "info" | "warn" | "urgent";
const LEVELS: NotifyLevel[] = ["info", "warn", "urgent"];

/** Teto de texto. Acima disso nem o painel nem o Centro de Notificações mostram. */
export const MAX_TITLE = 120;
export const MAX_BODY = 2000;
/** Teto de notificações guardadas. Pergunta pendente nunca entra na conta do corte. */
export const MAX_KEPT = 200;

/** Pergunta aberta. `options` vazio = resposta livre. */
export interface NotifyAsk {
  options: string[];
  placeholder: string | null;
}

export interface NotifyInput {
  session_id: string;
  space_id: string | null;
  title: string;
  body?: string | null;
  level?: NotifyLevel;
  ask?: NotifyAsk | null;
}

export interface AgentNotification {
  id: string;
  session_id: string;
  space_id: string | null;
  title: string;
  body: string | null;
  level: NotifyLevel;
  created_at: string;
  ask: NotifyAsk | null;
  /** `undefined` = ainda esperando. `null` = cancelada. */
  answer?: string | null;
  read: boolean;
}

export interface NotifyCounts {
  /** O número do badge: não lidas mais perguntas sem resposta. */
  total: number;
  unread: number;
  pending: number;
  bySession: Record<string, number>;
  bySpace: Record<string, number>;
}

/** Resposta pronta para entregar ao CLI que está bloqueado. */
export interface AnsweredAsk { id: string; answer: string | null }

export interface NotificationDeps {
  max?: number;
  now?: () => number;
  newId?: () => string;
}

/** Pergunta que ainda espera por mim. */
function pendente(n: AgentNotification): boolean {
  return n.ask !== null && n.answer === undefined;
}

/** Conta para o badge: nova para mim, ou esperando por mim. */
function conta(n: AgentNotification): boolean {
  return !n.read || pendente(n);
}

function corta(v: unknown, max: number): string {
  return String(v ?? "").slice(0, max);
}

function normalizaAsk(raw: unknown): NotifyAsk | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Partial<NotifyAsk>;
  const options = Array.isArray(a.options)
    ? a.options.map((o) => corta(o, MAX_TITLE)).filter(Boolean).slice(0, 8)
    : [];
  const placeholder = a.placeholder ? corta(a.placeholder, MAX_TITLE) : null;
  return { options, placeholder };
}

export class NotificationCenter {
  private items: AgentNotification[] = [];
  /** Respostas que o CLI ainda não levou. Some ao ser entregue. */
  private answered: AnsweredAsk[] = [];
  private readonly max: number;
  private readonly now: () => number;
  private readonly newId: () => string;

  constructor(deps: NotificationDeps = {}) {
    this.max = deps.max ?? MAX_KEPT;
    this.now = deps.now ?? Date.now;
    this.newId = deps.newId ?? randomUUID;
  }

  add(input: NotifyInput): AgentNotification {
    const title = corta(input.title, MAX_TITLE).trim();
    if (!title) throw new Error("título vazio");
    const level = LEVELS.includes(input.level as NotifyLevel) ? (input.level as NotifyLevel) : "info";
    const n: AgentNotification = {
      id: this.newId(),
      session_id: String(input.session_id || ""),
      space_id: input.space_id ?? null,
      title,
      body: input.body ? corta(input.body, MAX_BODY) : null,
      level,
      created_at: new Date(this.now()).toISOString(),
      ask: normalizaAsk(input.ask),
      read: false,
    };
    // Nunca pendente: só pergunta espera resposta.
    if (!n.ask) n.answer = null;
    this.items.push(n);
    this.prune();
    return n;
  }

  /** Da mais nova para a mais velha: é a ordem do painel. */
  list(): AgentNotification[] {
    return [...this.items].reverse();
  }

  find(id: string): AgentNotification | null {
    return this.items.find((n) => n.id === id) ?? null;
  }

  /** Grava a resposta e a põe na fila do CLI. `null` = cancelada.
   *  Devolve null quando não é pergunta ou quando já foi respondida. */
  answer(id: string, value: string | null): AgentNotification | null {
    const n = this.find(id);
    if (!n || !pendente(n)) return null;
    n.answer = value === null ? null : corta(value, MAX_BODY);
    n.read = true;
    this.answered.push({ id: n.id, answer: n.answer });
    return n;
  }

  /** Tira da lista. Pergunta pendente sai cancelada: o agente não pode ficar travado. */
  dismiss(id: string): boolean {
    const n = this.find(id);
    if (!n) return false;
    if (pendente(n)) this.answer(id, null);
    this.items = this.items.filter((x) => x.id !== id);
    return true;
  }

  /** Sem `sessionId`, limpa tudo. Devolve quantas saíram. */
  dismissAll(sessionId?: string): number {
    const alvos = this.items.filter((n) => !sessionId || n.session_id === sessionId);
    for (const n of alvos) this.dismiss(n.id);
    return alvos.length;
  }

  /** Sem `sessionId`, marca tudo. Pergunta pendente continua no badge. */
  markRead(sessionId?: string): void {
    for (const n of this.items) if (!sessionId || n.session_id === sessionId) n.read = true;
  }

  counts(): NotifyCounts {
    const bySession: Record<string, number> = {};
    const bySpace: Record<string, number> = {};
    let unread = 0;
    let pending = 0;
    let total = 0;
    for (const n of this.items) {
      if (!n.read) unread += 1;
      if (pendente(n)) pending += 1;
      if (!conta(n)) continue;
      total += 1;
      bySession[n.session_id] = (bySession[n.session_id] ?? 0) + 1;
      if (n.space_id) bySpace[n.space_id] = (bySpace[n.space_id] ?? 0) + 1;
    }
    return { total, unread, pending, bySession, bySpace };
  }

  /** Entrega cada resposta uma vez só. Quem chama é o servidor do CLI. */
  drainAnswered(): AnsweredAsk[] {
    const out = this.answered;
    this.answered = [];
    return out;
  }

  toJSON(): AgentNotification[] {
    return [...this.items];
  }

  /** Lê o que foi salvo em disco. Pergunta pendente volta cancelada: quem
   *  esperava a resposta era um processo que já morreu junto com o app. */
  restore(raw: unknown): void {
    if (!Array.isArray(raw)) return;
    this.items = [];
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const n = item as AgentNotification;
      if (!n.id || !n.title) continue;
      this.items.push({ ...n, answer: n.answer === undefined ? null : n.answer });
    }
    this.answered = [];
    this.prune();
  }

  /** Corta as mais velhas. Pergunta pendente fica: alguém espera por ela. */
  private prune(): void {
    if (this.items.length <= this.max) return;
    const manter: AgentNotification[] = [];
    // De trás para frente: as mais novas entram primeiro.
    for (let i = this.items.length - 1; i >= 0; i -= 1) {
      const n = this.items[i];
      if (manter.length < this.max || pendente(n)) manter.push(n);
    }
    this.items = manter.reverse();
  }
}

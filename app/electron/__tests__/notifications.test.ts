import { beforeEach, describe, expect, it } from "vitest";
import { NotificationCenter, type NotifyInput } from "../notifications";

/** Relógio e id fixos: o teste compara valores, não formatos. */
function center(max?: number) {
  let t = 1_700_000_000_000;
  let n = 0;
  return new NotificationCenter({ max, now: () => (t += 1000), newId: () => `n${++n}` });
}

const base: NotifyInput = { session_id: "s1", space_id: "e1", title: "Testes verdes" };

describe("add", () => {
  it("guarda a notificação com id, data e nível padrão", () => {
    const c = center();
    const n = c.add(base);
    expect(n.id).toBe("n1");
    expect(n.title).toBe("Testes verdes");
    expect(n.level).toBe("info");
    expect(n.created_at).toBe(new Date(1_700_000_001_000).toISOString());
    expect(n.read).toBe(false);
  });

  it("corta título e corpo longos: o painel e o macOS não mostram mais que isso", () => {
    const c = center();
    const n = c.add({ ...base, title: "t".repeat(300), body: "b".repeat(5000) });
    expect(n.title).toHaveLength(120);
    expect(n.body).toHaveLength(2000);
  });

  it("recusa título vazio", () => {
    const c = center();
    expect(() => c.add({ ...base, title: "   " })).toThrow();
  });

  it("nível desconhecido vira info", () => {
    const c = center();
    expect(c.add({ ...base, level: "catástrofe" as never }).level).toBe("info");
  });

  it("lista da mais nova para a mais velha", () => {
    const c = center();
    c.add({ ...base, title: "primeira" });
    c.add({ ...base, title: "segunda" });
    expect(c.list().map((n) => n.title)).toEqual(["segunda", "primeira"]);
  });
});

describe("pergunta", () => {
  it("pergunta nasce pendente, sem resposta", () => {
    const c = center();
    const n = c.add({ ...base, ask: { options: ["sim", "não"], placeholder: null } });
    expect(n.ask?.options).toEqual(["sim", "não"]);
    expect(n.answer).toBeUndefined();
    expect(c.counts().pending).toBe(1);
  });

  it("responder tira da fila de pendentes e marca como lida", () => {
    const c = center();
    const n = c.add({ ...base, ask: { options: [], placeholder: "escreva" } });
    expect(c.answer(n.id, "manda bala")?.answer).toBe("manda bala");
    expect(c.counts().pending).toBe(0);
    expect(c.list()[0].read).toBe(true);
  });

  // Cancelar é resposta: o agente está bloqueado esperando e precisa seguir.
  it("cancelar grava null e também resolve a pendência", () => {
    const c = center();
    const n = c.add({ ...base, ask: { options: [], placeholder: null } });
    expect(c.answer(n.id, null)?.answer).toBeNull();
    expect(c.counts().pending).toBe(0);
  });

  it("responder duas vezes não vale: a primeira resposta é a que foi para o agente", () => {
    const c = center();
    const n = c.add({ ...base, ask: { options: [], placeholder: null } });
    c.answer(n.id, "sim");
    expect(c.answer(n.id, "não")).toBeNull();
    expect(c.list()[0].answer).toBe("sim");
  });

  it("responder o que não é pergunta não faz nada", () => {
    const c = center();
    const n = c.add(base);
    expect(c.answer(n.id, "oi")).toBeNull();
  });
});

describe("dispensar e marcar como lida", () => {
  let c: NotificationCenter;
  beforeEach(() => { c = center(); });

  it("dispensar tira da lista", () => {
    const n = c.add(base);
    expect(c.dismiss(n.id)).toBe(true);
    expect(c.list()).toHaveLength(0);
  });

  // A pergunta pendente some da lista, mas o agente continua bloqueado.
  // Quem dispensa decide por cancelar, e o cancelamento chega ao agente.
  it("dispensar pergunta pendente cancela a resposta", () => {
    const n = c.add({ ...base, ask: { options: [], placeholder: null } });
    c.dismiss(n.id);
    expect(c.drainAnswered()).toEqual([{ id: n.id, answer: null }]);
  });

  it("dispensar tudo de uma sessão não toca nas outras", () => {
    c.add({ ...base, session_id: "s1" });
    c.add({ ...base, session_id: "s2" });
    expect(c.dismissAll("s1")).toBe(1);
    expect(c.list().map((n) => n.session_id)).toEqual(["s2"]);
  });

  it("dispensar tudo sem sessão limpa o painel inteiro", () => {
    c.add({ ...base, session_id: "s1" });
    c.add({ ...base, session_id: "s2" });
    expect(c.dismissAll()).toBe(2);
    expect(c.list()).toHaveLength(0);
  });

  it("marcar como lida zera o não lido daquela sessão", () => {
    c.add({ ...base, session_id: "s1" });
    c.add({ ...base, session_id: "s2" });
    c.markRead("s1");
    expect(c.counts().bySession).toEqual({ s2: 1 });
  });
});

describe("contagem do badge", () => {
  it("soma não lidas e perguntas pendentes, por sessão e por espaço", () => {
    const c = center();
    c.add({ session_id: "s1", space_id: "e1", title: "a" });
    c.add({ session_id: "s2", space_id: "e1", title: "b" });
    c.add({ session_id: "s3", space_id: "e2", title: "c" });
    expect(c.counts()).toMatchObject({
      total: 3, unread: 3, pending: 0,
      bySession: { s1: 1, s2: 1, s3: 1 },
      bySpace: { e1: 2, e2: 1 },
    });
  });

  // Ler não resolve: a ação continua esperando por mim.
  it("pergunta lida e sem resposta continua contando", () => {
    const c = center();
    c.add({ ...base, ask: { options: [], placeholder: null } });
    c.markRead();
    expect(c.counts()).toMatchObject({ total: 1, unread: 0, pending: 1 });
  });

  it("nada pendente, nada no badge", () => {
    const c = center();
    const n = c.add(base);
    c.markRead();
    expect(c.counts().total).toBe(0);
    c.dismiss(n.id);
    expect(c.counts().bySession).toEqual({});
  });
});

describe("limite", () => {
  it("descarta as mais velhas ao passar do teto", () => {
    const c = center(3);
    for (const t of ["a", "b", "c", "d"]) c.add({ ...base, title: t });
    expect(c.list().map((n) => n.title)).toEqual(["d", "c", "b"]);
  });

  // Descartar pergunta pendente deixaria o agente bloqueado para sempre.
  // Por isso ela passa do teto: o teto vale para o que dá para descartar.
  it("nunca descarta pergunta esperando resposta", () => {
    const c = center(2);
    c.add({ ...base, title: "pergunta", ask: { options: [], placeholder: null } });
    for (const t of ["a", "b", "c"]) c.add({ ...base, title: t });
    expect(c.list().map((n) => n.title)).toEqual(["c", "b", "pergunta"]);
  });
});

describe("drainAnswered", () => {
  it("entrega cada resposta uma vez só: quem espera é o CLI do agente", () => {
    const c = center();
    const n = c.add({ ...base, ask: { options: [], placeholder: null } });
    c.answer(n.id, "sim");
    expect(c.drainAnswered()).toEqual([{ id: n.id, answer: "sim" }]);
    expect(c.drainAnswered()).toEqual([]);
  });
});

describe("snapshot", () => {
  it("restaura o que foi salvo, sem pergunta pendente: o agente que perguntou já morreu", () => {
    const c = center();
    c.add({ ...base, title: "velha" });
    c.add({ ...base, title: "pergunta", ask: { options: [], placeholder: null } });
    const salvo = c.toJSON();

    const outro = center();
    outro.restore(salvo);
    expect(outro.list().map((n) => n.title)).toEqual(["pergunta", "velha"]);
    expect(outro.counts().pending).toBe(0);
    expect(outro.list()[0].answer).toBeNull();
  });

  it("lixo no arquivo não derruba o app", () => {
    const c = center();
    c.restore({ nada: "disso" } as never);
    expect(c.list()).toEqual([]);
  });
});

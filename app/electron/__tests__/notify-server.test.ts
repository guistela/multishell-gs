import { describe, expect, it, vi } from "vitest";
import { NotificationCenter } from "../notifications";
import { NotifyServer, socketPathFor } from "../notify-server";

function server() {
  let n = 0;
  const center = new NotificationCenter({ newId: () => `n${++n}` });
  const srv = new NotifyServer(center, { newToken: () => `tok${++n}` });
  return { center, srv };
}

/** Uma requisição do CLI, já como o servidor recebe: uma linha de JSON. */
function linha(req: Record<string, unknown>): string {
  return JSON.stringify(req);
}

describe("socketPathFor", () => {
  it("no macOS é um arquivo dentro do userData", () => {
    expect(socketPathFor("/Users/fulano/Library/App/Multishell", "darwin")).toBe(
      "/Users/fulano/Library/App/Multishell/agent-notify.sock",
    );
  });

  // Unix socket não existe no Windows: lá é named pipe, que não é caminho de arquivo.
  it("no Windows é um named pipe", () => {
    expect(socketPathFor("C:\\qualquer", "win32")).toMatch(/^\\\\[.]\\pipe\\multishell-/);
  });
});

describe("register", () => {
  it("cada sessão ganha um token próprio", () => {
    const { srv } = server();
    const a = srv.register("s1", "e1");
    const b = srv.register("s2", "e1");
    expect(a).not.toBe(b);
  });

  it("registrar de novo a mesma sessão mantém o token: o shell não foi reiniciado", () => {
    const { srv } = server();
    expect(srv.register("s1", "e1")).toBe(srv.register("s1", "e1"));
  });

  it("fechar a sessão invalida o token", async () => {
    const { srv } = server();
    const tok = srv.register("s1", "e1");
    srv.unregister("s1");
    const r = JSON.parse(await srv.handle(linha({ op: "notify", token: tok, title: "oi" })));
    expect(r.ok).toBe(false);
  });
});

describe("notify", () => {
  it("cria a notificação na sessão do token e devolve o id", async () => {
    const { srv, center } = server();
    const tok = srv.register("s1", "e1");
    const r = JSON.parse(await srv.handle(linha({ op: "notify", token: tok, title: "Testes verdes", body: "340", level: "warn" })));
    expect(r).toEqual({ ok: true, id: "n2" });
    expect(center.list()[0]).toMatchObject({ session_id: "s1", space_id: "e1", title: "Testes verdes", level: "warn" });
  });

  // O token é o que impede um espaço de falar pela sessão de outro.
  it("token errado não cria nada", async () => {
    const { srv, center } = server();
    srv.register("s1", "e1");
    const r = JSON.parse(await srv.handle(linha({ op: "notify", token: "chutei", title: "oi" })));
    expect(r.ok).toBe(false);
    expect(center.list()).toHaveLength(0);
  });

  it("o cliente não escolhe a sessão: o token escolhe", async () => {
    const { srv, center } = server();
    const tok = srv.register("s1", "e1");
    srv.register("s2", "e2");
    await srv.handle(linha({ op: "notify", token: tok, title: "oi", session_id: "s2", space_id: "e2" }));
    expect(center.list()[0]).toMatchObject({ session_id: "s1", space_id: "e1" });
  });

  it("título vazio vira erro, não exceção", async () => {
    const { srv } = server();
    const tok = srv.register("s1", "e1");
    const r = JSON.parse(await srv.handle(linha({ op: "notify", token: tok, title: "" })));
    expect(r.ok).toBe(false);
  });

  it("linha que não é JSON vira erro", async () => {
    const { srv } = server();
    expect(JSON.parse(await srv.handle("nada disso")).ok).toBe(false);
  });

  it("operação desconhecida vira erro", async () => {
    const { srv } = server();
    const tok = srv.register("s1", "e1");
    expect(JSON.parse(await srv.handle(linha({ op: "formatar-disco", token: tok }))).ok).toBe(false);
  });
});

describe("ask", () => {
  it("espera a resposta antes de responder ao CLI", async () => {
    const { srv, center } = server();
    const tok = srv.register("s1", "e1");
    const esperando = srv.handle(linha({ op: "ask", token: tok, title: "Faço o push?", options: ["sim", "não"] }));

    const pergunta = center.list()[0];
    expect(pergunta.ask?.options).toEqual(["sim", "não"]);

    center.answer(pergunta.id, "sim");
    srv.deliverAnswers();
    expect(JSON.parse(await esperando)).toEqual({ ok: true, answer: "sim" });
  });

  it("cancelar devolve answer null: o agente segue sabendo que ninguém respondeu", async () => {
    const { srv, center } = server();
    const tok = srv.register("s1", "e1");
    const esperando = srv.handle(linha({ op: "ask", token: tok, title: "Faço o push?" }));
    center.dismiss(center.list()[0].id);
    srv.deliverAnswers();
    expect(JSON.parse(await esperando)).toEqual({ ok: true, answer: null });
  });

  // Agente bloqueado para sempre trava o trabalho. O prazo o solta.
  it("o prazo solta o agente com answer null", async () => {
    vi.useFakeTimers();
    try {
      const { srv } = server();
      const tok = srv.register("s1", "e1");
      const esperando = srv.handle(linha({ op: "ask", token: tok, title: "Faço o push?", timeout_ms: 5000 }));
      vi.advanceTimersByTime(5001);
      expect(JSON.parse(await esperando)).toEqual({ ok: true, answer: null });
    } finally {
      vi.useRealTimers();
    }
  });

  it("fechar a sessão solta quem espera", async () => {
    const { srv } = server();
    const tok = srv.register("s1", "e1");
    const esperando = srv.handle(linha({ op: "ask", token: tok, title: "Faço o push?" }));
    srv.unregister("s1");
    expect(JSON.parse(await esperando)).toEqual({ ok: true, answer: null });
  });

  it("parar o servidor solta todo mundo que espera", async () => {
    const { srv } = server();
    const tok = srv.register("s1", "e1");
    const esperando = srv.handle(linha({ op: "ask", token: tok, title: "a" }));
    srv.releaseAll();
    expect(JSON.parse(await esperando)).toEqual({ ok: true, answer: null });
  });
});

describe("limite de tamanho", () => {
  it("recusa linha gigante sem tentar interpretar", async () => {
    const { srv } = server();
    const tok = srv.register("s1", "e1");
    const r = JSON.parse(await srv.handle(linha({ op: "notify", token: tok, title: "x".repeat(200_000) })));
    expect(r.ok).toBe(false);
  });
});

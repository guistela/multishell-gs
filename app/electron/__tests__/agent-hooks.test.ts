import { describe, expect, it } from "vitest";
import {
  APPROVAL_ASK_TIMEOUT_MS,
  APPROVAL_EVENT,
  APPROVAL_MATCHER,
  APPROVAL_TIMEOUT_S,
  MULTISHELL_HOOK_MARK,
  withApprovalHook,
  withNotifyHooks,
  withoutApprovalHook,
  withoutNotifyHooks,
} from "../agent-hooks";

const CLI = "/espaco/bin/multishell";

/** Os comandos que o Multishell pôs, em qualquer evento. */
function nossos(settings: any): string[] {
  const hooks = settings.hooks ?? {};
  return Object.values(hooks)
    .flat()
    .flatMap((g: any) => g.hooks ?? [])
    .filter((h: any) => h.command?.includes(MULTISHELL_HOOK_MARK))
    .map((h: any) => h.command);
}

describe("withNotifyHooks", () => {
  it("liga Notification e Stop chamando o CLI do espaço", () => {
    const s = withNotifyHooks({}, CLI);
    expect(Object.keys(s.hooks)).toEqual(["Notification", "Stop"]);
    expect(nossos(s)).toEqual([`${CLI} hook Notification`, `${CLI} hook Stop`]);
  });

  it("não é a única config do arquivo: o resto fica", () => {
    const s = withNotifyHooks({ model: "opus", permissions: { allow: ["Bash"] } }, CLI);
    expect(s.model).toBe("opus");
    expect(s.permissions).toEqual({ allow: ["Bash"] });
  });

  // O usuário pode ter hooks próprios. Sobrescrever seria sequestrar a config dele.
  it("preserva hook do usuário no mesmo evento", () => {
    const meu = { matcher: "", hooks: [{ type: "command", command: "meu-script.sh" }] };
    const s = withNotifyHooks({ hooks: { Stop: [meu] } }, CLI);
    const stop = JSON.stringify(s.hooks.Stop);
    expect(stop).toContain("meu-script.sh");
    expect(stop).toContain(MULTISHELL_HOOK_MARK);
  });

  it("rodar duas vezes não duplica nada", () => {
    const uma = withNotifyHooks({}, CLI);
    const duas = withNotifyHooks(uma, CLI);
    expect(nossos(duas)).toHaveLength(2);
  });

  // O espaço pode ter sido renomeado: o caminho antigo não existe mais.
  it("troca o caminho antigo do CLI em vez de somar outro", () => {
    const antes = withNotifyHooks({}, "/velho/bin/multishell");
    const depois = withNotifyHooks(antes, CLI);
    expect(nossos(depois)).toEqual([`${CLI} hook Notification`, `${CLI} hook Stop`]);
  });

  it("não muda o objeto recebido", () => {
    const original = { hooks: {} };
    withNotifyHooks(original, CLI);
    expect(original).toEqual({ hooks: {} });
  });

  it("settings corrompido vira settings novo, sem derrubar nada", () => {
    expect(nossos(withNotifyHooks(null as never, CLI))).toHaveLength(2);
    expect(nossos(withNotifyHooks("lixo" as never, CLI))).toHaveLength(2);
  });
});

describe("withoutNotifyHooks", () => {
  it("tira só o que o Multishell pôs", () => {
    const meu = { matcher: "", hooks: [{ type: "command", command: "meu-script.sh" }] };
    const s = withoutNotifyHooks(withNotifyHooks({ hooks: { Stop: [meu] } }, CLI));
    expect(nossos(s)).toEqual([]);
    expect(JSON.stringify(s.hooks.Stop)).toContain("meu-script.sh");
  });

  it("evento que fica vazio sai do arquivo", () => {
    const s = withoutNotifyHooks(withNotifyHooks({}, CLI));
    expect(s.hooks).toEqual({});
  });

  it("sem hooks do Multishell, não mexe em nada", () => {
    const original = { model: "opus", hooks: { Stop: [{ matcher: "", hooks: [{ type: "command", command: "x" }] }] } };
    expect(withoutNotifyHooks(original)).toEqual(original);
  });

  it("settings corrompido devolve objeto vazio", () => {
    expect(withoutNotifyHooks(null as never)).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// Aprovação pelo painel: o hook PreToolUse responde allow/deny ao Claude Code.
// ---------------------------------------------------------------------------
describe("hook de aprovação", () => {
  it("escreve o PreToolUse com matcher e prazo", () => {
    const s: any = withApprovalHook({}, CLI);
    const grupo = s.hooks.PreToolUse[0];
    expect(grupo.matcher).toBe(APPROVAL_MATCHER);
    expect(grupo.hooks[0]).toEqual({
      type: "command",
      command: `${CLI} ${MULTISHELL_HOOK_MARK}${APPROVAL_EVENT}`,
      timeout: APPROVAL_TIMEOUT_S,
    });
  });

  it("o prazo do Claude Code é maior que o prazo da pergunta", () => {
    // Senão o Claude Code mata o hook antes de o painel desistir.
    expect(APPROVAL_TIMEOUT_S * 1000).toBeGreaterThan(APPROVAL_ASK_TIMEOUT_MS);
  });

  it("rodar de novo troca o caminho e não soma outro hook", () => {
    const um: any = withApprovalHook({}, "/velho/multishell");
    const dois: any = withApprovalHook(um, CLI);
    expect(dois.hooks.PreToolUse).toHaveLength(1);
    expect(nossos(dois)).toEqual([`${CLI} ${MULTISHELL_HOOK_MARK}${APPROVAL_EVENT}`]);
  });

  it("não mexe no hook PreToolUse do usuário", () => {
    const meu = { matcher: "Bash", hooks: [{ type: "command", command: "meu-lint" }] };
    const s: any = withoutApprovalHook(withApprovalHook({ hooks: { PreToolUse: [meu] } }, CLI));
    expect(s.hooks.PreToolUse).toEqual([meu]);
  });

  it("desligar some com o evento quando só tinha o nosso", () => {
    const s: any = withoutApprovalHook(withApprovalHook({}, CLI));
    expect(s.hooks.PreToolUse).toBeUndefined();
  });

  it("aviso e aprovação convivem sem se apagar", () => {
    const s: any = withApprovalHook(withNotifyHooks({}, CLI), CLI);
    expect(nossos(s).sort()).toEqual([
      `${CLI} ${MULTISHELL_HOOK_MARK}Notification`,
      `${CLI} ${MULTISHELL_HOOK_MARK}PreToolUse`,
      `${CLI} ${MULTISHELL_HOOK_MARK}Stop`,
    ]);
    // Desligar um não derruba o outro.
    expect(nossos(withoutApprovalHook(s))).toEqual([
      `${CLI} ${MULTISHELL_HOOK_MARK}Notification`,
      `${CLI} ${MULTISHELL_HOOK_MARK}Stop`,
    ]);
  });

  it("arquivo que nunca teve hooks continua sem a chave", () => {
    expect(withoutApprovalHook({ model: "opus" })).toEqual({ model: "opus" });
  });
});

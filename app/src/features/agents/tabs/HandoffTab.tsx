import { useState } from "react";
import { useAppStore } from "../../../store";
import {
  NEXT_ACTIONS_PLACEHOLDER,
  OBJECTIVE_PLACEHOLDER,
  buildHandoffPrompt,
  handoffToNewAgent,
  handoffToSession,
  type HandoffReason,
} from "../handoff";

export function HandoffTab() {
  const sessions = useAppStore((s) => s.sessions);
  const selectedSessionId = useAppStore((s) => s.selectedSessionId);
  const spaces = useAppStore((s) => s.spaces);
  const providers = useAppStore((s) => s.providers);
  const selectedSpaceId = useAppStore((s) => s.selectedSpaceId) ?? spaces[0]?.id;
  const space = spaces.find((s) => s.id === selectedSpaceId);
  const inSpaceSessions = sessions.filter((s) => s.space_id === space?.id && !s.detached);
  const activeSession = inSpaceSessions.find((s) => s.id === selectedSessionId) ?? inSpaceSessions[0];

  const [triggerReason, setTriggerReason] = useState<HandoffReason>("token_exhausted");
  const [taskObjective, setTaskObjective] = useState("");
  const [nextActions, setNextActions] = useState("");
  const [selectedTargetSessionId, setSelectedTargetSessionId] = useState<string>("");
  const [selectedTargetProviderId, setSelectedTargetProviderId] = useState<string>(providers[0]?.id ?? "");
  const [enableBypass, setEnableBypass] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const otherSessions = inSpaceSessions.filter((s) => s.id !== activeSession?.id);
  const activeProvider = providers.find((p) => p.id === activeSession?.provider_id);

  const generateHandoffPromptText = (targetName: string) =>
    buildHandoffPrompt({
      origin: activeSession,
      originProvider: activeProvider,
      space,
      targetName,
      reason: triggerReason,
      objective: taskObjective,
      nextActions,
    });

  const handlePassToExistingTerminal = async () => {
    const target = inSpaceSessions.find((s) => s.id === (selectedTargetSessionId || otherSessions[0]?.id));
    if (!target) {
      setFeedback("⚠️ Selecione um terminal de destino existente no mesmo espaço.");
      setTimeout(() => setFeedback(null), 4000);
      return;
    }
    const res = await handoffToSession(target.id, generateHandoffPromptText(target.title));
    if (!res.delivered) {
      setFeedback(
        res.reason === "no_harness"
          ? `⚠️ "${target.title}" não tem agente rodando. Inicie o harness nele antes do handoff, ou use a Opção 2.`
          : res.reason === "write_failed" ? "⚠️ Falha no envio. Tente novamente." : `⚠️ Terminal de destino não existe mais.`
      );
      setTimeout(() => setFeedback(null), 5000);
      return;
    }
    setFeedback(`Contexto enviado ao terminal "${target.title}".`);
    setTimeout(() => setFeedback(null), 4000);
  };

  const handleStartNewAgentAndHandoff = async () => {
    if (!space) return;
    const provider = providers.find((p) => p.id === selectedTargetProviderId) ?? providers[0];
    if (!provider) {
      setFeedback("⚠️ Nenhum provedor/harness cadastrado.");
      setTimeout(() => setFeedback(null), 4000);
      return;
    }
    handoffToNewAgent({
      spaceId: space.id,
      cwd: activeSession?.cwd,
      provider,
      bypass: enableBypass,
      prompt: generateHandoffPromptText(provider.name),
    });
  };

  const copyHandoffPrompt = () => {
    const prompt = generateHandoffPromptText("Novo Agente");
    void navigator.clipboard.writeText(prompt);
    setFeedback("✓ Prompt estruturado de handoff copiado para a área de transferência!");
    setTimeout(() => setFeedback(null), 3000);
  };

  return (
    <div className="handoff-view">
      {feedback && <div className="handoff-feedback">{feedback}</div>}

      {/* Header com Gatilho */}
      <div className="handoff-panel handoff-header">
        <div>
          <h3>🤝 Central de Handoff & Continuidade Multiagente</h3>
          <p>
            Espaço Ativo: <strong className="handoff-space-name">{space?.name ?? "Padrão"}</strong> • Terminal Origem:{" "}
            <strong>{activeSession?.title ?? "Nenhum"}</strong> ({activeProvider?.name ?? "Shell"})
          </p>
        </div>

        <div className="handoff-reason">
          <label className="handoff-label">Motivo do Handoff:</label>
          <select
            aria-label="Motivo do Handoff"
            className="handoff-select compact"
            value={triggerReason}
            onChange={(e) => setTriggerReason(e.target.value as any)}
          >
            <option value="token_exhausted">🔴 Limite de Tokens / Quota Esgotada</option>
            <option value="role_transition">🟡 Transição de Papel (Arquiteto ➔ Dev ➔ QA)</option>
            <option value="conflict_resolution">🔵 Resolução de Conflito / Nova Abordagem</option>
          </select>
        </div>
      </div>

      {/* Grid de Destino do Handoff (Duas Opções) */}
      <div className="handoff-options">
        {/* Opção A: Passar para terminal existente no mesmo space */}
        <div className="handoff-panel">
          <div className="handoff-option-head">
            <span className="handoff-option-icon">➡️</span>
            <div>
              <h4>Opção 1: Passar para Terminal Existente</h4>
              <span className="handoff-option-desc">
                Transfere o contexto para outro shell ou agente já aberto no espaço "{space?.name}"
              </span>
            </div>
          </div>

          {otherSessions.length > 0 ? (
            <>
              <label className="handoff-field-label">Selecione o terminal de destino:</label>
              <select
                aria-label="Terminal de destino do handoff"
                className="handoff-select"
                value={selectedTargetSessionId || otherSessions[0]?.id}
                onChange={(e) => setSelectedTargetSessionId(e.target.value)}
              >
                {otherSessions.map((s) => (
                  <option key={s.id} value={s.id} disabled={!s.harness_running}>
                    {s.title} ({s.harness_running ? "Harness ativo" : "sem agente — não recebe handoff"})
                  </option>
                ))}
              </select>

              <button
                type="button"
                className="primary handoff-action"
                onClick={() => void handlePassToExistingTerminal()}
              >
                Transferir Bastão para este Terminal ➔
              </button>
            </>
          ) : (
            <div className="handoff-empty">
              Não há outro terminal aberto no espaço "{space?.name}".<br />
              Use a Opção 2 ao lado para iniciar um novo terminal com outro agente.
            </div>
          )}
        </div>

        {/* Opção B: Iniciar novo terminal com outro agente no mesmo space */}
        <div className="handoff-panel accent">
          <div className="handoff-option-head">
            <span className="handoff-option-icon">🚀</span>
            <div>
              <h4 className="accent">Opção 2: Iniciar Novo Terminal com Outro Agente</h4>
              <span className="handoff-option-desc">
                Abre instantaneamente outro agente (ex: Gemini, Codex, Claude) no mesmo espaço e herda o trabalho
              </span>
            </div>
          </div>

          <label className="handoff-field-label">Escolha o novo harness / provedor:</label>
          <select
            aria-label="Escolha o novo harness"
            className="handoff-select"
            value={selectedTargetProviderId}
            onChange={(e) => setSelectedTargetProviderId(e.target.value)}
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <label className="handoff-checkbox">
            <input
              type="checkbox"
              checked={enableBypass}
              onChange={(e) => setEnableBypass(e.target.checked)}
            />
            <span>Executar com Bypass de Permissões (Modo Autônomo)</span>
          </label>

          <button
            type="button"
            className="primary handoff-action success"
            onClick={() => void handleStartNewAgentAndHandoff()}
          >
            🚀 Iniciar Terminal & Passar Bastão
          </button>
        </div>
      </div>

      {/* Pacote de Continuidade Editável */}
      <div className="handoff-panel">
        <div className="handoff-panel-head">
          <h4>Prompt de handoff (você escreve — nada é lido do terminal automaticamente)</h4>
          <button type="button" className="handoff-copy-btn" onClick={copyHandoffPrompt}>
            Copiar Prompt Formatado
          </button>
        </div>

        <div className="handoff-field">
          <label className="handoff-field-label">Objetivo da tarefa:</label>
          <input type="text" placeholder={OBJECTIVE_PLACEHOLDER} value={taskObjective} onChange={(e) => setTaskObjective(e.target.value)} />
        </div>

        <div className="handoff-field">
          <label className="handoff-field-label">Próximas ações imediatas:</label>
          <textarea rows={3} placeholder={NEXT_ACTIONS_PLACEHOLDER} value={nextActions} onChange={(e) => setNextActions(e.target.value)} />
        </div>
      </div>
    </div>
  );
}

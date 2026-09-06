import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../../store";
import type { Session } from "../../types";
import { cleanSelection } from "./selection";
import {
  CONVERSATION_INSTRUCTION,
  buildConversationPrompt,
  startConversationInNewAgent,
  startConversationInSession,
} from "../agents/newConversation";

export interface SelectionBarProps {
  /** Terminal de onde veio a seleção. */
  session: Session;
  selection: string;
  /** Posição na janela, onde o mouse soltou. */
  at: { x: number; y: number };
  onClose: () => void;
}

/**
 * Barra que aparece ao selecionar texto no terminal: copiar, ou mandar o trecho
 * para um agente de outro terminal do mesmo espaço.
 */
export function SelectionBar({ session, selection, at, onClose }: SelectionBarProps) {
  const sessions = useAppStore((s) => s.sessions);
  const spaces = useAppStore((s) => s.spaces);
  const providers = useAppStore((s) => s.providers);
  const space = spaces.find((s) => s.id === session.space_id);

  const [expanded, setExpanded] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Clique fora e Escape fecham, como qualquer popover.
  useEffect(() => {
    const onPointer = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const agentesDoEspaco = sessions.filter(
    (s) => s.space_id === session.space_id && s.id !== session.id && !s.detached && s.harness_running
  );

  const prompt = () =>
    buildConversationPrompt({
      selection,
      originTitle: session.title,
      spaceName: space?.name,
      instruction,
    });

  const copiar = () => {
    void navigator.clipboard.writeText(cleanSelection(selection));
    onClose();
  };

  const paraTerminal = async (target: Session) => {
    const res = await startConversationInSession({ targetSessionId: target.id, prompt: prompt() });
    if (!res.delivered) {
      setFeedback(`"${target.title}" não tem agente rodando.`);
      return;
    }
    onClose();
  };

  const paraNovoAgente = (providerId: string) => {
    const provider = providers.find((p) => p.id === providerId);
    if (!provider || !space) return;
    startConversationInNewAgent({ spaceId: space.id, provider, prompt: prompt() });
    onClose();
  };

  return (
    <div
      ref={ref}
      className="selection-bar"
      data-testid="selection-bar"
      style={{ left: at.x, top: at.y }}
      onContextMenu={(e) => e.stopPropagation()}
    >
      <div className="selection-bar-actions">
        <button type="button" onClick={copiar}>Copiar</button>
        <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
          Nova conversa
        </button>
      </div>

      {expanded && (
        <div className="selection-bar-panel">
          <label className="selection-bar-label" htmlFor="selection-instruction">
            Instrução que vai junto do trecho
          </label>
          <input
            id="selection-instruction"
            type="text"
            value={instruction}
            placeholder={CONVERSATION_INSTRUCTION}
            onChange={(e) => setInstruction(e.target.value)}
          />

          {agentesDoEspaco.length > 0 && (
            <>
              <span className="selection-bar-section">Agente já rodando</span>
              {agentesDoEspaco.map((s) => (
                <button key={s.id} type="button" className="selection-bar-target" onClick={() => void paraTerminal(s)}>
                  {s.title}
                </button>
              ))}
            </>
          )}

          <span className="selection-bar-section">Abrir novo agente</span>
          {providers.map((p) => (
            <button key={p.id} type="button" className="selection-bar-target" onClick={() => paraNovoAgente(p.id)}>
              {p.name}
            </button>
          ))}

          {feedback && <span className="selection-bar-feedback" role="alert">{feedback}</span>}
        </div>
      )}
    </div>
  );
}

import type { MenuItem } from "../../components/ContextMenu";
import { useAppStore } from "../../store";
import type { Session } from "../../types";
import { buildHandoffPrompt, handoffToNewAgent, handoffToSession, type HandoffReason } from "./handoff";

/**
 * Itens de handoff multiagente para o menu de contexto de um terminal.
 * Ficam disponíveis em qualquer terminal do espaço: aba, tile e sidebar.
 */
export function handoffMenuItems(session: Session, reason: HandoffReason = "token_exhausted"): MenuItem[] {
  const st = useAppStore.getState();
  const space = st.spaces.find((sp) => sp.id === session.space_id);
  const originProvider = st.providers.find((p) => p.id === session.provider_id) ?? null;
  const others = st.sessions.filter((s) => s.space_id === session.space_id && s.id !== session.id && !s.detached);

  const promptFor = (targetName: string) =>
    buildHandoffPrompt({ origin: session, originProvider, space, targetName, reason });

  return [
    {
      id: "handoff-existing",
      label: "Passar contexto para",
      icon: "🤝",
      disabled: others.every((t) => !t.harness_running),
      children: others.map((target) => ({
        id: `handoff-to-${target.id}`,
        // Shell puro não recebe handoff: o pacote viraria comando.
        label: target.harness_running ? target.title : `${target.title} (sem agente)`,
        disabled: !target.harness_running,
        onClick: () => void handoffToSession(target.id, promptFor(target.title)),
      })),
    },
    {
      id: "handoff-new-agent",
      label: "Continuar em novo agente",
      icon: "🚀",
      disabled: st.providers.length === 0,
      children: st.providers.map((provider) => ({
        id: `handoff-new-${provider.id}`,
        label: provider.name,
        onClick: () =>
          handoffToNewAgent({
            spaceId: session.space_id,
            provider,
            bypass: false,
            prompt: promptFor(provider.name),
          }),
      })),
    },
    {
      id: "handoff-open-tab",
      label: "Abrir central de handoff",
      icon: "🧭",
      onClick: () => {
        useAppStore.getState().selectSession(session.id);
        useAppStore.getState().setWorkspaceTab("handoff");
      },
    },
  ];
}

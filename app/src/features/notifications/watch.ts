// Liga a central do main ao store do renderer.
//
// O badge chega pronto no evento: nenhuma janela precisa perguntar quanto é.
// A lista só é buscada quando o painel está aberto — é a única tela que a usa.
import { bridge } from "../../bridge";
import { useAppStore } from "../../store";

/** Registra o ouvinte. Devolve a função que o desliga.
 *  `sempre` = recarrega a lista a cada mudança, com painel aberto ou não.
 *  A janela flutuante das perguntas precisa disso: a lista é tudo que ela mostra. */
export function watchNotifications(sempre = false): () => void {
  return bridge().onNotificationsChanged((counts) => {
    useAppStore.setState({ notifyCounts: counts });
    if (sempre || useAppStore.getState().notificationsOpen) void useAppStore.getState().loadNotifications();
  });
}

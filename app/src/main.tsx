import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { FloatingAsks } from "./features/notifications/FloatingAsks";
import { ErrorBoundary, reportFront } from "./ErrorBoundary";
import "./i18n";
import { hasBridge, bridge } from "./bridge";

if (hasBridge()) document.body.classList.add(`platform-${bridge().platform}`);

window.addEventListener("error", (e) => reportFront("error", `${e.message} @ ${e.filename}:${e.lineno}`));
window.addEventListener("unhandledrejection", (e) => reportFront("error", `unhandled: ${String(e.reason?.stack ?? e.reason)}`));

// A janela flutuante das perguntas é outra tela, não o app. Fica fora do <App>
// de propósito: ela não carrega sessões, não escuta atalhos, não roda nada.
const sohPerguntas = window.location.hash === "#/asks";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      {sohPerguntas ? <FloatingAsks /> : <App />}
    </ErrorBoundary>
  </React.StrictMode>,
);



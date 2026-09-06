import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary, reportFront } from "./ErrorBoundary";
import "./i18n";
import { hasBridge, bridge } from "./bridge";

if (hasBridge()) document.body.classList.add(`platform-${bridge().platform}`);

window.addEventListener("error", (e) => reportFront("error", `${e.message} @ ${e.filename}:${e.lineno}`));
window.addEventListener("unhandledrejection", (e) => reportFront("error", `unhandled: ${String(e.reason?.stack ?? e.reason)}`));

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);



import { Component, type ReactNode } from "react";
import { api } from "./api";

/** Manda o erro para o log do main. Nunca lança: sem bridge, ignora. */
export function reportFront(level: "error" | "warn", message: string) {
  void api.logFront(level, message).catch(() => {});
}

interface State { error: Error | null }

/** Mostra o erro na tela em vez de tela preta. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State { return { error }; }
  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    reportFront("error", `${error.message}\n${error.stack ?? ""}\n${info.componentStack ?? ""}`);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <pre style={{ padding: 16, color: "#ff6b6b", whiteSpace: "pre-wrap", fontFamily: "monospace" }}>
        {this.state.error.message}{"\n"}{this.state.error.stack}
      </pre>
    );
  }
}

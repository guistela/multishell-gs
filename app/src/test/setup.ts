import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

try { localStorage.setItem("multishell.language", "pt-BR"); } catch { /* sem storage */ }
afterEach(() => cleanup());

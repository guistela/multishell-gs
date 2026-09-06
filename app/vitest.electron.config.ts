import { defineConfig } from "vitest/config";

// Testes do processo main (node). O config jsdom do renderer fica em vitest.config.ts.
export default defineConfig({
  test: {
    name: "electron",
    environment: "node",
    include: ["electron/**/*.test.ts"],
    testTimeout: 10_000,
  },
});

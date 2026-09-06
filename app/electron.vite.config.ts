import { resolve } from "node:path";
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";

// Fora do bundle do main/preload: electron em si e os módulos nativos (carregam .node em runtime).
// Vite 8 (rolldown) perde o `external` padrão do electron-vite quando plugins mesclam config;
// por isso a lista é explícita aqui.
const external = ["electron", "node-pty", "@napi-rs/keyring"];

export default defineConfig({
  main: {
    build: {
      lib: { entry: { index: resolve(__dirname, "electron/main.ts") } },
      // electron-vite dev procura `out/main/index.mjs` quando package.json tem "type": "module".
      rollupOptions: { external, output: { format: "es", entryFileNames: "[name].mjs" } },
    },
  },
  preload: {
    build: {
      lib: { entry: { index: resolve(__dirname, "electron/preload.ts") } },
      // Preload com sandbox: true precisa ser CommonJS. `.cjs` evita o `type: module` do package.json.
      rollupOptions: { external, output: { format: "cjs", entryFileNames: "[name].cjs" } },
    },
  },
  renderer: {
    root: __dirname,
    plugins: [react()],
    build: {
      rollupOptions: { input: resolve(__dirname, "index.html") },
    },
  },
});

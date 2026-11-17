import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const resolveFromRoot = (path) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        game: resolveFromRoot("./index.html"),
        dashboard: resolveFromRoot("./dashboard.html"),
      },
    },
  },
});

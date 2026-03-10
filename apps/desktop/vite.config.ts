import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const gitHash = (() => {
  try { return execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim(); }
  catch { return "unknown"; }
})();

export default defineConfig({
  root: path.resolve(__dirname, "src/renderer"),
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(gitHash),
  },
  build: {
    outDir: path.resolve(__dirname, "dist/renderer"),
    emptyOutDir: true
  }
});

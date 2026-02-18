import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { manifest } from "./src/manifest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function writeManifest() {
  return {
    name: "write-manifest",
    closeBundle() {
      const outDir = resolve(__dirname, "dist");
      mkdirSync(outDir, { recursive: true });
      writeFileSync(resolve(outDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf-8");
    }
  };
}

export default defineConfig({
  plugins: [react(), writeManifest()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        "content/index": resolve(__dirname, "src/content/index.ts"),
        "background/index": resolve(__dirname, "src/background/index.ts")
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]"
      }
    }
  }
});
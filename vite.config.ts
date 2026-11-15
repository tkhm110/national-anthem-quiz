/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import {
  PRIVATE_MODE,
  PRIVATE_OUT_DIR,
  localAnthemsPlugin,
} from "./scripts/lib/vite-local-anthems.ts";

const rootDir = fileURLToPath(new URL("./", import.meta.url));

// "private" モード（pnpm dev:private / build:private）のときだけ、local/ の全曲を加えて dist-private/ に出力する。
// それ以外（公開サイトのビルド・CI・テスト）では local/ を読まない。
export default defineConfig(({ mode }) => ({
  plugins: [react(), localAnthemsPlugin(mode, rootDir)],
  build: { outDir: mode === PRIVATE_MODE ? PRIVATE_OUT_DIR : "dist" },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
}));

import { defineConfig } from "vitest/config";

// background.ts を 1 エントリとして dist/background.js (ES module, コード分割なし) に出す。
// public/manifest.json は publicDir として dist/manifest.json にそのままコピーされる。
export default defineConfig({
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
    minify: false,
    modulePreload: false,
    rolldownOptions: {
      input: "src/background.ts",
      output: {
        format: "es",
        entryFileNames: "background.js",
        codeSplitting: false,
      },
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});

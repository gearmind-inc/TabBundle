import { defineConfig } from "vitest/config";

// 入口は 2 つ: background.ts → dist/background.js (manifest の service_worker)、
// popup.html → dist/popup.html + dist/popup.js (manifest の action.default_popup)。
// 両方が使うコードは dist/chunks/shared-<hash>.js に出る (ES module の import で読む。
// service worker は "type": "module" なので読める)。
// rolldown は入口が複数のとき output.codeSplitting: false を受け付けない (ビルドがエラーになる) ため、共有チャンクを許す。
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
      input: { background: "src/background.ts", popup: "popup.html" },
      output: {
        format: "es",
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/shared-[hash].js",
      },
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});

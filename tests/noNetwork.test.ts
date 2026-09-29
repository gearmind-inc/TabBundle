/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import popupHtml from "../popup.html?raw";

// 拡張機能は外部と通信しない (本文もブックマークもこの PC の中だけ)。
// コードに通信の API が書かれていないことを、ソースをそのまま (?raw) 読んで確かめる。
// (@types/node が無いので node:fs ではなく Vite の import.meta.glob で読む)

const sources = import.meta.glob<string>("../src/**/*.ts", { query: "?raw", import: "default", eager: true });
const FORBIDDEN = [/\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /sendBeacon/, /EventSource/];

describe("外部通信が無い", () => {
  it("src/ 配下の .ts をソースのまま読めている", () => {
    expect(Object.keys(sources)).toEqual(
      expect.arrayContaining([
        "../src/background.ts",
        "../src/popup.ts",
        "../src/chrome/pageText.ts",
        "../src/core/search.ts",
      ]),
    );
    expect(sources["../src/background.ts"]).toContain("chrome.runtime.onInstalled.addListener");
  });

  it.each(FORBIDDEN.map((pattern) => [String(pattern), pattern] as const))("src/ の .ts に %s が無い", (_name, pattern) => {
    const hits = Object.entries(sources)
      .filter(([, source]) => pattern.test(source))
      .map(([path]) => path);
    expect(hits).toEqual([]);
  });

  it("popup.html は外部の URL を読み込まない", () => {
    expect(popupHtml).toContain('id="query"');
    expect(popupHtml).not.toMatch(/(?:src|href)\s*=\s*["']?(?:https?:)?\/\//i);
    expect(popupHtml).not.toMatch(/@import|url\(/i);
  });
});

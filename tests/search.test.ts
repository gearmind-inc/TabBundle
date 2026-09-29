import { describe, expect, it } from "vitest";
import { PAGE_TEXT_MAX_CHARS } from "../src/constants";
import {
  collectPageTextEntries,
  hostFromOrigin,
  hostOrigins,
  normalizeHostList,
  pageTextHostOf,
  pageTextKey,
  pageTextMenuTitle,
  selectPageTextGarbage,
  selectPageTextKeysForHost,
  truncatePageText,
  type PageTextRecord,
} from "../src/core/pageText";
import {
  buildSearchIndex,
  collectBookmarks,
  normalizeForSearch,
  searchPages,
  splitSearchTerms,
  suggestDomains,
  type SearchBookmark,
} from "../src/core/search";

function bm(url: string, title: string, dateAdded: number): SearchBookmark {
  return { url, title, dateAdded };
}

function index(bookmarks: SearchBookmark[], texts: Record<string, string> = {}) {
  return buildSearchIndex(bookmarks, new Map(Object.entries(texts)));
}

describe("正規化と検索語", () => {
  it("大文字小文字と全角半角のゆれを吸収する (NFKC + 小文字化)", () => {
    expect(normalizeForSearch("ＧｉｔＨｕｂ")).toBe("github");
    expect(normalizeForSearch("ｶﾀｶﾅ ＡＢＣ１２３")).toBe("カタカナ abc123");
  });

  it("空白 (全角空白も) で区切り、空の語は捨てる", () => {
    expect(splitSearchTerms("  Foo　ＢＡＲ\tbaz  ")).toEqual(["foo", "bar", "baz"]);
    expect(splitSearchTerms("　 ")).toEqual([]);
  });
});

describe("searchPages", () => {
  const pages = index(
    [
      bm("https://github.com/owner/repo", "Repo の README", 10),
      bm("https://example.com/doc", "ドキュメント", 20),
      bm("https://example.com/カタカナ", "", 30),
    ],
    { "https://example.com/doc": "Vite と Rolldown の本文" },
  );

  it("タイトル・URL・本文の部分一致で、全角・大文字の検索語でも当たる", () => {
    expect(searchPages(pages, "ＲＥＡＤＭＥ").map((r) => r.url)).toEqual(["https://github.com/owner/repo"]);
    expect(searchPages(pages, "OWNER/REPO").map((r) => r.url)).toEqual(["https://github.com/owner/repo"]);
    expect(searchPages(pages, "rolldown").map((r) => r.url)).toEqual(["https://example.com/doc"]);
    expect(searchPages(pages, "ｶﾀｶﾅ").map((r) => r.url)).toEqual(["https://example.com/カタカナ"]);
  });

  it("複数語は AND で、語ごとにタイトル / URL / 本文のどれに含まれてもよい", () => {
    expect(searchPages(pages, "ドキュメント　vite example").map((r) => r.url)).toEqual(["https://example.com/doc"]);
    expect(searchPages(pages, "ドキュメント github")).toEqual([]);
  });

  it("検索語が空なら結果を出さない", () => {
    expect(searchPages(pages, "")).toEqual([]);
    expect(searchPages(pages, "　 ")).toEqual([]);
  });

  it("本文が無いページも、タイトルと URL で当たる", () => {
    expect(searchPages(pages, "repo").map((r) => r.title)).toEqual(["Repo の README"]);
  });
});

describe("ページ単位のまとめ", () => {
  it("URL が完全一致の物だけ 1 行にまとめ、# が違う / 末尾のパスが違うと別の行", () => {
    const pages = index([
      bm("https://a.example/page", "1 回目", 100),
      bm("https://a.example/page", "2 回目", 300),
      bm("https://a.example/page#section", "アンカー付き", 200),
      bm("https://a.example/page/sub", "下のページ", 50),
      bm("https://a.example/page/", "末尾スラッシュ", 40),
    ]);
    const results = searchPages(pages, "a.example");
    expect(results.map((r) => r.url)).toEqual([
      "https://a.example/page",
      "https://a.example/page#section",
      "https://a.example/page/sub",
      "https://a.example/page/",
    ]);
    expect(results[0]).toEqual({ url: "https://a.example/page", title: "2 回目", lastSavedAt: 300 });
  });

  it("タイトルは一番新しい保存の物 (空なら URL)。古いタイトルでも検索には当たる", () => {
    const pages = index([
      bm("https://b.example/", "古いタイトル", 1),
      bm("https://b.example/", "", 2),
    ]);
    expect(searchPages(pages, "古いタイトル")).toEqual([{ url: "https://b.example/", title: "https://b.example/", lastSavedAt: 2 }]);
  });

  it("並びは、その URL を最後に保存した日時の新しい順", () => {
    const pages = index([
      bm("https://x.example/old", "x", 10),
      bm("https://x.example/new", "x", 30),
      bm("https://x.example/mid", "x", 20),
      bm("https://x.example/old", "x", 5),
    ]);
    expect(searchPages(pages, "x").map((r) => [r.url, r.lastSavedAt])).toEqual([
      ["https://x.example/new", 30],
      ["https://x.example/mid", 20],
      ["https://x.example/old", 10],
    ]);
  });

  it("collectBookmarks はツリーの下の全ブックマークを集め、フォルダ自身は入れない", () => {
    const tree = [
      {
        title: "TabBundle",
        children: [
          { title: "手動保存", children: [{ title: "M", url: "https://m.example/", dateAdded: 1 }] },
          {
            title: "old",
            children: [{ title: "自動バックアップ", children: [{ title: "f", children: [{ title: "O", url: "https://o.example/" }] }] }],
          },
        ],
      },
    ];
    expect(collectBookmarks(tree).sort((a, b) => a.url.localeCompare(b.url))).toEqual([
      { url: "https://m.example/", title: "M", dateAdded: 1 },
      { url: "https://o.example/", title: "O", dateAdded: 0 },
    ]);
  });
});

describe("suggestDomains", () => {
  const pages = index([
    bm("https://github.com/a", "a", 1),
    bm("https://github.com/a", "a again", 2),
    bm("https://github.com/b", "b", 3),
    bm("https://github.com/c#x", "c", 4),
    bm("https://gist.github.com/1", "g", 5),
    bm("https://example.com/", "e", 6),
    bm("chrome://settings/", "設定", 7),
  ]);

  it("最後の語をホスト名に含むドメインを、件数 (ユニーク URL 数) 付きで多い順に出す", () => {
    expect(suggestDomains(pages, "rust GitH")).toEqual([
      { host: "github.com", count: 3 },
      { host: "gist.github.com", count: 1 },
    ]);
    expect(suggestDomains(pages, "ＥＸＡＭ")).toEqual([{ host: "example.com", count: 1 }]);
  });

  it("入力が空・最後が空白・当たるホストが無いときは出さない。http(s) 以外は候補にしない", () => {
    expect(suggestDomains(pages, "")).toEqual([]);
    expect(suggestDomains(pages, "github ")).toEqual([]);
    expect(suggestDomains(pages, "github　")).toEqual([]);
    expect(suggestDomains(pages, "settings")).toEqual([]);
  });

  it("limit 件まで", () => {
    expect(suggestDomains(pages, "com", 1)).toEqual([{ host: "github.com", count: 3 }]);
  });
});

describe("本文のための純粋関数", () => {
  it("ホスト名は http / https だけ、ホスト名の完全一致の単位", () => {
    expect(pageTextHostOf("https://github.com/a?b#c")).toBe("github.com");
    expect(pageTextHostOf("http://gist.github.com/")).toBe("gist.github.com");
    expect(pageTextHostOf("http://localhost:8080/x")).toBe("localhost");
    expect(pageTextHostOf("chrome://settings/")).toBeUndefined();
    expect(pageTextHostOf("chrome-extension://abc/popup.html")).toBeUndefined();
    expect(pageTextHostOf("file:///tmp/a.html")).toBeUndefined();
    expect(pageTextHostOf("not a url")).toBeUndefined();
    expect(pageTextHostOf(undefined)).toBeUndefined();
  });

  it("origins と、origin からのホスト名", () => {
    expect(hostOrigins("github.com")).toEqual(["https://github.com/*", "http://github.com/*"]);
    expect(hostFromOrigin("https://github.com/*")).toBe("github.com");
    expect(hostFromOrigin("http://gist.github.com/*")).toBe("gist.github.com");
    expect(hostFromOrigin("https://*/*")).toBeUndefined();
    expect(hostFromOrigin("<all_urls>")).toBeUndefined();
  });

  it(`本文は先頭 ${PAGE_TEXT_MAX_CHARS} 文字で切り、サロゲートペアを半分にしない`, () => {
    expect(truncatePageText("a".repeat(PAGE_TEXT_MAX_CHARS + 5))).toHaveLength(PAGE_TEXT_MAX_CHARS);
    expect(truncatePageText("abc")).toBe("abc");
    expect(truncatePageText("ab😀", 3)).toBe("ab");
  });

  it("ON の一覧は文字列だけ・重複なし", () => {
    expect(normalizeHostList(["a.example", 1, "a.example", "", "b.example"])).toEqual(["a.example", "b.example"]);
    expect(normalizeHostList("a.example")).toEqual([]);
  });

  it("メニューの文字に今のサイト名が入る", () => {
    expect(pageTextMenuTitle("github.com")).toBe("このサイト (github.com) の本文を保存する");
    expect(pageTextMenuTitle(undefined)).toBe("このサイトの本文を保存する");
  });

  describe("片付けで消すキー", () => {
    const rec = (url: string, host: string): PageTextRecord => ({ url, host, text: "t", capturedAt: 1 });
    const items = {
      shadow: { sessionId: "s", windows: {} },
      [pageTextKey("https://a.example/kept")]: rec("https://a.example/kept", "a.example"),
      [pageTextKey("https://a.example/gone")]: rec("https://a.example/gone", "a.example"),
      [pageTextKey("https://off.example/")]: rec("https://off.example/", "off.example"),
      [pageTextKey("https://a.example/broken")]: { url: "https://a.example/broken" },
      [pageTextKey("https://a.example/mismatch")]: rec("https://a.example/other", "a.example"),
    };

    it("どこにも無い URL・ON に無いホスト・壊れた物を消し、本文以外のキーには触らない", () => {
      const keep = new Set(["https://a.example/kept", "https://off.example/", "https://a.example/other"]);
      expect(selectPageTextGarbage(items, keep, new Set(["a.example"])).sort()).toEqual(
        [
          pageTextKey("https://a.example/broken"),
          pageTextKey("https://a.example/gone"),
          pageTextKey("https://a.example/mismatch"),
          pageTextKey("https://off.example/"),
        ].sort(),
      );
    });

    it("ホストの本文のキーを全部選ぶ (他のホストは選ばない)", () => {
      expect(selectPageTextKeysForHost(items, "off.example")).toEqual([pageTextKey("https://off.example/")]);
      expect(collectPageTextEntries(items)).toHaveLength(5);
    });
  });
});

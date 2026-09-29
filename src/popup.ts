import { loadPageTexts } from "./chrome/pageTextStore";
import { loadTabBundleBookmarks } from "./chrome/tabBundleBookmarks";
import { formatLocalDateTime } from "./core/folderName";
import { buildSearchIndex, searchPages, suggestDomains, type SearchablePage } from "./core/search";

// ポップアップの画面 (薄い DOM の部分だけ。検索・まとめ・候補は core/search.ts)。
// 文字は全部 textContent で入れる (ブックマークのタイトルを HTML として扱わない)。

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`#${id} が見つかりません`);
  return element as T;
}

const form = requireElement<HTMLFormElement>("search-form");
const input = requireElement<HTMLInputElement>("query");
const suggestionList = requireElement<HTMLUListElement>("suggestions");
const statusLine = requireElement<HTMLParagraphElement>("status");
const resultList = requireElement<HTMLUListElement>("results");

/** 開いたときに 1 回だけ作る (undefined = TabBundle フォルダがまだ無い) */
let indexPromise: Promise<SearchablePage[] | undefined> | undefined;

async function loadIndex(): Promise<SearchablePage[] | undefined> {
  const [bookmarks, texts] = await Promise.all([loadTabBundleBookmarks(), loadPageTexts()]);
  if (bookmarks === undefined) return undefined;
  return buildSearchIndex(bookmarks, texts);
}

function getIndex(): Promise<SearchablePage[] | undefined> {
  indexPromise ??= loadIndex();
  return indexPromise;
}

function setStatus(text: string): void {
  statusLine.textContent = text;
}

function renderSuggestions(index: readonly SearchablePage[]): void {
  suggestionList.replaceChildren(
    ...suggestDomains(index, input.value).map(({ host, count }) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = `${host} (${count} 件)`;
      button.addEventListener("click", () => {
        input.value = host;
        void runSearch();
      });
      item.append(button);
      return item;
    }),
  );
}

async function runSearch(): Promise<void> {
  suggestionList.replaceChildren();
  const index = await getIndex();
  if (index === undefined || index.length === 0) {
    resultList.replaceChildren();
    setStatus("まだ保存がありません");
    return;
  }
  const results = searchPages(index, input.value);
  setStatus(input.value.trim() === "" ? "" : `${results.length} 件`);
  resultList.replaceChildren(
    ...results.map((result) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.title = result.url;
      const title = document.createElement("span");
      title.className = "title";
      title.textContent = result.title;
      const url = document.createElement("span");
      url.className = "url";
      url.textContent = result.url;
      const date = document.createElement("span");
      date.className = "date";
      date.textContent = `最後の保存: ${formatLocalDateTime(result.lastSavedAt)}`;
      button.append(title, url, date);
      button.addEventListener("click", () => {
        void chrome.tabs.create({ url: result.url });
      });
      item.append(button);
      return item;
    }),
  );
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  void runSearch().catch(showError);
});

input.addEventListener("input", () => {
  void getIndex()
    .then((index) => {
      if (index) renderSuggestions(index);
    })
    .catch(showError);
});

function showError(error: unknown): void {
  console.error("TabBundle:", error);
  setStatus("読み込みに失敗しました");
}

// 開いた時点で読み込みを始めておく (最初の検索を待たせないため)
void getIndex()
  .then((index) => {
    if (index === undefined || index.length === 0) setStatus("まだ保存がありません");
  })
  .catch(showError);

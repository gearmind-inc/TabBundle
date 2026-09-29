import { pageTextHostOf } from "./pageText";

/** 検索に使うブックマーク 1 件 (BookmarkTreeNode の一部。chrome の型に依存しないため) */
export interface SearchBookmark {
  url: string;
  title: string;
  dateAdded: number;
}

/** 検索の対象になる 1 ページ (URL が完全一致するブックマークを 1 つにまとめた物) */
export interface SearchablePage {
  url: string;
  /** 一番新しい (dateAdded が最大の) ブックマークのタイトル。空なら URL */
  title: string;
  /** その URL を最後に保存した日時 (dateAdded の最大) */
  lastSavedAt: number;
  /** http / https のホスト名 (それ以外の URL は undefined) */
  host: string | undefined;
  /** 正規化したタイトル群・URL・本文を改行でつないだ物 (照合用) */
  haystack: string;
}

/** 結果一覧の 1 行 */
export interface SearchResult {
  url: string;
  title: string;
  lastSavedAt: number;
}

/** 入力中の候補 (ドメイン) */
export interface DomainSuggestion {
  host: string;
  /** そのホストの結果行の数 (ユニーク URL 数) */
  count: number;
}

/** ブックマークのツリー (getSubTree の結果) の一部 */
export interface BookmarkTreeLike {
  url?: string;
  title: string;
  dateAdded?: number;
  children?: readonly BookmarkTreeLike[];
}

/** 大文字小文字と全角半角のゆれを吸収する (NFKC 正規化 + 小文字化) */
export function normalizeForSearch(text: string): string {
  return text.normalize("NFKC").toLowerCase();
}

/** 検索語を空白 (全角空白も) で区切り、正規化した語の一覧にする (空の語は捨てる) */
export function splitSearchTerms(query: string): string[] {
  return normalizeForSearch(query)
    .split(/\s+/u)
    .filter((term) => term !== "");
}

/** ツリーの下にある全ブックマーク (url を持つ物) を集める。フォルダ自身は入れない */
export function collectBookmarks(nodes: readonly BookmarkTreeLike[]): SearchBookmark[] {
  const result: SearchBookmark[] = [];
  const stack = [...nodes];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.url !== undefined) result.push({ url: node.url, title: node.title, dateAdded: node.dateAdded ?? 0 });
    if (node.children) stack.push(...node.children);
  }
  return result;
}

/**
 * ブックマークと本文から検索の対象を作る。URL が完全一致 (文字列として同一) の物だけ 1 つにまとめる。
 * 並びは最後に保存した日時の新しい順 (同じなら URL の順)。
 * 正規化は重いので、ポップアップを開いたときに 1 回だけ作る。
 */
export function buildSearchIndex(
  bookmarks: readonly SearchBookmark[],
  texts: ReadonlyMap<string, string>,
): SearchablePage[] {
  const groups = new Map<string, { latest: SearchBookmark; titles: Set<string> }>();
  for (const bookmark of bookmarks) {
    const group = groups.get(bookmark.url);
    if (!group) {
      groups.set(bookmark.url, { latest: bookmark, titles: new Set([bookmark.title]) });
      continue;
    }
    group.titles.add(bookmark.title);
    if (bookmark.dateAdded > group.latest.dateAdded) group.latest = bookmark;
  }

  const pages: SearchablePage[] = [];
  for (const [url, { latest, titles }] of groups) {
    const titleText = normalizeForSearch([...titles].filter((title) => title !== "").join("\n"));
    const haystack = `${titleText}\n${normalizeForSearch(url)}\n${normalizeForSearch(texts.get(url) ?? "")}`;
    pages.push({
      url,
      title: latest.title === "" ? url : latest.title,
      lastSavedAt: latest.dateAdded,
      host: pageTextHostOf(url),
      haystack,
    });
  }
  return pages.sort((a, b) => b.lastSavedAt - a.lastSavedAt || (a.url < b.url ? -1 : a.url > b.url ? 1 : 0));
}

/**
 * 検索する。空白で区切った語は AND (各語がタイトル群 / URL / 本文のどれかに含まれればよい)。
 * 検索語が空なら結果は出さない。並びは buildSearchIndex の順 (最後に保存した日時の新しい順)。
 */
export function searchPages(index: readonly SearchablePage[], query: string): SearchResult[] {
  const terms = splitSearchTerms(query);
  if (terms.length === 0) return [];
  const results: SearchResult[] = [];
  for (const page of index) {
    if (terms.every((term) => page.haystack.includes(term))) {
      results.push({ url: page.url, title: page.title, lastSavedAt: page.lastSavedAt });
    }
  }
  return results;
}

/**
 * 入力中の候補 (ドメインだけ)。入力中の最後の語 (正規化後) をホスト名に含むドメインを、
 * 件数 (そのホストのユニーク URL 数) の多い順 (同じならホスト名の順) に limit 件まで返す。
 * 入力が空、または最後が空白 (語を打ち終えた) なら出さない。
 */
export function suggestDomains(index: readonly SearchablePage[], input: string, limit = 8): DomainSuggestion[] {
  if (input === "" || /\s$/u.test(normalizeForSearch(input))) return [];
  const last = splitSearchTerms(input).at(-1);
  if (last === undefined) return [];

  const counts = new Map<string, number>();
  for (const page of index) {
    if (page.host === undefined) continue;
    counts.set(page.host, (counts.get(page.host) ?? 0) + 1);
  }
  return [...counts]
    .filter(([host]) => normalizeForSearch(host).includes(last))
    .map(([host, count]) => ({ host, count }))
    .sort((a, b) => b.count - a.count || (a.host < b.host ? -1 : a.host > b.host ? 1 : 0))
    .slice(0, limit);
}

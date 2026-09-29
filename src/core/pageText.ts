import { PAGE_TEXT_KEY_PREFIX, PAGE_TEXT_MAX_CHARS } from "../constants";

/** chrome.storage.local の "pageText:<url>" に入る 1 ページ分の本文 */
export interface PageTextRecord {
  url: string;
  /** new URL(url).hostname */
  host: string;
  /** 本文 (先頭 PAGE_TEXT_MAX_CHARS 文字まで) */
  text: string;
  /** 取った時刻 (ms) */
  capturedAt: number;
}

/**
 * 本文の ON/OFF の単位になるホスト名。http / https の URL だけ (それ以外や壊れた URL は undefined)。
 * ホスト名の完全一致で扱う (github.com と gist.github.com は別)。
 */
export function pageTextHostOf(url: string | undefined): string | undefined {
  if (url === undefined || url === "") return undefined;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
  return parsed.hostname === "" ? undefined : parsed.hostname;
}

/** ホストの権限として permissions.request / remove に渡す origins */
export function hostOrigins(host: string): string[] {
  return [`https://${host}/*`, `http://${host}/*`];
}

/** 権限の origin ("https://example.com/*" など) からホスト名を取り出す (取り出せなければ undefined) */
export function hostFromOrigin(origin: string): string | undefined {
  const match = /^(?:https?|\*):\/\/([^/]+)\/.*$/.exec(origin);
  const host = match?.[1];
  if (host === undefined || host.includes("*")) return undefined;
  return host;
}

/** 本文を置く storage.local のキー */
export function pageTextKey(url: string): string {
  return `${PAGE_TEXT_KEY_PREFIX}${url}`;
}

/** 本文を先頭 PAGE_TEXT_MAX_CHARS 文字で切る (末尾でサロゲートペアを半分にしない) */
export function truncatePageText(text: string, maxChars = PAGE_TEXT_MAX_CHARS): string {
  if (text.length <= maxChars) return text;
  let cut = text.slice(0, maxChars);
  const last = cut.charCodeAt(cut.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1);
  return cut;
}

/** storage.local の値から ON のホスト名の一覧を取り出す (文字列だけ、重複なし) */
export function normalizeHostList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string" && item !== ""))];
}

/** storage.local の値が本文の形か */
export function isPageTextRecord(value: unknown): value is PageTextRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.url === "string" &&
    typeof record.host === "string" &&
    typeof record.text === "string" &&
    typeof record.capturedAt === "number"
  );
}

/** storage.local.get(null) の結果から、本文のキーと中身を集める (形の壊れた物も key だけは返す) */
export function collectPageTextEntries(items: Readonly<Record<string, unknown>>): { key: string; record?: PageTextRecord }[] {
  const entries: { key: string; record?: PageTextRecord }[] = [];
  for (const [key, value] of Object.entries(items)) {
    if (!key.startsWith(PAGE_TEXT_KEY_PREFIX)) continue;
    entries.push(isPageTextRecord(value) ? { key, record: value } : { key });
  }
  return entries;
}

/**
 * 片付け (GC) で消す本文のキー。次のどれかに当たる物を消す。
 * - 形が壊れている、またはキーと url が合わない
 * - ホストが ON の一覧に無い
 * - url が「TabBundle/ 配下のブックマーク」「今開いているタブ」「控えのタブ」のどれにも無い
 */
export function selectPageTextGarbage(
  items: Readonly<Record<string, unknown>>,
  keepUrls: ReadonlySet<string>,
  onHosts: ReadonlySet<string>,
): string[] {
  return collectPageTextEntries(items)
    .filter(({ key, record }) => {
      if (!record || pageTextKey(record.url) !== key) return true;
      if (!onHosts.has(record.host)) return true;
      return !keepUrls.has(record.url);
    })
    .map(({ key }) => key);
}

/** ホストの本文のキー (OFF にしたときに全部消す) */
export function selectPageTextKeysForHost(items: Readonly<Record<string, unknown>>, host: string): string[] {
  return collectPageTextEntries(items)
    .filter(({ record }) => record?.host === host)
    .map(({ key }) => key);
}

/** 右クリックのメニューの文字 */
export function pageTextMenuTitle(host: string | undefined): string {
  return host === undefined ? "このサイトの本文を保存する" : `このサイト (${host}) の本文を保存する`;
}

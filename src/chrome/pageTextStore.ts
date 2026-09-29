import { PAGE_TEXT_HOSTS_STORAGE_KEY } from "../constants";
import { collectPageTextEntries, normalizeHostList, pageTextKey, type PageTextRecord } from "../core/pageText";

/** 本文を保存する (ON の) ホスト名の一覧。初期状態は空 (全ドメイン OFF) */
export async function loadPageTextHosts(): Promise<string[]> {
  const result = await chrome.storage.local.get(PAGE_TEXT_HOSTS_STORAGE_KEY);
  return normalizeHostList(result[PAGE_TEXT_HOSTS_STORAGE_KEY]);
}

export async function savePageTextHosts(hosts: readonly string[]): Promise<void> {
  await chrome.storage.local.set({ [PAGE_TEXT_HOSTS_STORAGE_KEY]: [...hosts] });
}

/** 1 ページ分の本文を URL ごとの別キーに書く (同じ URL は上書き) */
export async function savePageText(record: PageTextRecord): Promise<void> {
  await chrome.storage.local.set({ [pageTextKey(record.url)]: record });
}

/**
 * storage.local の全部 (getKeys は Chrome 130 以上なので使わず、get(null) で読む)。
 * 本文のキーを探すときに使う。
 */
export async function loadAllLocalItems(): Promise<Record<string, unknown>> {
  return chrome.storage.local.get(null);
}

/** 本文を全部読む (url → 本文)。ポップアップが使う */
export async function loadPageTexts(): Promise<Map<string, string>> {
  const texts = new Map<string, string>();
  for (const { record } of collectPageTextEntries(await loadAllLocalItems())) {
    if (record) texts.set(record.url, record.text);
  }
  return texts;
}

export async function removeLocalKeys(keys: readonly string[]): Promise<void> {
  if (keys.length === 0) return;
  await chrome.storage.local.remove([...keys]);
}

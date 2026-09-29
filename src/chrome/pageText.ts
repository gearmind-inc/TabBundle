import {
  PAGE_TEXT_BADGE_COLOR,
  PAGE_TEXT_BADGE_TEXT,
  PAGE_TEXT_MAX_CHARS,
  PAGE_TEXT_MENU_ID,
} from "../constants";
import {
  hostOrigins,
  pageTextHostOf,
  pageTextMenuTitle,
  selectPageTextGarbage,
  selectPageTextKeysForHost,
  truncatePageText,
  type PageTextRecord,
} from "../core/pageText";
import {
  loadAllLocalItems,
  loadPageTextHosts,
  removeLocalKeys,
  savePageText,
  savePageTextHosts,
} from "./pageTextStore";
import { loadShadow } from "./shadowStore";
import { loadTabBundleBookmarks } from "./tabBundleBookmarks";

/** タブの一部 (chrome.tabs.Tab のうち使う物だけ) */
export interface PageTab {
  id?: number;
  url?: string;
  active?: boolean;
  incognito?: boolean;
  discarded?: boolean;
}

function logError(message: string, error: unknown): void {
  console.error(`TabBundle: ${message}`, error);
}

// ---- バッジと右クリックのメニュー (読むだけ。serial queue には入れない) ----

/** タブのバッジを ON / 空 に明示的に設定し直す (ページ移動で消えるかは当てにしない) */
export async function refreshBadge(tab: PageTab, hosts: readonly string[]): Promise<void> {
  if (tab.id === undefined) return;
  const host = pageTextHostOf(tab.url);
  const on = host !== undefined && hosts.includes(host);
  try {
    if (on) await chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: PAGE_TEXT_BADGE_COLOR });
    await chrome.action.setBadgeText({ tabId: tab.id, text: on ? PAGE_TEXT_BADGE_TEXT : "" });
  } catch (error) {
    // 閉じたばかりのタブなど
    logError("バッジを設定できませんでした", error);
  }
}

/** 開いているタブ全部 (host を渡せばそのホストのタブだけ) のバッジを直す */
export async function refreshBadges(host?: string): Promise<void> {
  const hosts = await loadPageTextHosts();
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (host !== undefined && pageTextHostOf(tab.url) !== host) continue;
    await refreshBadge(tab, hosts);
  }
}

/** 右クリックのメニューの文字と checked を今のタブに合わせる。http / https 以外では押せなくする */
export async function refreshMenu(tab: PageTab | undefined, hosts: readonly string[]): Promise<void> {
  const host = pageTextHostOf(tab?.url);
  try {
    await chrome.contextMenus.update(PAGE_TEXT_MENU_ID, {
      title: pageTextMenuTitle(host),
      checked: host !== undefined && hosts.includes(host),
      enabled: host !== undefined,
    });
  } catch (error) {
    logError("メニューを更新できませんでした", error);
  }
}

/** 一番最近フォーカスしたウィンドウのアクティブなタブに、メニューを合わせる */
export async function refreshMenuForActiveTab(windowId?: number): Promise<void> {
  const query: chrome.tabs.QueryInfo =
    windowId === undefined ? { active: true, lastFocusedWindow: true } : { active: true, windowId };
  const [tab] = await chrome.tabs.query(query);
  await refreshMenu(tab, await loadPageTextHosts());
}

/** メニューを作り直す (同じ id の二重 create を避けるため removeAll → create) */
export async function setupPageTextMenu(): Promise<void> {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create(
    {
      id: PAGE_TEXT_MENU_ID,
      type: "checkbox",
      title: pageTextMenuTitle(undefined),
      contexts: ["action", "page"],
      checked: false,
      enabled: false,
    },
    () => {
      const error = chrome.runtime?.lastError;
      if (error) logError("メニューを作れませんでした", error);
    },
  );
}

// ---- 本文を取る ----

/** ページの中で動く関数 (外の変数を参照しない。executeScript がこの関数だけをページへ送る) */
function readPageBody(maxChars: number): { href: string; text: string } {
  return { href: location.href, text: (document.body?.innerText ?? "").slice(0, maxChars) };
}

/**
 * ON のホストのタブなら、本文を読んで保存用の形にする (まだ保存しない)。
 * 読まない / 読めないとき (OFF のホスト・シークレット・休止中・http(s) 以外・executeScript の失敗) は
 * undefined を返す。失敗は console.error だけで、外へ投げない。
 */
export async function readTabPageText(tab: PageTab, hosts: readonly string[]): Promise<PageTextRecord | undefined> {
  if (tab.id === undefined || tab.url === undefined || tab.incognito || tab.discarded) return undefined;
  const host = pageTextHostOf(tab.url);
  if (host === undefined || !hosts.includes(host)) return undefined;
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: readPageBody,
      args: [PAGE_TEXT_MAX_CHARS],
    });
    const result = injection?.result;
    if (!result || typeof result.text !== "string") return undefined;
    // 読むまでの間に別のページへ移っていたら、その本文は違う URL の物なので使わない。
    // 本文は URL の完全一致 (# 以降も含む) で保存するので、比べるのも完全一致
    if (result.href !== tab.url) return undefined;
    return { url: tab.url, host, text: truncatePageText(result.text), capturedAt: Date.now() };
  } catch (error) {
    logError("本文を取れませんでした", error);
    return undefined;
  }
}

// ---- 保存・削除・片付け (serial queue の中から呼ぶ) ----

/**
 * 取った本文を、そのホストがまだ ON で、かつタブがまだ同じ URL を開いているときだけ保存する。
 * 読む間に OFF にされた / 別のページへ移った / タブが閉じられたなら捨てる
 * (別のページへ移った後に aging と片付けが終わってから、古い URL の本文が書かれるのを防ぐため)。
 */
export async function savePageTextIfCurrent(record: PageTextRecord, tabId: number): Promise<void> {
  const hosts = await loadPageTextHosts();
  if (!hosts.includes(record.host)) return;
  let current: chrome.tabs.Tab;
  try {
    current = await chrome.tabs.get(tabId);
  } catch {
    return;
  }
  if (current.url !== record.url) return;
  await savePageText(record);
}

/** ホストを ON の一覧に足す */
export async function enablePageTextHost(host: string): Promise<void> {
  const hosts = await loadPageTextHosts();
  if (hosts.includes(host)) return;
  await savePageTextHosts([...hosts, host]);
}

/**
 * ホストを OFF にする: ON の一覧から外し、そのホストの本文を全部消し、片付けも走らせる。
 * removePermission なら最後に同じ origins の権限も外す (permissions.onRemoved から来たときは外さない)。
 */
export async function disablePageTextHost(host: string, options: { removePermission: boolean }): Promise<void> {
  const hosts = await loadPageTextHosts();
  if (hosts.includes(host)) await savePageTextHosts(hosts.filter((item) => item !== host));
  await removeLocalKeys(selectPageTextKeysForHost(await loadAllLocalItems(), host));
  await collectPageTextGarbage();
  if (options.removePermission) {
    try {
      await chrome.permissions.remove({ origins: hostOrigins(host) });
    } catch (error) {
      logError("権限を外せませんでした", error);
    }
  }
}

/** ON の一覧のうち、権限が無くなっているホストを OFF にする (拡張機能が動いていない間に外された分) */
export async function reconcilePageTextHosts(): Promise<void> {
  for (const host of await loadPageTextHosts()) {
    let granted: boolean;
    try {
      granted = await chrome.permissions.contains({ origins: hostOrigins(host) });
    } catch (error) {
      logError("権限を確かめられませんでした", error);
      continue;
    }
    if (!granted) await disablePageTextHost(host, { removePermission: false });
  }
}

/**
 * 本文の片付け (GC)。URL が「TabBundle/ 配下のどのブックマークにも無い」かつ「今開いているタブに無い」
 * かつ「控えのまだ書いていない (saved === false) ウィンドウのタブに無い」本文と、ON の一覧に無いホストの本文を消す。
 * 控えを見るのは、ウィンドウを閉じた直後でまだ自動バックアップを書く前の本文を消さないため。
 * 書き終えた (saved === true) ウィンドウはブックマーク側にあるかで決める (控えだけを理由に残さない)。
 */
export async function collectPageTextGarbage(): Promise<void> {
  const keepUrls = new Set<string>();
  for (const bookmark of (await loadTabBundleBookmarks()) ?? []) keepUrls.add(bookmark.url);
  for (const tab of await chrome.tabs.query({})) {
    if (tab.url) keepUrls.add(tab.url);
  }
  const shadow = await loadShadow();
  for (const win of Object.values(shadow?.windows ?? {})) {
    if (win.saved) continue;
    for (const tab of win.tabs) keepUrls.add(tab.url);
  }
  const onHosts = new Set(await loadPageTextHosts());
  await removeLocalKeys(selectPageTextGarbage(await loadAllLocalItems(), keepUrls, onHosts));
}

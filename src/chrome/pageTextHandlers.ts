import { PAGE_TEXT_GC_DEBOUNCE_MS, PAGE_TEXT_GC_MAX_WAIT_MS, PAGE_TEXT_MENU_ID } from "../constants";
import { hostFromOrigin, hostOrigins, pageTextHostOf } from "../core/pageText";
import type { TabChangeInfoLike } from "../core/types";
import { debounce } from "./debounce";
import {
  collectPageTextGarbage,
  disablePageTextHost,
  enablePageTextHost,
  readTabPageText,
  refreshBadge,
  refreshBadges,
  refreshMenu,
  refreshMenuForActiveTab,
  savePageTextIfCurrent,
  setupPageTextMenu,
  type PageTab,
} from "./pageText";
import { loadPageTextHosts } from "./pageTextStore";

/** 右クリックのメニューが押されたときの情報の一部 */
export interface MenuClickInfoLike {
  menuItemId: string | number;
  checked?: boolean;
  pageUrl?: string;
}

/** 本文の保存 (ドメイン単位の ON/OFF) の入口 */
export interface PageTextHandlers {
  /** tabs.onUpdated: url が変わった / 読み込みが終わったらバッジ (とアクティブならメニュー) を直し、終わったら本文を取る */
  onPageTabUpdated(tabId: number, changeInfo: TabChangeInfoLike, tab: PageTab): Promise<void>;
  /** tabs.onActivated: そのタブにバッジとメニューを合わせる */
  onTabActivated(activeInfo: { tabId: number; windowId: number }): Promise<void>;
  /** windows.onFocusChanged: そのウィンドウのアクティブなタブにメニューを合わせる */
  onWindowFocusChanged(windowId: number): Promise<void>;
  /** contextMenus.onClicked: ON/OFF の切り替え。ON のときは最初に同期的に権限を求める */
  onMenuClicked(info: MenuClickInfoLike, tab: PageTab | undefined): Promise<void>;
  /** permissions.onRemoved: 外されたホストを OFF 扱いにする (本文も消す) */
  onPermissionsRemoved(permissions: { origins?: string[] }): Promise<void>;
  /** bookmarks.onRemoved: 少し待ってから本文の片付けを走らせる */
  onBookmarkRemoved(): void;
  /** bookmarks.onMoved: TabBundle の外へ移されたかもしれないので、onRemoved と同じく片付けを予約する */
  onBookmarkMoved(): void;
  /** onInstalled / onStartup: メニューを作り直し、今のタブにバッジとメニューを合わせる (queue には入れない) */
  setupUi(): Promise<void>;
}

type Run = (task: () => Promise<void>) => Promise<void>;

function logError(error: unknown): void {
  console.error("TabBundle:", error);
}

/** chrome.windows.WINDOW_ID_NONE (全ウィンドウがフォーカスを失った) */
const WINDOW_ID_NONE = -1;

/**
 * 本文の保存の入口を作る。run は background の serial queue (控えやブックマークの書き込みと同じ列)。
 * 本文の保存・削除・片付けは run に入れる。バッジとメニューは読むだけなので入れない。
 * 本文を読む (executeScript) のも入れない (ページの都合で待たされても、他の書き込みを止めないため)。
 */
export function createPageTextHandlers(run: Run): PageTextHandlers {
  const scheduleGc = debounce(
    () => {
      void run(collectPageTextGarbage);
    },
    { waitMs: PAGE_TEXT_GC_DEBOUNCE_MS, maxWaitMs: PAGE_TEXT_GC_MAX_WAIT_MS },
  );

  /** 本文を読んで (queue の外)、保存だけを queue に入れる */
  async function captureTab(tab: PageTab): Promise<void> {
    const record = await readTabPageText(tab, await loadPageTextHosts());
    const tabId = tab.id;
    if (record && tabId !== undefined) await run(() => savePageTextIfCurrent(record, tabId));
  }

  /** ON/OFF を切り替えた後: そのホストのタブ全部のバッジと、今のタブのメニューを直す */
  async function refreshAfterToggle(host: string): Promise<void> {
    await refreshBadges(host);
    await refreshMenuForActiveTab();
  }

  async function enable(host: string, tab: PageTab | undefined): Promise<void> {
    await run(() => enablePageTextHost(host));
    await refreshAfterToggle(host);
    if (tab?.id === undefined) return;
    // ON にした直後の今のタブの本文をすぐ取る
    let current: PageTab;
    try {
      current = await chrome.tabs.get(tab.id);
    } catch {
      return;
    }
    await captureTab(current);
  }

  /**
   * メニューは「最後にフォーカスしたウィンドウのアクティブなタブ」だけを基準にする。
   * tab がそのタブのときだけメニューを合わせる (他のウィンドウのタブの変化ではメニューを変えない)。
   */
  async function refreshMenuIfFocused(tab: PageTab, hosts: readonly string[]): Promise<void> {
    if (tab.id === undefined) return;
    const [focused] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (focused?.id !== tab.id) return;
    await refreshMenu(tab, hosts);
  }

  return {
    async onPageTabUpdated(_tabId, changeInfo, tab) {
      if (changeInfo.url === undefined && changeInfo.status !== "complete") return;
      const hosts = await loadPageTextHosts();
      await refreshBadge(tab, hosts);
      if (tab.active) await refreshMenuIfFocused(tab, hosts);
      if (changeInfo.status === "complete") await captureTab(tab);
    },

    async onTabActivated({ tabId }) {
      let tab: PageTab;
      try {
        tab = await chrome.tabs.get(tabId);
      } catch {
        return;
      }
      const hosts = await loadPageTextHosts();
      await refreshBadge(tab, hosts);
      await refreshMenuIfFocused(tab, hosts);
    },

    async onWindowFocusChanged(windowId) {
      if (windowId === WINDOW_ID_NONE) return;
      await refreshMenuForActiveTab(windowId);
    },

    onMenuClicked(info, tab) {
      if (info.menuItemId !== PAGE_TEXT_MENU_ID) return Promise.resolve();
      const host = pageTextHostOf(tab?.url ?? info.pageUrl);
      if (host === undefined) return Promise.resolve();

      if (info.checked !== true) {
        return run(() => disablePageTextHost(host, { removePermission: true })).then(() => refreshAfterToggle(host));
      }

      // ユーザー操作の中で呼ぶ必要があるので、await を 1 つも挟まずに最初に呼ぶ (queue にも入れない)
      let request: Promise<boolean>;
      try {
        request = chrome.permissions.request({ origins: hostOrigins(host) });
      } catch (error) {
        request = Promise.reject(error);
      }
      return request
        .catch((error: unknown) => {
          logError(error);
          return false;
        })
        .then(async (granted) => {
          if (granted) {
            await enable(host, tab);
            return;
          }
          // 拒否されたら ON にせず、メニューの checked を戻す
          await refreshMenu(tab, await loadPageTextHosts());
        })
        .catch(logError);
    },

    async onPermissionsRemoved(permissions) {
      const hosts = new Set<string>();
      for (const origin of permissions.origins ?? []) {
        const host = hostFromOrigin(origin);
        if (host !== undefined) hosts.add(host);
      }
      for (const host of hosts) {
        await run(() => disablePageTextHost(host, { removePermission: false }));
        await refreshAfterToggle(host);
      }
    },

    onBookmarkRemoved: scheduleGc,
    onBookmarkMoved: scheduleGc,

    async setupUi() {
      await setupPageTextMenu();
      await refreshBadges();
      await refreshMenuForActiveTab();
    },
  };
}

import { ensureAgingAlarm } from "./chrome/aging";
import { createBackgroundHandlers } from "./chrome/handlers";

// service worker は寝て起きるたびにこのファイルを実行し直す。
// リスナーはトップレベルで同期的に登録する (await の後に登録するとイベントを取りこぼす)。
const handlers = createBackgroundHandlers();

chrome.tabs.onCreated.addListener(() => handlers.onShadowTrigger());
chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => handlers.onTabUpdated(changeInfo));
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => handlers.onTabRemoved(tabId, removeInfo));
chrome.tabs.onMoved.addListener(() => handlers.onShadowTrigger());
chrome.tabs.onAttached.addListener(() => handlers.onShadowTrigger());
chrome.tabs.onDetached.addListener(() => handlers.onShadowTrigger());
chrome.tabs.onReplaced.addListener(() => handlers.onShadowTrigger());
chrome.windows.onCreated.addListener(() => handlers.onShadowTrigger());

chrome.windows.onRemoved.addListener((windowId) => {
  void handlers.onWindowRemoved(windowId);
});
chrome.runtime.onInstalled.addListener((details) => {
  void handlers.onInstalled(details);
});
chrome.runtime.onStartup.addListener(() => {
  void handlers.onStartup();
});
chrome.alarms.onAlarm.addListener((alarm) => {
  void handlers.onAlarm(alarm);
});

// 本文の保存 (ドメイン単位の ON/OFF)。バッジとメニューを今のタブに合わせ、ON のホストのページの本文を取る
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  void handlers.onPageTabUpdated(tabId, changeInfo, tab);
});
chrome.tabs.onActivated.addListener((activeInfo) => {
  void handlers.onTabActivated(activeInfo);
});
chrome.windows.onFocusChanged.addListener((windowId) => {
  void handlers.onWindowFocusChanged(windowId);
});
chrome.contextMenus.onClicked.addListener((info, tab) => {
  // permissions.request はユーザー操作の中で呼ぶ必要があるので、ここから同期的に呼ばれる
  void handlers.onMenuClicked(info, tab);
});
chrome.permissions.onRemoved.addListener((permissions) => {
  void handlers.onPermissionsRemoved(permissions);
});
chrome.bookmarks.onRemoved.addListener(() => handlers.onBookmarkRemoved());
chrome.bookmarks.onMoved.addListener(() => handlers.onBookmarkMoved());

// onInstalled / onStartup に加えて、service worker が起きるたびにも aging の alarm を「無ければ作る」
void ensureAgingAlarm().catch((error: unknown) => console.error("TabBundle:", error));

import type { Shadow, ShadowTab, ShadowWindow, TabLike } from "./types";

/** tabs.Tab を控えの 1 タブに変換する (url が空なら pendingUrl を使う) */
export function toShadowTab(tab: TabLike): ShadowTab {
  return {
    url: tab.url || tab.pendingUrl || "",
    title: tab.title ?? "",
    windowId: tab.windowId,
    index: tab.index,
    pinned: tab.pinned,
  };
}

/** 控えに入れてよいタブか (シークレットは念のため入れない) */
function isShadowable(tab: TabLike): boolean {
  return tab.incognito !== true;
}

/** windowId ごとにまとめ、各ウィンドウ内を index 順に並べる */
export function groupTabsByWindow(tabs: readonly TabLike[]): Map<string, ShadowTab[]> {
  const grouped = new Map<string, ShadowTab[]>();
  for (const tab of tabs) {
    if (!isShadowable(tab)) continue;
    const key = String(tab.windowId);
    const list = grouped.get(key) ?? [];
    list.push(toShadowTab(tab));
    grouped.set(key, list);
  }
  for (const list of grouped.values()) list.sort((a, b) => a.index - b.index);
  return grouped;
}

/**
 * 控えの作り直し。
 * - 今あるウィンドウ: tabs = 今のタブ、updatedAt = now、saved = 前の控えの saved (無ければ false)
 * - 前の控えにあって今無いウィンドウ: saved === false なら残す、saved === true なら落とす
 * 前の控えの sessionId が違う場合、前の控えのウィンドウは混ぜない (windowId が別物のため)。
 */
export function mergeShadow(
  prev: Shadow | undefined,
  currentTabs: readonly TabLike[],
  now: number,
  sessionId: string,
): Shadow {
  const prevWindows = prev && prev.sessionId === sessionId ? prev.windows : {};
  const windows: { [windowId: string]: ShadowWindow } = {};

  for (const [windowId, tabs] of groupTabsByWindow(currentTabs)) {
    windows[windowId] = { tabs, updatedAt: now, saved: prevWindows[windowId]?.saved ?? false };
  }
  for (const [windowId, win] of Object.entries(prevWindows)) {
    if (windowId in windows) continue;
    if (!win.saved) windows[windowId] = win;
  }
  return { sessionId, windows };
}

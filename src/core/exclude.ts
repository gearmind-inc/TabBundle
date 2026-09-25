import type { ShadowTab } from "./types";

const EXCLUDED_URL_PREFIXES = ["chrome-extension://", "chrome://newtab"] as const;

/** 保存しないタブか (pinned / 拡張機能のページ / 新しいタブ / URL が空) */
export function isExcludedTab(tab: Pick<ShadowTab, "url" | "pinned">): boolean {
  if (tab.pinned) return true;
  if (tab.url === "") return true;
  return EXCLUDED_URL_PREFIXES.some((prefix) => tab.url.startsWith(prefix));
}

/** 除外を適用し、タブの index 順に並べた保存対象を返す */
export function selectSavableTabs(tabs: readonly ShadowTab[]): ShadowTab[] {
  return tabs.filter((tab) => !isExcludedTab(tab)).sort((a, b) => a.index - b.index);
}

import {
  AGING_ALARM_NAME,
  AGING_ALARM_PERIOD_MINUTES,
  OLD_MOVED_AT_STORAGE_KEY,
} from "../constants";
import { normalizeOldMovedAt, planOldCleanup, selectAgingTargets } from "../core/aging";
import { ensureBookmarkLayout } from "./bookmarkLayout";

/**
 * 自動バックアップ/ のフォルダを 7 日後に old/ へ移し、old で 7 日経った物を削除する。
 */
export async function runAging(now: number): Promise<void> {
  const { autoId, oldAutoId } = await ensureBookmarkLayout();
  const stored = await chrome.storage.local.get(OLD_MOVED_AT_STORAGE_KEY);
  const records = normalizeOldMovedAt(stored[OLD_MOVED_AT_STORAGE_KEY]);

  const children = await chrome.bookmarks.getChildren(autoId);
  for (const target of selectAgingTargets(children, now)) {
    await chrome.bookmarks.move(target.id, { parentId: oldAutoId, index: 0 });
    records[target.id] = now;
  }

  const oldChildren = await chrome.bookmarks.getChildren(oldAutoId);
  const { toDelete, nextRecords } = planOldCleanup(oldChildren, records, now);
  const deleted = new Set<string>();
  for (const id of toDelete) {
    let node: chrome.bookmarks.BookmarkTreeNode | undefined;
    try {
      [node] = await chrome.bookmarks.get(id);
    } catch {
      // 既に無い、または取得できないフォルダは削除しない。
      continue;
    }
    if (node?.parentId !== oldAutoId || node.url !== undefined) continue;
    await chrome.bookmarks.removeTree(id);
    deleted.add(id);
  }

  const remainingChildren = await chrome.bookmarks.getChildren(oldAutoId);
  const finalRecords: Record<string, number> = {};
  for (const child of remainingChildren) {
    if (child.url !== undefined) continue;
    if (deleted.has(child.id)) continue;
    finalRecords[child.id] = nextRecords[child.id] ?? now;
  }
  await chrome.storage.local.set({ [OLD_MOVED_AT_STORAGE_KEY]: finalRecords });
}

/** aging の alarm が無ければ作る */
export async function ensureAgingAlarm(): Promise<void> {
  const existing = await chrome.alarms.get(AGING_ALARM_NAME);
  if (existing) return;
  await chrome.alarms.create(AGING_ALARM_NAME, { periodInMinutes: AGING_ALARM_PERIOD_MINUTES });
}

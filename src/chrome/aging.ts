import { AGING_ALARM_NAME, AGING_ALARM_PERIOD_MINUTES } from "../constants";
import { selectAgingTargets } from "../core/aging";
import { ensureBookmarkLayout } from "./bookmarkLayout";

/**
 * 自動バックアップ/ 直下の古いフォルダを、古い順に old/自動バックアップ/ の index 0 へ移す。
 * 削除は一切しない。
 */
export async function runAging(now: number): Promise<void> {
  const { autoId, oldAutoId } = await ensureBookmarkLayout();
  const children = await chrome.bookmarks.getChildren(autoId);
  for (const target of selectAgingTargets(children, now)) {
    await chrome.bookmarks.move(target.id, { parentId: oldAutoId, index: 0 });
  }
}

/** aging の alarm が無ければ作る */
export async function ensureAgingAlarm(): Promise<void> {
  const existing = await chrome.alarms.get(AGING_ALARM_NAME);
  if (existing) return;
  await chrome.alarms.create(AGING_ALARM_NAME, { periodInMinutes: AGING_ALARM_PERIOD_MINUTES });
}

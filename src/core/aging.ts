import { DELETE_FROM_OLD_DAYS, MOVE_TO_OLD_DAYS } from "../constants";
import type { BookmarkNodeLike } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;
export const AGING_THRESHOLD_MS = MOVE_TO_OLD_DAYS * DAY_MS;
const DELETE_THRESHOLD_MS = DELETE_FROM_OLD_DAYS * DAY_MS;

/** now - dateAdded が MOVE_TO_OLD_DAYS 日を超えたら true */
export function isAged(dateAdded: number, now: number): boolean {
  return now - dateAdded > AGING_THRESHOLD_MS;
}

/**
 * 自動バックアップ/ 直下の子から、old/ へ移すフォルダを dateAdded の古い順に返す。
 * url を持つ物 (ブックマーク) と dateAdded の無い物は対象外。
 */
export function selectAgingTargets<T extends BookmarkNodeLike>(children: readonly T[], now: number): T[] {
  return children
    .filter((node): node is T & { dateAdded: number } =>
      node.url === undefined && typeof node.dateAdded === "number" && isAged(node.dateAdded, now),
    )
    .sort((a, b) => a.dateAdded - b.dateAdded);
}

/** storage.local の値から有限な数値だけを残す */
export function normalizeOldMovedAt(value: unknown): Record<string, number> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, number] =>
      typeof entry[1] === "number" && Number.isFinite(entry[1]),
    ),
  );
}

/** old/自動バックアップ/ 直下を確認し、削除対象と次に保存する記録を決める */
export function planOldCleanup<T extends BookmarkNodeLike>(
  children: readonly T[],
  records: Readonly<Record<string, number>>,
  now: number,
): { toDelete: string[]; nextRecords: Record<string, number> } {
  const toDelete: string[] = [];
  const nextRecords: Record<string, number> = {};

  for (const child of children) {
    if (child.url !== undefined) continue;
    const movedAt = records[child.id];
    if (typeof movedAt !== "number" || !Number.isFinite(movedAt)) {
      nextRecords[child.id] = now;
    } else if (now - movedAt > DELETE_THRESHOLD_MS) {
      toDelete.push(child.id);
    } else {
      nextRecords[child.id] = movedAt;
    }
  }

  return { toDelete, nextRecords };
}

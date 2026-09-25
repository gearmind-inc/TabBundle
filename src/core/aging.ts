import { AGING_DAYS } from "../constants";
import type { BookmarkNodeLike } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;
export const AGING_THRESHOLD_MS = AGING_DAYS * DAY_MS;

/** now - dateAdded が AGING_DAYS 日を超えたら true */
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

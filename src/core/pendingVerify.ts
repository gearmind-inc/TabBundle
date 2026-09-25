import { AUTO_FOLDER_TITLE } from "../constants";
import type { PendingVerifyEntry, WrittenFolder, WrittenTab } from "./types";

/** 書いたフォルダから「確かめ待ち」の項目を作る */
export function toPendingVerifyEntry(folder: WrittenFolder, sessionId: string, createdAt: number): PendingVerifyEntry {
  return {
    folderId: folder.folderId,
    title: folder.title,
    parentTitle: AUTO_FOLDER_TITLE,
    tabs: folder.tabs.map((tab) => ({ url: tab.url, title: tab.title })),
    sessionId,
    createdAt,
  };
}

/** 今のセッションの項目と、前のセッションの項目に分ける (並び順は保つ) */
export function partitionPendingVerify(
  entries: readonly PendingVerifyEntry[],
  sessionId: string,
): { current: PendingVerifyEntry[]; previous: PendingVerifyEntry[] } {
  return {
    current: entries.filter((entry) => entry.sessionId === sessionId),
    previous: entries.filter((entry) => entry.sessionId !== sessionId),
  };
}

/**
 * 刈り取るか: 今のセッションの項目で、createdAt から graceMs 以上経ったもの
 * (Chrome が動き続けていれば、もうディスクに書かれているため)。前のセッションの項目は刈り取らない。
 */
export function isPendingVerifyExpired(entry: PendingVerifyEntry, sessionId: string, now: number, graceMs: number): boolean {
  return entry.sessionId === sessionId && now - entry.createdAt >= graceMs;
}

/** 刈り取った後に残す項目 (並び順は保つ) */
export function prunePendingVerify(
  entries: readonly PendingVerifyEntry[],
  sessionId: string,
  now: number,
  graceMs: number,
): PendingVerifyEntry[] {
  return entries.filter((entry) => !isPendingVerifyExpired(entry, sessionId, now, graceMs));
}

/**
 * フォルダの中身が書いた中身と一致するか: 子の数が同じで、各子の url がタブの url と順番どおり一致する。
 * childUrls はフォルダの子の url を並び順で並べたもの (子フォルダなど url の無い子は undefined)。
 */
export function folderContentMatches(childUrls: readonly (string | undefined)[], tabs: readonly WrittenTab[]): boolean {
  return childUrls.length === tabs.length && childUrls.every((url, index) => url === tabs[index]!.url);
}

/**
 * 確かめで「一致した」前のセッションの項目をどうするか。
 * 書いてから graceMs 未満なら (拡張機能の再読み込み直後など、まだディスクに書かれていないかもしれない)
 * createdAt はそのままで今のセッションに付け替えて残す (普通の刈り取りの規則で消える)。graceMs 以上なら消す (undefined)。
 */
export function carryOverVerifiedEntry(
  entry: PendingVerifyEntry,
  sessionId: string,
  now: number,
  graceMs: number,
): PendingVerifyEntry | undefined {
  return now - entry.createdAt < graceMs ? { ...entry, sessionId } : undefined;
}

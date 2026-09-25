import { SESSION_STORAGE_KEY, VERIFY_GRACE_MS } from "../constants";
import {
  carryOverVerifiedEntry,
  folderContentMatches,
  partitionPendingVerify,
  prunePendingVerify,
  toPendingVerifyEntry,
} from "../core/pendingVerify";
import { mergeShadow } from "../core/shadow";
import type { PendingVerifyEntry, Shadow } from "../core/types";
import {
  loadPendingVerify,
  loadShadow,
  queryCurrentTabs,
  savePendingVerify,
  saveShadowAndPendingVerify,
} from "./shadowStore";
import { writeAutoBackupFolder, writeWindowBackup } from "./windowWriter";

async function readSessionId(): Promise<string | undefined> {
  const result = await chrome.storage.session.get(SESSION_STORAGE_KEY);
  const value = result[SESSION_STORAGE_KEY];
  return typeof value === "string" ? value : undefined;
}

/**
 * フォルダが書いたとおりに残っているか: フォルダがあり、子の数と各子の url がタブと順番どおり一致する
 * (bookmarks.get / getChildren は無い id で例外を投げる → 残っていない)。
 */
async function folderIntact(entry: PendingVerifyEntry): Promise<boolean> {
  try {
    await chrome.bookmarks.get(entry.folderId);
    const children = await chrome.bookmarks.getChildren(entry.folderId);
    return folderContentMatches(
      children.map((child) => child.url),
      entry.tabs,
    );
  } catch {
    return false;
  }
}

/**
 * 確かめ: 前のセッションで書いたフォルダが本当に残っているかを見る。
 * - 一致 → 書いてから VERIFY_GRACE_MS 未満なら今のセッションに付け替えて残す (拡張機能の再読み込み直後は
 *   まだディスクに書かれていないかもしれないため)。それ以上なら項目を消す
 * - 不一致 (フォルダが無い・中身が欠けている・順番が違う) → 元のフォルダには触らず、同じ title と tabs で
 *   書き直し、今のセッションの項目として入れ直す (二重に残るのは許容)
 */
async function verifyPreviousWrites(sessionId: string): Promise<void> {
  const entries = await loadPendingVerify();
  const { current, previous } = partitionPendingVerify(entries, sessionId);
  if (previous.length === 0) return;

  const carried: PendingVerifyEntry[] = [];
  for (const entry of previous) {
    if (await folderIntact(entry)) {
      const kept = carryOverVerifiedEntry(entry, sessionId, Date.now(), VERIFY_GRACE_MS);
      if (kept) carried.push(kept);
      continue;
    }
    const folderId = await writeAutoBackupFolder(entry.title, entry.tabs);
    carried.push(toPendingVerifyEntry({ folderId, title: entry.title, tabs: entry.tabs }, sessionId, Date.now()));
  }
  await savePendingVerify([...current, ...carried]);
}

/**
 * 回収: 前回の Chrome の控えのうち、まだ書いていないウィンドウを (再起動前) 付きで書く。
 * 書いたウィンドウが全部 pendingVerify に入るのと同じ 1 回の set で、控えを今の全ウィンドウだけで作り直す
 * (回収分の中身は pendingVerify が持つので、前の控えを捨てても失わない)。
 */
async function recoverPreviousSession(previous: Shadow, sessionId: string): Promise<void> {
  const unsaved = Object.entries(previous.windows)
    .filter(([, win]) => !win.saved)
    .sort(([idA, a], [idB, b]) => a.updatedAt - b.updatedAt || Number(idA) - Number(idB));

  const recovered: PendingVerifyEntry[] = [];
  for (const [, win] of unsaved) {
    const written = await writeWindowBackup(win.tabs, { timeMs: win.updatedAt, beforeRestart: true });
    if (written) recovered.push(toPendingVerifyEntry(written, sessionId, Date.now()));
  }

  const tabs = await queryCurrentTabs();
  const pending = await loadPendingVerify();
  await saveShadowAndPendingVerify(mergeShadow(undefined, tabs, Date.now(), sessionId), [...pending, ...recovered]);
}

/** 刈り取り: 今のセッションで VERIFY_GRACE_MS 以上経った確かめ待ちを消す */
async function prunePendingVerifyNow(sessionId: string): Promise<void> {
  const entries = await loadPendingVerify();
  const kept = prunePendingVerify(entries, sessionId, Date.now(), VERIFY_GRACE_MS);
  if (kept.length !== entries.length) await savePendingVerify(kept);
}

/**
 * セッション確認。どの入口も最初に呼ぶ。今のセッション ID を返す。
 * storage.session が空なら (Chrome の起動、拡張機能の更新・再読み込み・無効→有効) 新しいセッションにする。
 * 控えが前のセッションのもの (sessionId が違う) なら、確かめ → 回収 の順に行い、控えを今の全ウィンドウだけで作り直す。
 * 回収の途中で止まっても控えは書き換わらないので、次の入口でやり直される (二重はあっても消えない)。
 * 最後に、確かめ待ちの刈り取りをする。
 */
export async function ensureSession(): Promise<string> {
  const shadow = await loadShadow();
  let sessionId = await readSessionId();
  if (sessionId === undefined) {
    sessionId = crypto.randomUUID();
    await chrome.storage.session.set({ [SESSION_STORAGE_KEY]: sessionId });
  }

  if (shadow && shadow.sessionId !== sessionId) {
    await verifyPreviousWrites(sessionId);
    await recoverPreviousSession(shadow, sessionId);
  }
  await prunePendingVerifyNow(sessionId);
  return sessionId;
}

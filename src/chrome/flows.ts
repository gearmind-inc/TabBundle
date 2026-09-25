import { toPendingVerifyEntry } from "../core/pendingVerify";
import { mergeShadow } from "../core/shadow";
import { ensureSession } from "./session";
import { loadPendingVerify, loadShadow, queryCurrentTabs, saveShadow, saveShadowAndPendingVerify } from "./shadowStore";
import { writeWindowBackup } from "./windowWriter";

/** 控えの作り直し (セッション確認 → 今のタブで mergeShadow → 書き戻す) */
export async function rebuildShadow(): Promise<void> {
  const sessionId = await ensureSession();
  const prev = await loadShadow();
  const tabs = await queryCurrentTabs();
  await saveShadow(mergeShadow(prev, tabs, Date.now(), sessionId));
}

/**
 * 閉じたウィンドウを 自動バックアップ/ に書く。
 * 順番は「ブックマークを書く → 印を付ける」(途中で止まっても消えることはない)。
 * 印と確かめ待ちの項目は 1 回の storage.local.set で書く。
 */
export async function saveClosedWindow(windowId: number): Promise<void> {
  const sessionId = await ensureSession();
  const shadow = await loadShadow();
  const win = shadow?.windows[String(windowId)];
  if (!shadow || !win || win.saved) return;

  const written = await writeWindowBackup(win.tabs, { timeMs: Date.now(), beforeRestart: false });
  win.saved = true;
  if (!written) {
    await saveShadow(shadow);
    return;
  }
  const pending = await loadPendingVerify();
  await saveShadowAndPendingVerify(shadow, [...pending, toPendingVerifyEntry(written, sessionId, Date.now())]);
}

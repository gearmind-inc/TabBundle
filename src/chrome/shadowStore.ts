import { PENDING_VERIFY_STORAGE_KEY, SHADOW_STORAGE_KEY } from "../constants";
import type { PendingVerifyEntry, Shadow, TabLike } from "../core/types";

export async function loadShadow(): Promise<Shadow | undefined> {
  const result = await chrome.storage.local.get(SHADOW_STORAGE_KEY);
  return result[SHADOW_STORAGE_KEY] as Shadow | undefined;
}

export async function saveShadow(shadow: Shadow): Promise<void> {
  await chrome.storage.local.set({ [SHADOW_STORAGE_KEY]: shadow });
}

/** 書いたフォルダの「確かめ待ち」リスト (無ければ空) */
export async function loadPendingVerify(): Promise<PendingVerifyEntry[]> {
  const result = await chrome.storage.local.get(PENDING_VERIFY_STORAGE_KEY);
  const value = result[PENDING_VERIFY_STORAGE_KEY];
  return Array.isArray(value) ? (value as PendingVerifyEntry[]) : [];
}

export async function savePendingVerify(entries: readonly PendingVerifyEntry[]): Promise<void> {
  await chrome.storage.local.set({ [PENDING_VERIFY_STORAGE_KEY]: entries });
}

/** 控えと確かめ待ちリストを 1 回の storage.local.set で書く (印と確かめ待ちを同時に残すため) */
export async function saveShadowAndPendingVerify(shadow: Shadow, entries: readonly PendingVerifyEntry[]): Promise<void> {
  await chrome.storage.local.set({ [SHADOW_STORAGE_KEY]: shadow, [PENDING_VERIFY_STORAGE_KEY]: entries });
}

/** 控えの対象になる今のタブ (通常ウィンドウのみ) */
export async function queryCurrentTabs(): Promise<TabLike[]> {
  return chrome.tabs.query({ windowType: "normal" });
}

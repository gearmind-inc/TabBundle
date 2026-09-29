import { collectBookmarks, type SearchBookmark } from "../core/search";
import { findRootFolderId } from "./bookmarkLayout";

/**
 * TabBundle/ 配下 (手動保存/ 自動バックアップ/ old/自動バックアップ/ とその下) の全ブックマーク。
 * 読むだけ (フォルダは作らない)。TabBundle フォルダが無ければ undefined。
 * chrome.bookmarks.search はフォルダを絞れないので使わず、getSubTree で取る。
 */
export async function loadTabBundleBookmarks(): Promise<SearchBookmark[] | undefined> {
  const rootId = await findRootFolderId();
  if (rootId === undefined) return undefined;
  const tree = await chrome.bookmarks.getSubTree(rootId);
  return collectBookmarks(tree);
}

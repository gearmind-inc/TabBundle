import { AUTO_FOLDER_TITLE, MANUAL_FOLDER_TITLE, OLD_FOLDER_TITLE, ROOT_FOLDER_TITLE } from "../constants";
import { chooseOtherBookmarksId, findFolderByTitle, type OtherBookmarksCandidate } from "../core/otherBookmarks";

export interface BookmarkLayout {
  rootId: string;
  manualId: string;
  autoId: string;
  oldId: string;
  /** old/自動バックアップ/ */
  oldAutoId: string;
}

/**
 * 「その他のブックマーク」の id。
 * 候補は bookmarks.getChildren("0") のうち folderType === "other" のもの (同期あり / なしで 2 つある場合がある)。
 */
async function findOtherBookmarksId(): Promise<string> {
  const topLevel = await chrome.bookmarks.getChildren("0");
  const candidates: OtherBookmarksCandidate[] = [];
  for (const node of topLevel) {
    if (node.folderType !== "other") continue;
    const children = await chrome.bookmarks.getChildren(node.id);
    candidates.push({
      id: node.id,
      syncing: node.syncing,
      hasRootFolder: findFolderByTitle(children, ROOT_FOLDER_TITLE) !== undefined,
    });
  }
  return chooseOtherBookmarksId(candidates);
}

/**
 * 既にある TabBundle フォルダの id を、読むだけで探す (無ければ undefined。フォルダは作らない)。
 * ensureBookmarkLayout と同じ「その他のブックマーク」を選ぶ。ポップアップと本文の片付けが使う。
 */
export async function findRootFolderId(): Promise<string | undefined> {
  const otherId = await findOtherBookmarksId();
  const children = await chrome.bookmarks.getChildren(otherId);
  return findFolderByTitle(children, ROOT_FOLDER_TITLE)?.id;
}

/** 親の直下で title が一致し url を持たない最初のフォルダを返す。無ければ作る (末尾に追加) */
async function findOrCreateFolder(parentId: string, title: string): Promise<string> {
  const children = await chrome.bookmarks.getChildren(parentId);
  const existing = findFolderByTitle(children, title);
  if (existing) return existing.id;
  const created = await chrome.bookmarks.create({ parentId, title });
  return created.id;
}

/**
 * folderIds を parentId の直下 index 0,1,2... に並べる。
 * 先頭から順に確定させるので、動かす物は常に今より上 (index が小さい方) へ動く。
 */
async function ensureOrder(parentId: string, folderIds: readonly string[]): Promise<void> {
  for (const [index, id] of folderIds.entries()) {
    const children = await chrome.bookmarks.getChildren(parentId);
    if (children[index]?.id === id) continue;
    await chrome.bookmarks.move(id, { parentId, index });
  }
}

/**
 * TabBundle/{手動保存, 自動バックアップ, old/自動バックアップ} を用意する。
 * 既存フォルダは再利用し、TabBundle 直下の 3 つの並びだけ直す。
 * 呼び出しは serial queue の中から行うこと (並列に呼ぶと二重に作られうる)。
 */
export async function ensureBookmarkLayout(): Promise<BookmarkLayout> {
  const otherId = await findOtherBookmarksId();
  const rootId = await findOrCreateFolder(otherId, ROOT_FOLDER_TITLE);
  const manualId = await findOrCreateFolder(rootId, MANUAL_FOLDER_TITLE);
  const autoId = await findOrCreateFolder(rootId, AUTO_FOLDER_TITLE);
  const oldId = await findOrCreateFolder(rootId, OLD_FOLDER_TITLE);
  await ensureOrder(rootId, [manualId, autoId, oldId]);
  const oldAutoId = await findOrCreateFolder(oldId, AUTO_FOLDER_TITLE);
  return { rootId, manualId, autoId, oldId, oldAutoId };
}

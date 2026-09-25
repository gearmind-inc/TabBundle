import { selectSavableTabs } from "../core/exclude";
import { buildBackupFolderName } from "../core/folderName";
import type { ShadowTab, WrittenFolder, WrittenTab } from "../core/types";
import { ensureBookmarkLayout } from "./bookmarkLayout";

export interface WriteWindowOptions {
  /** フォルダ名に使う時刻 (ms) */
  timeMs: number;
  /** 再起動前の回収分なら true */
  beforeRestart: boolean;
}

/**
 * title のフォルダを 自動バックアップ/ の index 0 に作り、tabs を並び順のまま
 * (タイトルが空なら URL をタイトルにして) ブックマークとして書く。作ったフォルダの id を返す。
 * 1 件のブックマーク作成が失敗しても残りは続ける。
 */
export async function writeAutoBackupFolder(title: string, tabs: readonly WrittenTab[]): Promise<string> {
  const { autoId } = await ensureBookmarkLayout();
  const folder = await chrome.bookmarks.create({ parentId: autoId, index: 0, title });
  for (const tab of tabs) {
    try {
      await chrome.bookmarks.create({ parentId: folder.id, title: tab.title || tab.url, url: tab.url });
    } catch (error) {
      console.error("TabBundle: ブックマークの作成に失敗しました", tab.url, error);
    }
  }
  return folder.id;
}

/**
 * 1 ウィンドウ分のタブを除外してから 自動バックアップ/ に書き、書いた中身を返す。
 * 除外後 0 タブならフォルダを作らず undefined を返す。
 */
export async function writeWindowBackup(
  tabs: readonly ShadowTab[],
  options: WriteWindowOptions,
): Promise<WrittenFolder | undefined> {
  const savable = selectSavableTabs(tabs).map((tab) => ({ url: tab.url, title: tab.title }));
  if (savable.length === 0) return undefined;

  const title = buildBackupFolderName(options.timeMs, savable.length, options.beforeRestart);
  const folderId = await writeAutoBackupFolder(title, savable);
  return { folderId, title, tabs: savable };
}

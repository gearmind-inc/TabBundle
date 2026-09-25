import type { AUTO_FOLDER_TITLE } from "../constants";

/** 控えに入れる 1 タブ分 */
export interface ShadowTab {
  url: string;
  title: string;
  windowId: number;
  index: number;
  pinned: boolean;
}

/** 控えに入れる 1 ウィンドウ分 */
export interface ShadowWindow {
  tabs: ShadowTab[];
  /** 控えがこのウィンドウを最後に見た時刻 (ms) */
  updatedAt: number;
  /** 自動バックアップ/ に書き終えたかの印 */
  saved: boolean;
}

/** chrome.storage.local の "shadow" に入る控え */
export interface Shadow {
  sessionId: string;
  windows: { [windowId: string]: ShadowWindow };
}

/** 控えを作るのに必要な tabs.Tab の一部 (chrome の型に依存しないため) */
export interface TabLike {
  url?: string;
  pendingUrl?: string;
  title?: string;
  windowId: number;
  index: number;
  pinned: boolean;
  incognito?: boolean;
}

/** aging 判定に必要な BookmarkTreeNode の一部 */
export interface BookmarkNodeLike {
  id: string;
  url?: string;
  dateAdded?: number;
}

/** tabs.onUpdated の changeInfo の一部 (chrome の型に依存しないため) */
export interface TabChangeInfoLike {
  url?: string;
  title?: string;
  pinned?: boolean;
  status?: string;
  favIconUrl?: string;
  audible?: boolean;
}

/** 自動バックアップのフォルダに書いた 1 ブックマーク分 */
export interface WrittenTab {
  url: string;
  title: string;
}

/** 自動バックアップ/ に書いたフォルダ (書いた中身そのもの) */
export interface WrittenFolder {
  folderId: string;
  title: string;
  tabs: WrittenTab[];
}

/** chrome.storage.local の "pendingVerify" に入る「確かめ待ち」の 1 項目 */
export interface PendingVerifyEntry extends WrittenFolder {
  parentTitle: typeof AUTO_FOLDER_TITLE;
  sessionId: string;
  createdAt: number;
}

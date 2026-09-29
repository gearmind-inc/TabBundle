export const ROOT_FOLDER_TITLE = "TabBundle";
export const MANUAL_FOLDER_TITLE = "手動保存";
export const AUTO_FOLDER_TITLE = "自動バックアップ";
export const OLD_FOLDER_TITLE = "old";

export const MOVE_TO_OLD_DAYS = 7;
export const DELETE_FROM_OLD_DAYS = 7;
export const SHADOW_DEBOUNCE_MS = 1500;
/** 最初のきっかけからこれだけ経ったら、変化が続いていても必ず 1 回作り直す (maxWait) */
export const SHADOW_MAX_WAIT_MS = 2000;
/** 書いたフォルダの「確かめ待ち」を、今のセッションでこれだけ経ったら消す */
export const VERIFY_GRACE_MS = 60_000;

export const AGING_ALARM_NAME = "tabbundle-aging";
export const AGING_ALARM_PERIOD_MINUTES = 1440;

/** 「その他のブックマーク」が見つからないときに使う id */
export const FALLBACK_OTHER_BOOKMARKS_ID = "2";

/** chrome.storage.local のキー (控え) */
export const SHADOW_STORAGE_KEY = "shadow";
/** chrome.storage.local のキー (書いたフォルダの確かめ待ちリスト) */
export const PENDING_VERIFY_STORAGE_KEY = "pendingVerify";
/** chrome.storage.local のキー (old/自動バックアップ/ へ移した時刻) */
export const OLD_MOVED_AT_STORAGE_KEY = "oldMovedAt";
/** chrome.storage.session のキー (今のブラウザセッションの ID) */
export const SESSION_STORAGE_KEY = "sessionId";

/** chrome.storage.local のキー (本文を保存するホスト名の一覧。ON/OFF の正本) */
export const PAGE_TEXT_HOSTS_STORAGE_KEY = "pageTextHosts";
/** chrome.storage.local の本文のキーの先頭 (この後ろに URL をそのまま付ける。1 URL = 1 キー) */
export const PAGE_TEXT_KEY_PREFIX = "pageText:";
/** 1 ページで保存する本文の最大文字数 (先頭から) */
export const PAGE_TEXT_MAX_CHARS = 20_000;
/** ブックマークが消えた後、本文の片付けを走らせるまで待つ時間 (ms)。消える操作が続く間はまとめる */
export const PAGE_TEXT_GC_DEBOUNCE_MS = 5_000;
export const PAGE_TEXT_GC_MAX_WAIT_MS = 30_000;

/** 右クリックのメニュー (本文を保存する ON/OFF) の id */
export const PAGE_TEXT_MENU_ID = "tabbundle-page-text";
/** 本文を保存するサイトのタブに付けるバッジ */
export const PAGE_TEXT_BADGE_TEXT = "ON";
export const PAGE_TEXT_BADGE_COLOR = "#1a7f37";

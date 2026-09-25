export const ROOT_FOLDER_TITLE = "TabBundle";
export const MANUAL_FOLDER_TITLE = "手動保存";
export const AUTO_FOLDER_TITLE = "自動バックアップ";
export const OLD_FOLDER_TITLE = "old";

export const AGING_DAYS = 30;
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
/** chrome.storage.session のキー (今のブラウザセッションの ID) */
export const SESSION_STORAGE_KEY = "sessionId";

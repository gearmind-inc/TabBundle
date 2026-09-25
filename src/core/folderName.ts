function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** ローカル時刻で `YYYY-MM-DD HH:MM` */
export function formatLocalDateTime(timeMs: number): string {
  const d = new Date(timeMs);
  const date = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  return `${date} ${time}`;
}

/**
 * 自動バックアップのフォルダ名。
 * 閉じた時: `YYYY-MM-DD HH:MM ウィンドウ (N タブ)`
 * 再起動前の回収: `YYYY-MM-DD HH:MM (再起動前) ウィンドウ (N タブ)`
 */
export function buildBackupFolderName(timeMs: number, tabCount: number, beforeRestart: boolean): string {
  const marker = beforeRestart ? " (再起動前)" : "";
  return `${formatLocalDateTime(timeMs)}${marker} ウィンドウ (${tabCount} タブ)`;
}

import { AGING_ALARM_NAME, SHADOW_DEBOUNCE_MS, SHADOW_MAX_WAIT_MS } from "../constants";
import { isShadowTriggerUpdate } from "../core/shadowTrigger";
import type { TabChangeInfoLike } from "../core/types";
import { ensureAgingAlarm, runAging } from "./aging";
import { debounce } from "./debounce";
import { rebuildShadow, saveClosedWindow } from "./flows";
import { createSerialQueue } from "./serialQueue";
import { ensureSession } from "./session";

export interface BackgroundHandlers {
  /** タブ・ウィンドウの変化 (控えの作り直しを debounce で予約する) */
  onShadowTrigger(): void;
  /** tabs.onUpdated (url / title / pinned が変わったときだけきっかけにする) */
  onTabUpdated(changeInfo: TabChangeInfoLike): void;
  onTabRemoved(tabId: number, removeInfo: { isWindowClosing: boolean }): void;
  onWindowRemoved(windowId: number): Promise<void>;
  onInstalled(details: { reason: string }): Promise<void>;
  onStartup(): Promise<void>;
  onAlarm(alarm: { name: string }): Promise<void>;
  /** queue が空になると解決する (テスト用) */
  whenIdle(): Promise<void>;
}

function logError(error: unknown): void {
  console.error("TabBundle:", error);
}

/**
 * background の各入口。控えとブックマークに触る処理は全部 1 本の serial queue に入れる。
 * メモリに持つのは debounce のタイマーと queue だけ。
 * どの入口もセッション確認 (違えば確かめ → 回収、最後に確かめ待ちの刈り取り) から始まる。
 */
export function createBackgroundHandlers(): BackgroundHandlers {
  const queue = createSerialQueue();
  const run = (task: () => Promise<void>): Promise<void> => queue.enqueue(task).catch(logError);

  const scheduleRebuild = debounce(
    () => {
      void run(rebuildShadow);
    },
    { waitMs: SHADOW_DEBOUNCE_MS, maxWaitMs: SHADOW_MAX_WAIT_MS },
  );

  return {
    onShadowTrigger: scheduleRebuild,
    onTabUpdated(changeInfo) {
      if (isShadowTriggerUpdate(changeInfo)) scheduleRebuild();
    },
    onTabRemoved(_tabId, removeInfo) {
      if (removeInfo.isWindowClosing) return;
      scheduleRebuild();
    },
    onWindowRemoved(windowId) {
      return run(() => saveClosedWindow(windowId));
    },
    onInstalled(_details) {
      // reason に関係なく、他の入口と同じ「セッション確認 (違えば回収) → 作り直し」
      void ensureAgingAlarm().catch(logError);
      return run(rebuildShadow);
    },
    onStartup() {
      void ensureAgingAlarm().catch(logError);
      return run(async () => {
        await rebuildShadow();
        await runAging(Date.now());
      });
    },
    onAlarm(alarm) {
      if (alarm.name !== AGING_ALARM_NAME) return Promise.resolve();
      return run(async () => {
        await ensureSession();
        await runAging(Date.now());
      });
    },
    whenIdle: () => queue.whenIdle(),
  };
}

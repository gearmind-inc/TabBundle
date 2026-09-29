import { AGING_ALARM_NAME, SHADOW_DEBOUNCE_MS, SHADOW_MAX_WAIT_MS } from "../constants";
import { isShadowTriggerUpdate } from "../core/shadowTrigger";
import type { TabChangeInfoLike } from "../core/types";
import { ensureAgingAlarm, runAging } from "./aging";
import { debounce } from "./debounce";
import { rebuildShadow, saveClosedWindow } from "./flows";
import { collectPageTextGarbage, reconcilePageTextHosts } from "./pageText";
import { createPageTextHandlers, type PageTextHandlers } from "./pageTextHandlers";
import { createSerialQueue } from "./serialQueue";
import { ensureSession } from "./session";

export interface BackgroundHandlers extends Omit<PageTextHandlers, "setupUi"> {
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

/** 失敗を外へ漏らさない (console.error だけ) */
function safe<A extends unknown[]>(fn: (...args: A) => Promise<void>): (...args: A) => Promise<void> {
  return (...args) => fn(...args).catch(logError);
}

/**
 * background の各入口。控えとブックマークに触る処理は全部 1 本の serial queue に入れる。
 * 本文の保存・削除・片付けも同じ queue に入れる (控えやブックマークの書き込みと順番を守るため)。
 * メモリに持つのは debounce のタイマーと queue だけ。
 * 控えとブックマークの入口はセッション確認 (違えば確かめ → 回収、最後に確かめ待ちの刈り取り) から始まる。
 */
export function createBackgroundHandlers(): BackgroundHandlers {
  const queue = createSerialQueue();
  const run = (task: () => Promise<void>): Promise<void> => queue.enqueue(task).catch(logError);
  const pageText = createPageTextHandlers(run);
  /**
   * 権限の確かめ (権限が外れた ON のサイトを OFF にする) が終わってから、メニューとバッジを合わせる
   * (並行に走らせると、OFF に戻したサイトのバッジが ON のまま残りうるため)。
   */
  const reconcileThenSetupUi = async (): Promise<void> => {
    await run(reconcilePageTextHosts);
    await pageText.setupUi().catch(logError);
  };

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
    async onInstalled(_details) {
      // reason に関係なく、他の入口と同じ「セッション確認 (違えば回収) → 作り直し」
      void ensureAgingAlarm().catch(logError);
      await Promise.all([run(rebuildShadow), reconcileThenSetupUi()]);
    },
    async onStartup() {
      void ensureAgingAlarm().catch(logError);
      await Promise.all([
        run(async () => {
          await rebuildShadow();
          await runAging(Date.now());
          // aging で消えたブックマークの本文を片付ける (同じ queue のタスクの中で)
          await collectPageTextGarbage();
        }),
        reconcileThenSetupUi(),
      ]);
    },
    onAlarm(alarm) {
      if (alarm.name !== AGING_ALARM_NAME) return Promise.resolve();
      return run(async () => {
        await ensureSession();
        await runAging(Date.now());
        await collectPageTextGarbage();
      });
    },
    onPageTabUpdated: safe(pageText.onPageTabUpdated),
    onTabActivated: safe(pageText.onTabActivated),
    onWindowFocusChanged: safe(pageText.onWindowFocusChanged),
    onMenuClicked: safe(pageText.onMenuClicked),
    onPermissionsRemoved: safe(pageText.onPermissionsRemoved),
    onBookmarkRemoved: pageText.onBookmarkRemoved,
    onBookmarkMoved: pageText.onBookmarkMoved,
    whenIdle: () => queue.whenIdle(),
  };
}

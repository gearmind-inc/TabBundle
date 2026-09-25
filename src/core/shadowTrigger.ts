import type { TabChangeInfoLike } from "./types";

/**
 * tabs.onUpdated を控えの作り直しのきっかけにするか。
 * url / title / pinned のどれかが変わったときだけ (status や favIconUrl や audible だけの変化は無視)。
 */
export function isShadowTriggerUpdate(changeInfo: TabChangeInfoLike): boolean {
  return changeInfo.url !== undefined || changeInfo.title !== undefined || changeInfo.pinned !== undefined;
}

export interface DebounceTiming {
  /** 今の時刻 (ms) */
  now: number;
  /** 今回の待ちの最初のきっかけの時刻 (ms) */
  firstTriggerAt: number;
  /** 最後のきっかけから待つ時間 (ms) */
  waitMs: number;
  /** 最初のきっかけから待てる上限 (ms) */
  maxWaitMs: number;
}

/**
 * maxWait 付き debounce の、今のきっかけから作り直しまでの待ち時間 (ms)。
 * 「最後のきっかけから waitMs」と「最初のきっかけから maxWaitMs」の早い方。負にはしない。
 */
export function computeDebounceDelay({ now, firstTriggerAt, waitMs, maxWaitMs }: DebounceTiming): number {
  return Math.max(0, Math.min(waitMs, firstTriggerAt + maxWaitMs - now));
}

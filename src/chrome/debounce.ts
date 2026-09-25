import { computeDebounceDelay } from "../core/shadowTrigger";

export interface DebounceOptions {
  /** 最後の呼び出しから待つ時間 (ms) */
  waitMs: number;
  /** 最初の呼び出しから待てる上限 (ms)。呼び出しが続いてもこの時間で必ず 1 回呼ぶ */
  maxWaitMs: number;
}

/**
 * maxWait 付き debounce (setTimeout)。
 * 最後の呼び出しから waitMs、または最初の呼び出しから maxWaitMs の早い方で fn を 1 回だけ呼ぶ。
 * 呼んだ後は、次の呼び出しから数え直す。
 */
export function debounce(fn: () => void, { waitMs, maxWaitMs }: DebounceOptions): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let firstTriggerAt: number | undefined;
  return () => {
    const now = Date.now();
    firstTriggerAt ??= now;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(
      () => {
        timer = undefined;
        firstTriggerAt = undefined;
        fn();
      },
      computeDebounceDelay({ now, firstTriggerAt, waitMs, maxWaitMs }),
    );
  };
}

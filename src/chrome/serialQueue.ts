export interface SerialQueue {
  /** task を列の最後に入れ、前の task が終わってから実行する。結果 (失敗も) をそのまま返す */
  enqueue<T>(task: () => Promise<T>): Promise<T>;
  /** 今入っている task が全部終わると解決する */
  whenIdle(): Promise<void>;
}

/** メモリ上の 1 本の Promise の列。前の task が失敗しても次の task は走る */
export function createSerialQueue(): SerialQueue {
  let tail: Promise<void> = Promise.resolve();
  return {
    enqueue<T>(task: () => Promise<T>): Promise<T> {
      const result = tail.then(task);
      tail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
    whenIdle(): Promise<void> {
      return tail;
    },
  };
}

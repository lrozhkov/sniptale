type Waiter = {
  exclusive: boolean;
  start(): void;
};

/** Execution leases are separate from the caller's bounded capture and publication leases. */
export function createReviewPreviewFrameExecution(maximum: 1 | 2) {
  const waiting: Waiter[] = [];
  let running = 0;
  let exclusive = false;
  const drain = () => {
    while (waiting.length && !exclusive && running < maximum) {
      const next = waiting[0]!;
      if (next.exclusive && running) return;
      waiting.shift();
      next.start();
    }
  };
  return {
    acquire(isExclusive: boolean, signal: AbortSignal): Promise<() => void> {
      signal.throwIfAborted();
      return new Promise((resolve, reject) => {
        const abort = () => {
          const index = waiting.indexOf(waiter);
          if (index < 0) return;
          waiting.splice(index, 1);
          signal.removeEventListener('abort', abort);
          reject(signal.reason);
          drain();
        };
        const waiter: Waiter = {
          exclusive: isExclusive,
          start() {
            signal.removeEventListener('abort', abort);
            running++;
            exclusive = isExclusive;
            let released = false;
            resolve(() => {
              if (released) return;
              released = true;
              running--;
              if (isExclusive) exclusive = false;
              drain();
            });
          },
        };
        waiting.push(waiter);
        signal.addEventListener('abort', abort, { once: true });
        drain();
      });
    },
  };
}

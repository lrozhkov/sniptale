import { useEffect } from 'react';

interface RecordingHistoryReadOwner<Request> {
  active: boolean;
  epoch: number;
  running: boolean;
  pending: Request | null;
  renderer: { clear(): void };
}

/** One mounted surface owns its epoch and clears queued reads and renderer state on unmount. */
export function useRecordingHistoryReadLifetime<Request>(
  owner: RecordingHistoryReadOwner<Request>
): void {
  useEffect(() => {
    owner.active = true;
    owner.epoch++;
    return () => {
      owner.active = false;
      owner.epoch++;
      owner.pending = null;
      owner.renderer.clear();
    };
  }, [owner]);
}

/** Runs one read at a time and takes only the most recent queued request after completion. */
export function runRecordingHistoryReads<Request>(
  owner: RecordingHistoryReadOwner<Request>,
  consume: (request: Request, epoch: number) => Promise<void>
): void {
  const run = () => {
    if (!owner.active || owner.running || !owner.pending) return;
    const request = owner.pending;
    const epoch = owner.epoch;
    owner.pending = null;
    owner.running = true;
    void (async () => {
      try {
        await consume(request, epoch);
      } finally {
        owner.running = false;
        if (owner.active && owner.pending) run();
      }
    })();
  };
  run();
}

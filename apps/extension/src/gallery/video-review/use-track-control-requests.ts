import { useRef, useState, type RefObject } from 'react';
import type { createVideoReviewSession } from '../../workflows/video-review/session';

type TrackRequest = Parameters<ReturnType<typeof createVideoReviewSession>['setTrackControl']>;

/** Drains accepted UI edits before each command and retains a failed request for retry. */
export function useTrackControlRequests(options: {
  prepare(): Promise<void>;
  execute(...request: TrackRequest): Promise<void>;
  mounted: RefObject<boolean>;
}) {
  const tail = useRef(Promise.resolve());
  const failure = useRef<{ request: TrackRequest; error: unknown } | null>(null);
  const generation = useRef(0);
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(0);
  const change = (...request: TrackRequest) => {
    const epoch = generation.current;
    setPending((count) => count + 1);
    const work = tail.current.then(async () => {
      if (epoch !== generation.current) return;
      await options.prepare();
      if (epoch !== generation.current) return;
      await options.execute(...request);
      if (epoch !== generation.current) return;
      failure.current = null;
      if (options.mounted.current) setFailed(false);
    });
    tail.current = work
      .catch((error: unknown) => {
        if (epoch !== generation.current) return;
        failure.current = { request, error };
        if (options.mounted.current) setFailed(true);
      })
      .finally(() => {
        if (epoch === generation.current && options.mounted.current)
          setPending((count) => count - 1);
      });
    return tail.current;
  };
  const drain = async () => {
    await tail.current;
    if (failure.current) throw failure.current.error;
  };
  return {
    change,
    drain,
    failed,
    pending: pending > 0,
    reset: () => {
      generation.current += 1;
      failure.current = null;
      setFailed(false);
      setPending(0);
    },
    retry: async () => {
      if (failure.current) await change(...failure.current.request);
      await drain();
    },
  };
}

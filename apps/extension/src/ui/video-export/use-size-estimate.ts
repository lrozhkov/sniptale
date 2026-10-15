import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { VideoExportSizeEstimate } from '../../features/video/project/export/size-estimate';

export type VideoExportSizeStatus =
  | { kind: 'pending' }
  | { kind: 'unavailable' }
  | { kind: 'ready'; estimate: VideoExportSizeEstimate };

/** One debounced latest-request runner. Cleanup completes before the next encoder may start. */
export function useVideoExportSizeEstimate(
  key: string | null,
  calculate: (signal: AbortSignal) => Promise<VideoExportSizeEstimate>
) {
  const calculateRef = useRef(calculate);
  const committedKey = useRef(key);
  const running = useRef<Promise<void> | null>(null);
  const controller = useRef<AbortController | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const cache = useRef(new Map<string, VideoExportSizeEstimate>());
  const [result, setResult] = useState<{ key: string; status: VideoExportSizeStatus } | null>(null);
  useLayoutEffect(() => {
    calculateRef.current = calculate;
    if (committedKey.current !== key) {
      controller.current?.abort();
      setResult(null);
    }
    committedKey.current = key;
  }, [key, calculate]);
  useEffect(() => {
    if (key === null || cache.current.has(key)) return;
    let current = true;
    const cancellation = new AbortController();
    const timer = setTimeout(() => {
      const previous = running.current;
      const task = (async () => {
        await previous?.catch(() => undefined);
        if (!current || committedKey.current !== key) return;
        controller.current = cancellation;
        const timeout = setTimeout(() => cancellation.abort(), 10_000);
        try {
          const estimate = await calculateRef.current(cancellation.signal);
          if (!current || committedKey.current !== key) return;
          if (cancellation.signal.aborted) {
            setResult({ key, status: { kind: 'unavailable' } });
            return;
          }
          cache.current.set(key, estimate);
          if (cache.current.size > 8) cache.current.delete(cache.current.keys().next().value!);
          setResult({ key, status: { kind: 'ready', estimate } });
        } catch {
          if (current && committedKey.current === key)
            setResult({ key, status: { kind: 'unavailable' } });
        } finally {
          clearTimeout(timeout);
          if (controller.current === cancellation) controller.current = null;
        }
      })();
      running.current = task;
      void task.finally(() => {
        if (running.current === task) running.current = null;
      });
    }, 1000);
    const cancel = () => {
      current = false;
      clearTimeout(timer);
      cancellation.abort();
    };
    cancelRef.current = cancel;
    return () => {
      cancel();
      if (cancelRef.current === cancel) cancelRef.current = null;
    };
  }, [key]);
  const cached = key === null ? undefined : cache.current.get(key);
  const status: VideoExportSizeStatus | null =
    key === null
      ? null
      : cached
        ? { kind: 'ready', estimate: cached }
        : result?.key === key
          ? result.status
          : { kind: 'pending' };
  return { status, cancel: () => cancelRef.current?.() };
}

import { useRef, useState, type RefObject } from 'react';
import type { SyncProductResult } from '../contracts/messaging/contracts/runtime-message/sync-connection.types';
import { translate } from '../platform/i18n';
import { formatBytes } from '../platform/i18n/format-bytes';

/** Disposable feedback and cancellation for one mounted originals-cache control. */
export function useSyncCacheFeedback(
  active: RefObject<boolean>,
  cancelRequest: (requestId: string) => Promise<SyncProductResult>
) {
  const [failed, setFailed] = useState(false);
  const [cancelRefused, setCancelRefused] = useState(false);
  const [releasedBytes, setReleasedBytes] = useState<number | null>(null);
  const [deferred, setDeferred] = useState(false);
  const [running, setRunning] = useState(false);
  const cancelling = useRef(false);
  async function cancel(observation: {
    requestId: string;
    isCurrent(): boolean;
    settle(): Promise<void>;
  }) {
    if (cancelling.current) return;
    cancelling.current = true;
    try {
      const result = await cancelRequest(observation.requestId);
      if (!active.current || !observation.isCurrent()) return;
      if (result.kind === 'cancelled' && result.outcome === 'cancelled') {
        setRunning(false);
        await observation.settle();
      } else setCancelRefused(true);
    } catch {
      if (active.current) {
        if (observation.isCurrent()) setCancelRefused(true);
        else setFailed(true);
      }
    } finally {
      cancelling.current = false;
    }
  }
  return {
    failed,
    setFailed,
    cancelRefused,
    setCancelRefused,
    releasedBytes,
    setReleasedBytes,
    deferred,
    setDeferred,
    running,
    setRunning,
    cancelling,
    cancel,
  };
}

/** Both cache surfaces present the same fixed cancellation and release results. */
export function SyncCacheFeedback({
  cancelRefused,
  releasedBytes,
  deferred,
}: {
  cancelRefused: boolean;
  releasedBytes: number | null;
  deferred: boolean;
}) {
  return (
    <>
      {cancelRefused ? (
        <p role="alert" className="text-xs">
          {translate('shared.syncCache.cancelRefused')}
        </p>
      ) : null}
      {releasedBytes !== null ? (
        <p role="status" className="text-xs">
          {translate('shared.syncCache.completed').replace('{bytes}', formatBytes(releasedBytes))}
        </p>
      ) : null}
      {deferred ? (
        <p role="status" className="text-xs">
          {translate('shared.syncCache.deferred')}
        </p>
      ) : null}
    </>
  );
}

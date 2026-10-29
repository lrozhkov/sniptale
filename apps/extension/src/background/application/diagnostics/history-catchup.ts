import { subscribeToChromeEvent } from '@sniptale/platform/browser/callback';
import { createLogger } from '@sniptale/platform/observability/logger';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  loadSyncQueueHistoryEnrollment,
  loadSyncQueueHistoryScanPage,
  loadSyncQueueHistoryScanState,
  saveSyncQueueHistoryScanState,
} from '../../../composition/persistence/sync-capture/queue-history-scan';
import { deliverSyncQueueHistory } from '../../../workflows/sync-transfer/queue-history';

const ALARM = 'sniptale:sync-queue-history';
const logger = createLogger({ namespace: 'SyncQueueHistory' });

/** Register bounded local history recovery. Disposal leaves the alarm for the next worker. */
export function registerQueueHistoryCatchup(): { run(): Promise<void>; dispose(): void } {
  let disposed = false;
  let pending: Promise<void> | null = null;
  const pass = async () => {
    const alarm: unknown = await chrome.alarms.get(ALARM);
    if (disposed) return;
    if (!isRecord(alarm) || alarm['periodInMinutes'] !== 1)
      await chrome.alarms.create(ALARM, { periodInMinutes: 1 });
    if (disposed) return;
    const scope = await loadSyncQueueHistoryEnrollment();
    if (disposed) return;
    if (!scope) {
      await chrome.alarms.clear(ALARM);
      return;
    }
    await deliverSyncQueueHistory(scope, { kind: 'connection' }).catch(() => false);
    if (disposed) return;
    let state = await loadSyncQueueHistoryScanState(scope);
    for (let pageNumber = 0; pageNumber < 2 && !disposed; pageNumber++) {
      const page = await loadSyncQueueHistoryScanPage(state, 64);
      if (disposed) return;
      if (page.invalidSources > 0)
        logger.warn('Sync queue history contains invalid source metadata');
      for (const source of page.sources) {
        if (disposed) return;
        await deliverSyncQueueHistory(scope, source).catch(() => false);
      }
      if (disposed) return;
      state = await saveSyncQueueHistoryScanState(state, page.nextAfterKey);
      if (!page.more) return;
    }
  };
  const run = (): Promise<void> => {
    if (disposed) return Promise.resolve();
    if (pending) return pending;
    pending = pass()
      .catch(() => logger.warn('Sync queue history catch-up deferred'))
      .finally(() => {
        pending = null;
      });
    return pending;
  };
  const unsubscribe = subscribeToChromeEvent(chrome.alarms?.onAlarm, (value: unknown) => {
    if (isRecord(value) && value['name'] === ALARM) void run();
  });
  return {
    run,
    dispose() {
      disposed = true;
      unsubscribe();
    },
  };
}

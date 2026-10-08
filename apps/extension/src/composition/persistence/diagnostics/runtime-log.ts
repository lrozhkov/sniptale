import {
  installDiagnosticLogObserver,
  type DiagnosticLogEvent,
} from '@sniptale/platform/observability/logger';
import { sanitizeStructuredDiagnosticExportData } from '@sniptale/platform/observability/diagnostics/sanitizer';
import { browserStorage } from '../infrastructure/browser-storage';
import { tryRunWithPersistenceMutationPermit } from '../infrastructure/mutation-barrier';
import {
  appendRuntimeLog,
  parseRuntimeLog,
  parseRuntimeLogEntry,
  type RuntimeLogEntry,
} from './model';

export const RUNTIME_LOG_STORAGE_KEY = 'sniptale_runtime_diagnostic_log';
interface Dependencies {
  area?: Pick<typeof browserStorage.local, 'get' | 'set'>;
  withPermit?: typeof tryRunWithPersistenceMutationPermit;
  withLock?: (work: () => Promise<void>) => Promise<void>;
  delay?: () => Promise<void>;
}
/** Bounded, batched advisory capture. An admitted batch drains before privacy erasure. */
export function createRuntimeLog(dependencies: Dependencies = {}) {
  const area = dependencies.area ?? browserStorage.local;
  const withPermit = dependencies.withPermit ?? tryRunWithPersistenceMutationPermit;
  const withLock =
    dependencies.withLock ??
    (async (work) => {
      if (typeof navigator !== 'undefined' && navigator.locks)
        await navigator.locks.request('sniptale:runtime-diagnostic-log', work);
    });
  const delay =
    dependencies.delay ?? (() => new Promise<void>((resolve) => setTimeout(resolve, 1000)));
  let batch: RuntimeLogEntry[] = [];
  let pending: Promise<void> | null = null;
  let collecting = false;
  let dropped = 0;
  function append(event: DiagnosticLogEvent, context: string): void {
    const entry = parseRuntimeLogEntry({
      ...event,
      schemaVersion: 1,
      lastTime: event.time,
      repeats: 1,
      dropped: 0,
      context,
    });
    if (!entry) return;
    if (pending) {
      if (collecting && batch.length < 64) batch.push(entry);
      else dropped = Math.min(1_000_000_000, dropped + 1);
      return;
    }
    batch = [entry];
    collecting = true;
    pending = withPermit(async (permit) => {
      await delay();
      collecting = false;
      const rows = batch;
      batch = [];
      const last = rows.at(-1);
      if (last) last.dropped = dropped;
      dropped = 0;
      await withLock(async () => {
        const current = await area.get(RUNTIME_LOG_STORAGE_KEY);
        const entries = appendRuntimeLog(parseRuntimeLog(current[RUNTIME_LOG_STORAGE_KEY]), rows);
        await area.set(
          {
            [RUNTIME_LOG_STORAGE_KEY]: sanitizeStructuredDiagnosticExportData({
              version: 1,
              entries,
            }),
          },
          permit
        );
      });
    })
      .then(
        () => undefined,
        () => undefined
      )
      .finally(() => {
        batch = [];
        pending = null;
        collecting = false;
      });
  }
  return {
    append,
    settled: () => pending ?? Promise.resolve(),
    async read() {
      const current = await area.get(RUNTIME_LOG_STORAGE_KEY);
      return parseRuntimeLog(current[RUNTIME_LOG_STORAGE_KEY]);
    },
    subscribe(listener: () => void): () => void {
      if (!browserStorage.canObserveChanges()) return () => undefined;
      return browserStorage.subscribeToChanges((changes, area) => {
        if (area === 'local' && Object.hasOwn(changes, RUNTIME_LOG_STORAGE_KEY)) listener();
      });
    },
  };
}
/** The entrypoint owns observer installation; no timer or storage work runs without a log event. */
export function installRuntimeLogCapture(context: string): () => void {
  const log = createRuntimeLog();
  return installDiagnosticLogObserver((event) => log.append(event, context));
}

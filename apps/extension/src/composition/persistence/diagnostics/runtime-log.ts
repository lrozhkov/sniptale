import { createEventHistory, EVENT_HISTORY_DAYS } from './event-history';
import {
  installDiagnosticLogObserver,
  type DiagnosticLogEvent,
} from '@sniptale/platform/observability/logger';
import { sanitizeStructuredDiagnosticExportData } from '@sniptale/platform/observability/diagnostics/sanitizer';
import { browserStorage } from '../infrastructure/browser-storage';
import {
  isActivePersistenceMutationPermit,
  tryRunWithPersistenceMutationPermit,
  type PersistenceMutationPermit,
} from '../infrastructure/mutation-barrier';
import {
  appendRuntimeLog,
  parseRuntimeLog,
  parseRuntimeLogEntry,
  runtimeLogJsonl,
  type RuntimeLogEntry,
} from './model';

export const RUNTIME_LOG_STORAGE_KEY = 'sniptale_runtime_diagnostic_log';
interface Dependencies {
  area?: Pick<typeof browserStorage.local, 'get' | 'set'>;
  withPermit?: typeof tryRunWithPersistenceMutationPermit;
  withLock?: (work: () => Promise<void>) => Promise<void>;
  delay?: () => Promise<void>;
  now?: () => number;
  history?: Pick<ReturnType<typeof createEventHistory>, 'append'>;
}
/** Bounded, batched advisory capture. An admitted batch drains before privacy erasure. */
export function createRuntimeLog(dependencies: Dependencies = {}) {
  const now = dependencies.now ?? Date.now;
  const recent = (rows: RuntimeLogEntry[]) =>
    rows.filter((entry) => Date.parse(entry.time) > now() - EVENT_HISTORY_DAYS * 86_400_000);
  const history = dependencies.history ?? createEventHistory();
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
    if (batch.length < 64) batch.push(entry);
    else dropped = Math.min(1_000_000_000, dropped + 1);
    flush();
  }
  function flush(): void {
    if (pending) return;
    pending = withPermit(async (permit) => {
      await delay();
      const rows = batch;
      batch = [];
      const last = rows.at(-1);
      if (last) last.dropped = dropped;
      dropped = 0;
      await withLock(async () => {
        const current = await area.get(RUNTIME_LOG_STORAGE_KEY);
        const entries = appendRuntimeLog(
          recent(parseRuntimeLog(current[RUNTIME_LOG_STORAGE_KEY])),
          recent(rows)
        );
        await history.append(runtimeLogJsonl(rows), permit);
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
      return true;
    })
      .then(
        (admitted) => {
          if (admitted !== true) batch = [];
        },
        () => {
          batch = [];
        }
      )
      .finally(() => {
        pending = null;
        if (batch.length) flush();
      });
  }
  return {
    append,
    /** Confirm archive and recent-tail publication under the caller's admitted lifetime. */
    async appendConfirmed(input: unknown, permit: PersistenceMutationPermit): Promise<boolean> {
      if (!isActivePersistenceMutationPermit(permit)) return false;
      const detached: unknown = structuredClone(input);
      if (!Array.isArray(detached) || detached.length < 1 || detached.length > 65) return false;
      const rows = detached.flatMap((raw: unknown) => {
        const row = parseRuntimeLogEntry(raw);
        return row ? [row] : [];
      });
      if (rows.length !== detached.length || recent(rows).length !== rows.length) return false;
      let published = false;
      try {
        await withLock(async () => {
          if (!isActivePersistenceMutationPermit(permit)) return;
          const current = await area.get(RUNTIME_LOG_STORAGE_KEY);
          const entries = appendRuntimeLog(
            recent(parseRuntimeLog(current[RUNTIME_LOG_STORAGE_KEY])),
            rows
          );
          if (!(await history.append(runtimeLogJsonl(rows), permit))) return;
          await area.set(
            {
              [RUNTIME_LOG_STORAGE_KEY]: sanitizeStructuredDiagnosticExportData({
                version: 1,
                entries,
              }),
            },
            permit
          );
          published = true;
        });
      } catch {
        return false;
      }
      return published;
    },
    async settled() {
      while (pending) await pending;
    },
    async read() {
      const current = await area.get(RUNTIME_LOG_STORAGE_KEY);
      return recent(parseRuntimeLog(current[RUNTIME_LOG_STORAGE_KEY]));
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

import { createDiagnosticPortWriter } from '../../../platform/runtime-messaging/diagnostic-capture';
import { sanitizeStructuredDiagnosticExportData } from '@sniptale/platform/observability/diagnostics/sanitizer';
import { browserStorage } from '../infrastructure/browser-storage';
import { tryRunWithPersistenceMutationPermit } from '../infrastructure/mutation-barrier';
import {
  appendMaintenanceLog,
  createMaintenanceLogEntry,
  parseMaintenanceLog,
  type MaintenanceLogInput,
} from './maintenance-log-model';

export const MAINTENANCE_LOG_STORAGE_KEY = 'sniptale_library_maintenance_log';
const LOCK_NAME = 'sniptale:library-maintenance-log';
interface MaintenanceLogDependencies {
  area?: Pick<typeof browserStorage.local, 'get' | 'set'>;
  withPermit?: typeof tryRunWithPersistenceMutationPermit;
  withLock?: (operation: () => Promise<boolean>) => Promise<boolean>;
  now?: () => number;
}
async function withLogLock(operation: () => Promise<boolean>): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.locks) return false;
  return navigator.locks.request(LOCK_NAME, { mode: 'exclusive' }, operation);
}
/** Advisory submission: offscreen hands events to background; failure never affects maintenance. */
export function createMaintenanceLog(dependencies: MaintenanceLogDependencies = {}) {
  const area = dependencies.area ?? browserStorage.local;
  const remote = createDiagnosticPortWriter();
  const withPermit = dependencies.withPermit ?? tryRunWithPersistenceMutationPermit;
  const withLock = dependencies.withLock ?? withLogLock;
  const now = dependencies.now ?? Date.now;
  return {
    async read() {
      const values = await area.get(MAINTENANCE_LOG_STORAGE_KEY);
      return parseMaintenanceLog(values[MAINTENANCE_LOG_STORAGE_KEY]);
    },
    async append(input: MaintenanceLogInput): Promise<boolean> {
      const entry = createMaintenanceLogEntry(input, now());
      if (!entry) return false;
      try {
        if (!dependencies.area && !browserStorage.local.isAvailable()) {
          return remote.send({ kind: 'maintenance', input: entry });
        }
        // Admit before waiting for the cross-context queue so erasure drains all admitted writes.
        return (
          (await withPermit((permit) =>
            withLock(async () => {
              const current = await area.get(MAINTENANCE_LOG_STORAGE_KEY);
              const entries = appendMaintenanceLog(
                parseMaintenanceLog(current[MAINTENANCE_LOG_STORAGE_KEY]),
                entry
              );
              const value = sanitizeStructuredDiagnosticExportData({ version: 1, entries });
              await area.set({ [MAINTENANCE_LOG_STORAGE_KEY]: value }, permit);
              return true;
            })
          )) === true
        );
      } catch {
        return false;
      }
    },
    subscribe(listener: () => void): () => void {
      if (!browserStorage.canObserveChanges()) return () => undefined;
      return browserStorage.subscribeToChanges((changes, areaName) => {
        if (areaName === 'local' && Object.hasOwn(changes, MAINTENANCE_LOG_STORAGE_KEY)) listener();
      });
    },
  };
}

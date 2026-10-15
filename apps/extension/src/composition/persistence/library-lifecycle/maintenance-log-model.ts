import type { MaintenanceDiagnosticInput } from '../../../contracts/diagnostics';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { sanitizeStructuredDiagnosticExportData } from '@sniptale/platform/observability/diagnostics/sanitizer';

const MAINTENANCE_LOG_MAX_ROWS = 512;
export const MAINTENANCE_LOG_MAX_BYTES = 256 * 1024;
export const MAINTENANCE_LOG_OPERATIONS = [
  'usage-index',
  'provenance',
  'scenario-backfill',
  'drafts',
  'trash',
  'publication-recovery',
  'orphans',
  'physical-delete',
] as const;
export const MAINTENANCE_LOG_STATUSES = [
  'started',
  'completed',
  'skipped',
  'blocked',
  'error',
  'cancelled',
] as const;
export type MaintenanceLogOperation = (typeof MAINTENANCE_LOG_OPERATIONS)[number];
type MaintenanceLogStatus = (typeof MAINTENANCE_LOG_STATUSES)[number];

const MAINTENANCE_LOG_CODES = {
  started: { status: 'started', message: 'Maintenance phase started.' },
  completed: { status: 'completed', message: 'Maintenance phase completed.' },
  failed: { status: 'error', message: 'Maintenance phase failed; remaining work was deferred.' },
  cancelled: { status: 'cancelled', message: 'Maintenance was cancelled.' },
  deleted: { status: 'completed', message: 'Unowned files were physically deleted.' },
  absent: {
    status: 'completed',
    message: 'Files were already absent; deletion intent was settled.',
  },
  adopted: {
    status: 'skipped',
    message: 'Files have owners and were retained.',
  },
  referenced: {
    status: 'blocked',
    message: 'Source documents still reference the files; deletion was deferred.',
  },
  invalid: { status: 'blocked', message: 'Retention metadata is invalid; deletion was deferred.' },
  mismatch: {
    status: 'blocked',
    message: 'Asset references and owners disagree; deletion was deferred.',
  },
  rollback: { status: 'blocked', message: 'Unfinished restore rollback retains the files.' },
  publication: { status: 'blocked', message: 'Pending publication retains the files.' },
  conflict: {
    status: 'blocked',
    message: 'The material changed after cleanup selection; deletion was skipped.',
  },
  busy: { status: 'skipped', message: 'Storage or files are busy; cleanup was deferred.' },
  empty: {
    status: 'skipped',
    message: 'No orphan candidates were found; document validation was skipped.',
  },
  'delete-failed': {
    status: 'error',
    message: 'Physical deletion failed; durable intent remains for retry.',
  },
  'moved-to-trash': {
    status: 'completed',
    message: 'Drafts were moved to Trash; their files were retained.',
  },
  expired: {
    status: 'completed',
    message: 'Expired Library materials were automatically deleted.',
  },
  'in-use': {
    status: 'blocked',
    message:
      'Material is still in use or its dependencies are uncertain; automatic deletion was skipped.',
  },
} as const satisfies Record<string, { status: MaintenanceLogStatus; message: string }>;
export type MaintenanceLogCode = keyof typeof MAINTENANCE_LOG_CODES;
export interface MaintenanceLogInput extends MaintenanceDiagnosticInput {
  operation: MaintenanceLogOperation;
  code: MaintenanceLogCode;
}
export interface MaintenanceLogEntry extends MaintenanceLogInput {
  schemaVersion: 1;
  time: string;
  lastTime: string;
  status: MaintenanceLogStatus;
  message: string;
  repeats: number;
}
const countKeys = ['candidates', 'deleted', 'moved', 'retained', 'absent', 'failed'] as const;
function metric(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000_000
  );
}
function operation(value: unknown): value is MaintenanceLogOperation {
  return MAINTENANCE_LOG_OPERATIONS.some((item) => item === value);
}
function code(value: unknown): value is MaintenanceLogCode {
  return typeof value === 'string' && Object.hasOwn(MAINTENANCE_LOG_CODES, value);
}
function timestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}
/** Reconstruct fixed messages and discard all caller-supplied content at the receiving boundary. */
export function parseMaintenanceLogInput(raw: unknown): MaintenanceLogInput | null {
  if (!isRecord(raw) || !operation(raw['operation']) || !code(raw['code'])) return null;
  if (raw['durationMs'] !== undefined && !metric(raw['durationMs'])) return null;
  const counts: NonNullable<MaintenanceLogInput['counts']> = {};
  if (raw['counts'] !== undefined) {
    if (!isRecord(raw['counts'])) return null;
    for (const key of countKeys) {
      const value = raw['counts'][key];
      if (value === undefined) continue;
      if (!metric(value)) return null;
      counts[key] = value;
    }
  }
  return {
    operation: raw['operation'],
    code: raw['code'],
    ...(raw['durationMs'] === undefined ? {} : { durationMs: raw['durationMs'] }),
    ...(Object.keys(counts).length ? { counts } : {}),
  };
}
export function createMaintenanceLogEntry(raw: unknown, now: number): MaintenanceLogEntry | null {
  const input = parseMaintenanceLogInput(raw);
  if (!input || !Number.isFinite(now) || now < 0 || now > 253402300799999) return null;
  const time = new Date(now).toISOString();
  return {
    ...input,
    ...MAINTENANCE_LOG_CODES[input.code],
    schemaVersion: 1,
    time,
    lastTime: time,
    repeats: 1,
  };
}
export function parseMaintenanceLogEntry(raw: unknown): MaintenanceLogEntry | null {
  const input = parseMaintenanceLogInput(raw);
  if (
    !input ||
    !isRecord(raw) ||
    raw['schemaVersion'] !== 1 ||
    !timestamp(raw['time']) ||
    !timestamp(raw['lastTime']) ||
    raw['lastTime'] < raw['time'] ||
    !metric(raw['repeats']) ||
    raw['repeats'] < 1
  )
    return null;
  return {
    ...input,
    ...MAINTENANCE_LOG_CODES[input.code],
    schemaVersion: 1,
    time: raw['time'],
    lastTime: raw['lastTime'],
    repeats: raw['repeats'],
  };
}
export function parseMaintenanceLog(raw: unknown): MaintenanceLogEntry[] {
  if (
    !isRecord(raw) ||
    raw['version'] !== 1 ||
    !Array.isArray(raw['entries']) ||
    raw['entries'].length > MAINTENANCE_LOG_MAX_ROWS
  )
    return [];
  return raw['entries'].flatMap((entry) => {
    const parsed = parseMaintenanceLogEntry(entry);
    return parsed ? [parsed] : [];
  });
}
export function appendMaintenanceLog(
  entries: readonly MaintenanceLogEntry[],
  entry: MaintenanceLogEntry
): MaintenanceLogEntry[] {
  const result = [...entries];
  const last = result.at(-1);
  if (
    last &&
    ['blocked', 'error', 'skipped'].includes(entry.status) &&
    entry.code === last.code &&
    entry.operation === last.operation &&
    JSON.stringify(entry.counts) === JSON.stringify(last.counts) &&
    Date.parse(entry.time) >= Date.parse(last.lastTime) &&
    Date.parse(entry.time) - Date.parse(last.lastTime) <= 60_000
  ) {
    result[result.length - 1] = {
      ...entry,
      time: last.time,
      repeats: Math.min(1_000_000_000, last.repeats + 1),
    };
  } else result.push(entry);
  while (
    result.length > MAINTENANCE_LOG_MAX_ROWS ||
    new TextEncoder().encode(JSON.stringify({ version: 1, entries: result })).byteLength >
      MAINTENANCE_LOG_MAX_BYTES
  )
    result.shift();
  return result;
}
/** JSONL export revalidates and sanitizes every row at the final user-requested export boundary. */
export function maintenanceLogJsonl(entries: readonly MaintenanceLogEntry[]): string {
  return (
    entries
      .flatMap((raw) => {
        const entry = parseMaintenanceLogEntry(raw);
        return entry ? [JSON.stringify(sanitizeStructuredDiagnosticExportData(entry))] : [];
      })
      .join('\n') + (entries.length ? '\n' : '')
  );
}

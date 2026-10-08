import {
  sanitizeDiagnosticMessage,
  sanitizeStructuredDiagnosticExportData,
} from '@sniptale/platform/observability/diagnostics/sanitizer';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { DiagnosticLogEvent } from '@sniptale/platform/observability/logger';

export const RUNTIME_LOG_LEVELS = ['debug', 'info', 'log', 'warn', 'error'] as const;
const RUNTIME_LOG_MAX_ROWS = 512;
const RUNTIME_LOG_MAX_BYTES = 256 * 1024;
export interface RuntimeLogEntry extends DiagnosticLogEvent {
  schemaVersion: 1;
  context: string;
  repeats: number;
  lastTime: string;
  dropped: number;
}
function timestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}
function level(value: unknown): value is DiagnosticLogEvent['level'] {
  return RUNTIME_LOG_LEVELS.some((entry) => entry === value);
}
function count(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000_000
  );
}
/** Revalidates persisted and exported rows, excluding arbitrary attached diagnostic payloads. */
export function parseRuntimeLogEntry(raw: unknown): RuntimeLogEntry | null {
  if (
    !isRecord(raw) ||
    raw['schemaVersion'] !== 1 ||
    !timestamp(raw['time']) ||
    !timestamp(raw['lastTime']) ||
    raw['lastTime'] < raw['time'] ||
    !level(raw['level']) ||
    !count(raw['repeats']) ||
    raw['repeats'] < 1 ||
    !count(raw['dropped'])
  )
    return null;
  if (
    typeof raw['source'] !== 'string' ||
    raw['source'].length > 120 ||
    typeof raw['context'] !== 'string' ||
    raw['context'].length > 80 ||
    typeof raw['message'] !== 'string' ||
    raw['message'].length > 1000
  )
    return null;
  return {
    schemaVersion: 1,
    time: raw['time'],
    lastTime: raw['lastTime'],
    level: raw['level'],
    source: sanitizeDiagnosticMessage(raw['source']),
    context: sanitizeDiagnosticMessage(raw['context']),
    message: sanitizeDiagnosticMessage(raw['message']),
    repeats: raw['repeats'],
    dropped: raw['dropped'],
  };
}
export function parseRuntimeLog(raw: unknown): RuntimeLogEntry[] {
  if (
    !isRecord(raw) ||
    raw['version'] !== 1 ||
    !Array.isArray(raw['entries']) ||
    raw['entries'].length > RUNTIME_LOG_MAX_ROWS
  )
    return [];
  return raw['entries'].flatMap((raw) => {
    const entry = parseRuntimeLogEntry(raw);
    return entry ? [entry] : [];
  });
}
export function appendRuntimeLog(
  current: readonly RuntimeLogEntry[],
  batch: readonly RuntimeLogEntry[]
): RuntimeLogEntry[] {
  const entries = [...current];
  for (const entry of batch) {
    const last = entries.at(-1);
    if (
      last &&
      last.context === entry.context &&
      last.source === entry.source &&
      last.level === entry.level &&
      last.message === entry.message &&
      entry.time >= last.lastTime &&
      Date.parse(entry.time) - Date.parse(last.lastTime) <= 60_000
    ) {
      entries[entries.length - 1] = {
        ...entry,
        time: last.time,
        repeats: Math.min(1_000_000_000, last.repeats + entry.repeats),
        dropped: Math.min(1_000_000_000, last.dropped + entry.dropped),
      };
    } else entries.push(entry);
  }
  const encoder = new TextEncoder();
  const sizes = entries.map((entry) => encoder.encode(JSON.stringify(entry)).byteLength);
  let bytes =
    encoder.encode(JSON.stringify({ version: 1, entries: [] })).byteLength +
    sizes.reduce((sum, size) => sum + size, 0) +
    Math.max(0, entries.length - 1);
  let start = 0;
  while (entries.length - start > RUNTIME_LOG_MAX_ROWS || bytes > RUNTIME_LOG_MAX_BYTES) {
    bytes -= sizes[start]! + (entries.length - start > 1 ? 1 : 0);
    start++;
  }
  return entries.slice(start);
}
export function runtimeLogJsonl(entries: readonly RuntimeLogEntry[]): string {
  const rows = entries.flatMap((raw) => {
    const entry = parseRuntimeLogEntry(raw);
    return entry ? [JSON.stringify(sanitizeStructuredDiagnosticExportData(entry))] : [];
  });
  return rows.length ? rows.join('\n') + '\n' : '';
}

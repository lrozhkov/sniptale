import type { DiagnosticLogEvent } from '@sniptale/platform/observability/logger';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
export const DIAGNOSTIC_LOG_PORT = 'sniptale:diagnostic-summary:v1';
/** This one-way channel accepts short summaries only, never arbitrary logger arguments. */
export function parseDiagnosticLogEvent(raw: unknown): DiagnosticLogEvent | null {
  if (
    !isRecord(raw) ||
    typeof raw['time'] !== 'string' ||
    raw['time'].length !== 24 ||
    !Number.isFinite(Date.parse(raw['time'])) ||
    new Date(raw['time']).toISOString() !== raw['time']
  )
    return null;
  if (
    typeof raw['source'] !== 'string' ||
    raw['source'].length > 120 ||
    typeof raw['message'] !== 'string' ||
    raw['message'].length > 1000
  )
    return null;
  const level = raw['level'];
  if (
    level !== 'debug' &&
    level !== 'info' &&
    level !== 'log' &&
    level !== 'warn' &&
    level !== 'error'
  )
    return null;
  return { time: raw['time'], source: raw['source'], message: raw['message'], level };
}

/** Fixed-code maintenance submissions; the receiving catalog validates operation and reason. */
export interface MaintenanceDiagnosticInput {
  operation: string;
  code: string;
  durationMs?: number;
  counts?: {
    candidates?: number;
    deleted?: number;
    retained?: number;
    absent?: number;
    failed?: number;
  };
}
export type DiagnosticPortEvent =
  | DiagnosticLogEvent
  | { kind: 'maintenance'; input: MaintenanceDiagnosticInput };

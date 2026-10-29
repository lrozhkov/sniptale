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
    moved?: number;
    retained?: number;
    absent?: number;
    failed?: number;
  };
}
export type DiagnosticPortEvent =
  | DiagnosticLogEvent
  | { kind: 'sync-queue'; input: SyncQueueDiagnosticHint }
  | { kind: 'maintenance'; input: MaintenanceDiagnosticInput };

interface SyncQueueDiagnosticHint {
  scope: { spaceId: string; connectionGeneration: number; profileCreatedAt: number };
  source: { kind: 'connection' } | { kind: 'operation'; operationId: string };
}
function diagnosticOrdinal(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function diagnosticIdentity(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256;
}
/** Admit source hints only. Background reloads every event from native persistence. */
export function parseSyncQueueDiagnosticHint(raw: unknown): SyncQueueDiagnosticHint | null {
  if (!isRecord(raw) || !isRecord(raw['scope']) || !isRecord(raw['source'])) return null;
  const scope = raw['scope'];
  const source = raw['source'];
  if (
    !diagnosticIdentity(scope['spaceId']) ||
    !diagnosticOrdinal(scope['connectionGeneration']) ||
    scope['connectionGeneration'] < 1 ||
    !diagnosticOrdinal(scope['profileCreatedAt'])
  )
    return null;
  const admittedScope = {
    spaceId: scope['spaceId'],
    connectionGeneration: scope['connectionGeneration'],
    profileCreatedAt: scope['profileCreatedAt'],
  };
  if (source['kind'] === 'connection')
    return { scope: admittedScope, source: { kind: 'connection' } };
  if (source['kind'] === 'operation' && diagnosticIdentity(source['operationId']))
    return {
      scope: admittedScope,
      source: { kind: 'operation', operationId: source['operationId'] },
    };
  return null;
}

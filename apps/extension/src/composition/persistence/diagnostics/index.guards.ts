import type {
  DiagnosticsEntry,
  DiagnosticEventChunk,
} from '@sniptale/platform/observability/diagnostics/types';

export const DIAGNOSTICS_EVENTS_PER_CHUNK = 1000;

const MAX_DIAGNOSTICS_CHUNKS = 1000;
const MAX_DIAGNOSTICS_EVENTS = DIAGNOSTICS_EVENTS_PER_CHUNK * MAX_DIAGNOSTICS_CHUNKS;
const MAX_DIAGNOSTIC_DATA_DEPTH = 6;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isIsoDateString(value: unknown): value is string {
  return isString(value) && Number.isFinite(Date.parse(value));
}

function isDiagnosticKind(
  value: unknown
): value is 'action' | 'console' | 'error' | 'meta' | 'network' {
  return (
    value === 'action' ||
    value === 'console' ||
    value === 'error' ||
    value === 'meta' ||
    value === 'network'
  );
}

function isDiagnosticLevel(value: unknown): value is 'error' | 'info' | 'log' | 'warn' {
  return value === 'error' || value === 'info' || value === 'log' || value === 'warn';
}

function isSanitizedDiagnosticData(value: unknown, depth = 0): boolean {
  if (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value === undefined || typeof value !== 'number' || Number.isFinite(value);
  }
  if (depth >= MAX_DIAGNOSTIC_DATA_DEPTH) {
    return false;
  }
  if (Array.isArray(value)) {
    return value.every((entry) => isSanitizedDiagnosticData(entry, depth + 1));
  }
  if (!isPlainRecord(value)) {
    return false;
  }
  return Object.entries(value).every(
    ([key, entry]) => isString(key) && isSanitizedDiagnosticData(entry, depth + 1)
  );
}

function parseDiagnosticEvent(value: unknown, recordingId: string) {
  if (!isRecord(value)) {
    return null;
  }
  if (
    !isString(value['id']) ||
    value['recordingId'] !== recordingId ||
    !isFiniteNumber(value['tsMs']) ||
    value['tsMs'] < 0 ||
    !isDiagnosticKind(value['kind']) ||
    !isString(value['message']) ||
    (value['level'] !== undefined && !isDiagnosticLevel(value['level'])) ||
    (value['data'] !== undefined && !isSanitizedDiagnosticData(value['data']))
  ) {
    return null;
  }

  return {
    id: value['id'],
    recordingId,
    tsMs: value['tsMs'],
    kind: value['kind'],
    message: value['message'],
    ...(value['level'] === undefined ? {} : { level: value['level'] }),
    ...(value['data'] === undefined ? {} : { data: value['data'] }),
  };
}

export function parseDiagnosticsMeta(value: unknown): DiagnosticsEntry | null {
  if (!isRecord(value) || !isRecord(value['meta'])) {
    return null;
  }
  const meta = value['meta'];
  if (
    value['schemaVersion'] !== 1 ||
    !isString(value['recordingId']) ||
    !isNonNegativeInteger(value['totalEvents']) ||
    value['totalEvents'] > MAX_DIAGNOSTICS_EVENTS ||
    !isNonNegativeInteger(value['chunksCount']) ||
    value['chunksCount'] > MAX_DIAGNOSTICS_CHUNKS ||
    value['totalEvents'] > value['chunksCount'] * DIAGNOSTICS_EVENTS_PER_CHUNK ||
    !isIsoDateString(value['createdAt']) ||
    !isString(meta['url']) ||
    !isString(meta['userAgent']) ||
    !isFiniteNumber(meta['viewportWidth']) ||
    meta['viewportWidth'] < 0 ||
    !isFiniteNumber(meta['viewportHeight']) ||
    meta['viewportHeight'] < 0 ||
    !isIsoDateString(meta['recordingStartedAt']) ||
    (meta['recordingEndedAt'] !== undefined && !isIsoDateString(meta['recordingEndedAt'])) ||
    (meta['interrupted'] !== undefined && typeof meta['interrupted'] !== 'boolean')
  ) {
    return null;
  }

  return {
    recordingId: value['recordingId'],
    schemaVersion: 1,
    totalEvents: value['totalEvents'],
    chunksCount: value['chunksCount'],
    createdAt: value['createdAt'],
    meta: {
      url: meta['url'],
      userAgent: meta['userAgent'],
      viewportWidth: meta['viewportWidth'],
      viewportHeight: meta['viewportHeight'],
      recordingStartedAt: meta['recordingStartedAt'],
      ...(meta['recordingEndedAt'] === undefined
        ? {}
        : { recordingEndedAt: meta['recordingEndedAt'] }),
      ...(meta['interrupted'] === undefined ? {} : { interrupted: meta['interrupted'] }),
    },
  };
}

export function parseDiagnosticsChunk(
  value: unknown,
  recordingId: string,
  chunkIndex: number
): DiagnosticEventChunk | null {
  if (
    !isRecord(value) ||
    value['recordingId'] !== recordingId ||
    value['chunkIndex'] !== chunkIndex ||
    !Array.isArray(value['events']) ||
    value['events'].length > DIAGNOSTICS_EVENTS_PER_CHUNK
  ) {
    return null;
  }
  const events = value['events'].map((event) => parseDiagnosticEvent(event, recordingId));
  if (events.some((event) => event === null)) {
    return null;
  }
  return {
    recordingId,
    chunkIndex,
    events: events.filter((event): event is NonNullable<typeof event> => event !== null),
  };
}

import type {
  DiagnosticEvent,
  DiagnosticMeta,
  SessionSnapshot,
} from '@sniptale/platform/observability/diagnostics/types';
import { isNumber, isRecord, isString } from '../../../contracts/messaging/validators';

function parseDiagnosticMeta(value: unknown): DiagnosticMeta | null {
  if (!isRecord(value)) {
    return null;
  }

  const recordingEndedAt = value['recordingEndedAt'];
  const interrupted = value['interrupted'];
  if (
    !isString(value['url']) ||
    !isString(value['userAgent']) ||
    !isNumber(value['viewportWidth']) ||
    !isNumber(value['viewportHeight']) ||
    !isString(value['recordingStartedAt']) ||
    !(recordingEndedAt === undefined || isString(recordingEndedAt)) ||
    !(interrupted === undefined || typeof interrupted === 'boolean')
  ) {
    return null;
  }

  const meta: DiagnosticMeta = {
    url: value['url'],
    userAgent: value['userAgent'],
    viewportWidth: value['viewportWidth'],
    viewportHeight: value['viewportHeight'],
    recordingStartedAt: value['recordingStartedAt'],
  };
  if (recordingEndedAt !== undefined) {
    meta.recordingEndedAt = recordingEndedAt;
  }
  if (interrupted !== undefined) {
    meta.interrupted = interrupted;
  }
  return meta;
}

function parseDiagnosticEvent(value: unknown): DiagnosticEvent | null {
  if (!isRecord(value)) {
    return null;
  }

  const kind = value['kind'];
  const level = value['level'];
  if (
    !isString(value['id']) ||
    !isString(value['recordingId']) ||
    !isNumber(value['tsMs']) ||
    (kind !== 'error' && kind !== 'action' && kind !== 'meta') ||
    !isString(value['message']) ||
    !(
      level === undefined ||
      level === 'error' ||
      level === 'warn' ||
      level === 'info' ||
      level === 'log'
    )
  ) {
    return null;
  }

  const event: DiagnosticEvent = {
    id: value['id'],
    recordingId: value['recordingId'],
    tsMs: value['tsMs'],
    kind,
    message: value['message'],
  };
  if (level !== undefined) {
    event.level = level;
  }
  if ('data' in value && value['data'] !== undefined) {
    event.data = value['data'];
  }
  return event;
}

function parseStoredDiagnosticSnapshot(value: unknown): SessionSnapshot | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    !isString(value['recordingId']) ||
    !isNumber(value['tabId']) ||
    !isNumber(value['startedAt']) ||
    !Array.isArray(value['events']) ||
    typeof value['isPaused'] !== 'boolean'
  ) {
    return null;
  }

  const meta = parseDiagnosticMeta(value['meta']);
  if (meta === null) {
    return null;
  }

  const events = value['events']
    .map((event) => parseDiagnosticEvent(event))
    .filter((event): event is DiagnosticEvent => event !== null);
  return {
    recordingId: value['recordingId'],
    tabId: value['tabId'],
    startedAt: value['startedAt'],
    meta,
    events,
    isPaused: value['isPaused'],
  };
}

/**
 * Parses diagnostic session snapshots from session storage.
 */
export function parseStoredDiagnosticSnapshots(value: unknown): SessionSnapshot[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => parseStoredDiagnosticSnapshot(entry))
    .filter((entry): entry is SessionSnapshot => entry !== null);
}

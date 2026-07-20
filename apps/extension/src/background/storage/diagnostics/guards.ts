import type {
  DiagnosticEvent,
  DiagnosticMeta,
  NetworkRequestData,
  SessionSnapshot,
} from '@sniptale/platform/observability/diagnostics/types';
import { isNumber, isRecord, isString } from '../../../contracts/messaging/validators';

type NetworkRequestOptionals = {
  error: unknown;
  mimeType: unknown;
  resourceType: unknown;
  responseTime: unknown;
  status: unknown;
  statusText: unknown;
};

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
    (kind !== 'console' &&
      kind !== 'network' &&
      kind !== 'error' &&
      kind !== 'action' &&
      kind !== 'meta') ||
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

function parseNetworkRequestData(value: unknown): NetworkRequestData | null {
  if (!isRecord(value)) {
    return null;
  }

  const requestId = value['requestId'];
  const url = value['url'];
  const method = value['method'];
  const requestTime = value['requestTime'];
  const optionals = readNetworkRequestOptionals(value);
  if (
    !isString(requestId) ||
    !isString(url) ||
    !isString(method) ||
    !isNumber(requestTime) ||
    !hasValidNetworkRequestOptionals(optionals)
  ) {
    return null;
  }

  const request: NetworkRequestData = {
    requestId,
    url,
    method,
    requestTime,
  };
  appendNetworkRequestOptionals(request, optionals);
  return request;
}

function readNetworkRequestOptionals(value: Record<string, unknown>): NetworkRequestOptionals {
  return {
    error: value['error'],
    mimeType: value['mimeType'],
    resourceType: value['resourceType'],
    responseTime: value['responseTime'],
    status: value['status'],
    statusText: value['statusText'],
  };
}

function hasValidNetworkRequestOptionals(fields: NetworkRequestOptionals): boolean {
  return (
    (fields.status === undefined || isNumber(fields.status)) &&
    (fields.statusText === undefined || isString(fields.statusText)) &&
    (fields.responseTime === undefined || isNumber(fields.responseTime)) &&
    (fields.mimeType === undefined || isString(fields.mimeType)) &&
    (fields.error === undefined || isString(fields.error)) &&
    (fields.resourceType === undefined || isString(fields.resourceType))
  );
}

function appendNetworkRequestOptionals(
  request: NetworkRequestData,
  fields: NetworkRequestOptionals
): void {
  if (isNumber(fields.status)) {
    request.status = fields.status;
  }
  if (isString(fields.statusText)) {
    request.statusText = fields.statusText;
  }
  if (isNumber(fields.responseTime)) {
    request.responseTime = fields.responseTime;
  }
  if (isString(fields.mimeType)) {
    request.mimeType = fields.mimeType;
  }
  if (isString(fields.error)) {
    request.error = fields.error;
  }
  if (isString(fields.resourceType)) {
    request.resourceType = fields.resourceType;
  }
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
    !Array.isArray(value['pendingNetworkRequests']) ||
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
  const pendingNetworkRequests = value['pendingNetworkRequests']
    .map((request) => parseNetworkRequestData(request))
    .filter((request): request is NetworkRequestData => request !== null);

  return {
    recordingId: value['recordingId'],
    tabId: value['tabId'],
    startedAt: value['startedAt'],
    meta,
    events,
    pendingNetworkRequests,
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

import {
  sanitizeDiagnosticData,
  sanitizeDiagnosticMessage,
  sanitizeDiagnosticUrl,
} from './sanitizer.core.ts';
import type { DiagnosticEvent, DiagnosticMeta, NetworkRequestData } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function sanitizeDiagnosticsMeta(meta: DiagnosticMeta): DiagnosticMeta {
  const sanitizedMeta: DiagnosticMeta = {
    url: sanitizeDiagnosticUrl(meta.url) ?? meta.url,
    userAgent: sanitizeDiagnosticMessage(meta.userAgent),
    viewportWidth: meta.viewportWidth,
    viewportHeight: meta.viewportHeight,
    recordingStartedAt: sanitizeDiagnosticMessage(meta.recordingStartedAt),
  };

  if (meta.recordingEndedAt !== undefined) {
    sanitizedMeta.recordingEndedAt = sanitizeDiagnosticMessage(meta.recordingEndedAt);
  }
  if (meta.interrupted !== undefined) {
    sanitizedMeta.interrupted = meta.interrupted;
  }

  return sanitizedMeta;
}

function isNetworkRequestData(value: unknown): value is NetworkRequestData {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value['requestId'] === 'string' &&
    typeof value['url'] === 'string' &&
    typeof value['method'] === 'string' &&
    typeof value['requestTime'] === 'number'
  );
}

export function sanitizeNetworkRequestData(request: NetworkRequestData): NetworkRequestData {
  const sanitizedRequest: NetworkRequestData = {
    requestId: request.requestId,
    url: sanitizeDiagnosticUrl(request.url) ?? request.url,
    method: sanitizeDiagnosticMessage(request.method),
    requestTime: request.requestTime,
  };

  if (request.status !== undefined) {
    sanitizedRequest.status = request.status;
  }
  if (request.statusText !== undefined) {
    sanitizedRequest.statusText = sanitizeDiagnosticMessage(request.statusText);
  }
  if (request.responseTime !== undefined) {
    sanitizedRequest.responseTime = request.responseTime;
  }
  if (request.error !== undefined) {
    sanitizedRequest.error = sanitizeDiagnosticMessage(request.error);
  }
  if (request.mimeType !== undefined) {
    sanitizedRequest.mimeType = sanitizeDiagnosticMessage(request.mimeType);
  }
  if (request.resourceType !== undefined) {
    sanitizedRequest.resourceType = sanitizeDiagnosticMessage(request.resourceType);
  }

  return sanitizedRequest;
}

function sanitizeDiagnosticEventData(data: unknown): unknown {
  return isNetworkRequestData(data)
    ? sanitizeNetworkRequestData(data)
    : sanitizeDiagnosticData(data);
}

function sanitizeDiagnosticsEvent(event: DiagnosticEvent): DiagnosticEvent {
  const sanitizedEvent: DiagnosticEvent = {
    id: event.id,
    recordingId: event.recordingId,
    tsMs: event.tsMs,
    kind: event.kind,
    message: sanitizeDiagnosticMessage(event.message),
  };

  if (event.level !== undefined) {
    sanitizedEvent.level = event.level;
  }
  if (event.data !== undefined) {
    sanitizedEvent.data = sanitizeDiagnosticEventData(event.data);
  }

  return sanitizedEvent;
}

export function sanitizeDiagnosticsEvents(events: DiagnosticEvent[]): DiagnosticEvent[] {
  return events.map(sanitizeDiagnosticsEvent);
}

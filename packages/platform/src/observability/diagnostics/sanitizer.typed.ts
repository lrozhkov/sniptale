import {
  sanitizeDiagnosticData,
  sanitizeDiagnosticMessage,
  sanitizeDiagnosticUrl,
} from './sanitizer.core.ts';
import type { DiagnosticEvent, DiagnosticMeta } from './types';

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
    sanitizedEvent.data = sanitizeDiagnosticData(event.data);
  }

  return sanitizedEvent;
}

export function sanitizeDiagnosticsEvents(events: DiagnosticEvent[]): DiagnosticEvent[] {
  return events.map(sanitizeDiagnosticsEvent);
}

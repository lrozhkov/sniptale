import type {
  ActiveDiagnosticsSession,
  NetworkRequestData,
} from '@sniptale/platform/observability/diagnostics/types';
import {
  sanitizeDiagnosticMessage,
  sanitizeNetworkRequestData,
  sanitizeDiagnosticUrl,
} from '@sniptale/platform/observability/diagnostics/sanitizer';
import { diagnosticsLogger } from './logger';
import { buildConsoleEventMessage, sanitizeStackTraceFrames } from './cdp.helpers';
import type {
  ConsoleAPICalledEvent,
  ExceptionThrownEvent,
  LoadingFailedEvent,
  MaybeFlush,
  RequestWillBeSentEvent,
  ResponseReceivedEvent,
} from './cdp.types';
import { mapConsoleType } from './cdp.types';

export function appendConsoleEvent(
  session: ActiveDiagnosticsSession,
  tsMs: number,
  params: ConsoleAPICalledEvent,
  maybeFlush: MaybeFlush
): void {
  const level = mapConsoleType(params.type);

  session.events.push({
    id: crypto.randomUUID(),
    recordingId: session.recordingId,
    tsMs,
    kind: 'console',
    level,
    message: buildConsoleEventMessage(params.args),
    data: {
      argCount: params.args.length,
      stackTrace: sanitizeStackTraceFrames(params.stackTrace?.callFrames, 5),
    },
  });

  maybeFlush(session);
}

export function appendExceptionEvent(
  session: ActiveDiagnosticsSession,
  tsMs: number,
  params: ExceptionThrownEvent,
  maybeFlush: MaybeFlush
): void {
  const details = params.exceptionDetails;

  session.events.push({
    id: crypto.randomUUID(),
    recordingId: session.recordingId,
    tsMs,
    kind: 'error',
    level: 'error',
    message: sanitizeDiagnosticMessage(
      details.text || details.exception?.description || 'Unknown error'
    ),
    data: {
      exception: details.exception?.description
        ? sanitizeDiagnosticMessage(details.exception.description)
        : undefined,
      stackTrace: sanitizeStackTraceFrames(details.stackTrace?.callFrames, 10),
      lineNumber: details.lineNumber,
      columnNumber: details.columnNumber,
      url: sanitizeDiagnosticUrl(details.url),
    },
  });

  maybeFlush(session);
}

export function appendPendingNetworkRequest(
  session: ActiveDiagnosticsSession,
  tsMs: number,
  params: RequestWillBeSentEvent
): void {
  const requestData: NetworkRequestData = {
    requestId: params.requestId,
    url: sanitizeDiagnosticUrl(params.request.url) ?? params.request.url,
    method: params.request.method,
    requestTime: tsMs,
    ...(params.type === undefined ? {} : { resourceType: params.type }),
  };

  session.pendingNetworkRequests.set(params.requestId, requestData);
}

export function appendNetworkResponseEvent(
  session: ActiveDiagnosticsSession,
  tsMs: number,
  params: ResponseReceivedEvent,
  maybeFlush: MaybeFlush
): void {
  const pending = session.pendingNetworkRequests.get(params.requestId);
  if (!pending) {
    return;
  }

  pending.responseTime = tsMs;
  pending.status = params.response.status;
  if (params.response.statusText) {
    pending.statusText = sanitizeDiagnosticMessage(params.response.statusText);
  }
  if (params.response.mimeType) {
    pending.mimeType = params.response.mimeType;
  }

  const sanitizedPending = sanitizeNetworkRequestData(pending);
  session.events.push({
    id: crypto.randomUUID(),
    recordingId: session.recordingId,
    tsMs: pending.requestTime,
    kind: 'network',
    message: `${sanitizedPending.method} ${sanitizedPending.url}`,
    level: pending.status >= 400 ? 'error' : 'info',
    data: sanitizedPending,
  });

  session.pendingNetworkRequests.delete(params.requestId);
  maybeFlush(session);
}

export function appendNetworkFailureEvent(
  session: ActiveDiagnosticsSession,
  params: LoadingFailedEvent,
  maybeFlush: MaybeFlush
): void {
  const pending = session.pendingNetworkRequests.get(params.requestId);
  if (!pending) {
    return;
  }

  if (params.errorText) {
    pending.error = sanitizeDiagnosticMessage(params.errorText);
  }

  const sanitizedPending = sanitizeNetworkRequestData(pending);
  session.events.push({
    id: crypto.randomUUID(),
    recordingId: session.recordingId,
    tsMs: pending.requestTime,
    kind: 'network',
    level: 'error',
    message: `${sanitizedPending.method} ${sanitizedPending.url} FAILED`,
    data: sanitizedPending,
  });

  session.pendingNetworkRequests.delete(params.requestId);
  maybeFlush(session);
}

export function appendNavigationEvent(session: ActiveDiagnosticsSession, newUrl?: string): void {
  const tsMs = performance.now() - session.startedAt;

  session.events.push({
    id: crypto.randomUUID(),
    recordingId: session.recordingId,
    tsMs,
    kind: 'meta',
    message: 'Page navigation/reload',
    data: { newUrl: sanitizeDiagnosticUrl(newUrl) },
  });

  session.pendingNetworkRequests.clear();
  diagnosticsLogger.debug('Recorded navigation event', { recordingId: session.recordingId });
}

export function appendForcedDetachEvent(session: ActiveDiagnosticsSession): void {
  const tsMs = performance.now() - session.startedAt;

  session.events.push({
    id: crypto.randomUUID(),
    recordingId: session.recordingId,
    tsMs,
    kind: 'meta',
    message: 'Debugger forcibly detached',
  });

  session.pendingNetworkRequests.clear();
  diagnosticsLogger.debug('Recorded forced detach event', { recordingId: session.recordingId });
}

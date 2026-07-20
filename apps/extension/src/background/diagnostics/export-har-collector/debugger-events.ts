import {
  createPendingHarEntry,
  finalizeHarEntry,
  buildSessionHarHeaders,
  type ExportHarSession,
} from './helpers';
import {
  isLoadingFailedEvent,
  isLoadingFinishedEvent,
  isRequestWillBeSentEvent,
  isResponseReceivedEvent,
} from './events';
import { getExportHarSessionForSource } from './session-state';
import { acquireDiagnosticsMutationPermit } from '../lifecycle-gate';

export function handleExportHarDebuggerEvent(
  source: chrome.debugger.Debuggee,
  method: string,
  params: unknown
): void {
  const releaseMutation = acquireDiagnosticsMutationPermit();
  if (!releaseMutation) {
    return;
  }
  try {
    handleExportHarDebuggerEventWithPermit(source, method, params);
  } finally {
    releaseMutation();
  }
}

function handleExportHarDebuggerEventWithPermit(
  source: chrome.debugger.Debuggee,
  method: string,
  params: unknown
): void {
  const session = getExportHarSessionForSource(source);
  if (!session) {
    return;
  }

  if (method === 'Network.requestWillBeSent') {
    handleRequestWillBeSent(session, params);
    return;
  }

  if (method === 'Network.responseReceived') {
    handleResponseReceived(session, params);
    return;
  }

  if (method === 'Network.loadingFinished') {
    handleLoadingFinished(session, params);
    return;
  }

  if (method === 'Network.loadingFailed') {
    handleLoadingFailed(session, params);
  }
}

function handleRequestWillBeSent(session: ExportHarSession, params: unknown): void {
  if (!isRequestWillBeSentEvent(params)) {
    return;
  }

  session.pendingEntries.set(params.requestId, createPendingHarEntry(session, params));
}

function handleResponseReceived(session: ExportHarSession, params: unknown): void {
  if (!isResponseReceivedEvent(params)) {
    return;
  }

  const entry = session.pendingEntries.get(params.requestId);
  if (!entry) {
    return;
  }

  entry.response.status = params.response.status;
  entry.response.statusText = params.response.statusText;
  entry.response.httpVersion = params.response.protocol || 'HTTP/1.1';
  entry.response.headers = buildSessionHarHeaders(session, params.response.headers);
  entry.response.content.mimeType = params.response.mimeType || '';
}

function handleLoadingFinished(session: ExportHarSession, params: unknown): void {
  if (!isLoadingFinishedEvent(params)) {
    return;
  }

  finalizeHarEntry(session, params.requestId, undefined, params.encodedDataLength ?? -1);
}

function handleLoadingFailed(session: ExportHarSession, params: unknown): void {
  if (!isLoadingFailedEvent(params)) {
    return;
  }

  finalizeHarEntry(session, params.requestId, params.errorText || 'loading_failed');
}

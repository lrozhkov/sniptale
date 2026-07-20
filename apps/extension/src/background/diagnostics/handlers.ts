import type { DiagnosticEventFromCS } from '@sniptale/platform/observability/diagnostics/types';
import { appendForcedDetachEvent, appendNavigationEvent, processDebuggerEvent } from './cdp';
import { diagnosticsLogger } from './logger';
import {
  getActiveRecordingId as getActiveRecordingIdForTab,
  getDiagnosticsSession,
  getDiagnosticsSessionByTabId,
  maybeFlushDiagnosticsSession,
} from './state';
import { createContentScriptDiagnosticEvent } from './helpers';
import { acquireDiagnosticsMutationPermit } from './lifecycle-gate';

function runAdmittedDiagnosticsMutation(operation: () => void): void {
  const releaseMutation = acquireDiagnosticsMutationPermit();
  if (!releaseMutation) {
    return;
  }
  try {
    operation();
  } finally {
    releaseMutation();
  }
}

export function handleEventFromContentScript(
  message: DiagnosticEventFromCS,
  senderTabId: number
): void {
  runAdmittedDiagnosticsMutation(() =>
    handleEventFromContentScriptWithPermit(message, senderTabId)
  );
}

function handleEventFromContentScriptWithPermit(
  message: DiagnosticEventFromCS,
  senderTabId: number
): void {
  const recordingId = getActiveRecordingIdForTab(senderTabId);
  if (!recordingId) {
    diagnosticsLogger.warn('Ignoring content diagnostic event without active session', {
      senderTabId,
    });
    return;
  }

  const session = getDiagnosticsSession(recordingId);
  if (!session || session.isPaused) {
    return;
  }

  session.events.push(
    createContentScriptDiagnosticEvent({
      message,
      nowMs: performance.now(),
      recordingId,
      startedAt: session.startedAt,
    })
  );
  maybeFlushDiagnosticsSession(session);
}

export function handleDebuggerEvent(
  source: chrome.debugger.Debuggee,
  method: string,
  params: unknown
): void {
  runAdmittedDiagnosticsMutation(() => {
    processDebuggerEvent({
      source,
      method,
      params,
      resolveRecordingId: getActiveRecordingIdForTab,
      getSession: getDiagnosticsSession,
      maybeFlush: maybeFlushDiagnosticsSession,
    });
  });
}

export function handleTabNavigation(tabId: number, newUrl?: string): void {
  runAdmittedDiagnosticsMutation(() => handleTabNavigationWithPermit(tabId, newUrl));
}

function handleTabNavigationWithPermit(tabId: number, newUrl?: string): void {
  const session = getDiagnosticsSessionByTabId(tabId);
  if (!session || session.isPaused) {
    return;
  }

  appendNavigationEvent(session, newUrl);
}

export function handleForcedDetach(tabId: number): void {
  runAdmittedDiagnosticsMutation(() => handleForcedDetachWithPermit(tabId));
}

function handleForcedDetachWithPermit(tabId: number): void {
  const session = getDiagnosticsSessionByTabId(tabId);
  if (!session) {
    return;
  }

  appendForcedDetachEvent(session);
}

export function getActiveRecordingId(tabId: number): string | undefined {
  return getActiveRecordingIdForTab(tabId);
}

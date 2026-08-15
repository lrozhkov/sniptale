import type { DiagnosticEventFromCS } from '@sniptale/platform/observability/diagnostics/types';
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

export function handleTabNavigation(tabId: number, newUrl?: string): void {
  runAdmittedDiagnosticsMutation(() => handleTabNavigationWithPermit(tabId, newUrl));
}

function handleTabNavigationWithPermit(tabId: number, newUrl?: string): void {
  const session = getDiagnosticsSessionByTabId(tabId);
  if (!session || session.isPaused) {
    return;
  }

  session.events.push({
    id: crypto.randomUUID(),
    recordingId: session.recordingId,
    tsMs: performance.now() - session.startedAt,
    kind: 'meta',
    message: 'Page navigation',
    ...(newUrl === undefined ? {} : { data: { url: newUrl } }),
  });
  maybeFlushDiagnosticsSession(session);
}

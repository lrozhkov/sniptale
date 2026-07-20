import type { ActiveDiagnosticsSession } from '@sniptale/platform/observability/diagnostics/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { diagnosticsLogger } from './logger';
import { acquireDiagnosticsMutationPermit } from './lifecycle-gate';
import {
  getDiagnosticsSession,
  hasActiveDiagnosticsSession,
  registerDiagnosticsSession,
  startDiagnosticsFlushLoop,
} from './state';
import {
  buildDiagnosticMeta,
  cleanupDiagnosticsSession,
  createDiagnosticsSession,
  finalizeSessionMeta,
  persistDiagnosticsSession,
} from './session';
import {
  enableDiagnosticsForSession,
  notifyDiagnosticLogger,
  resolveTabUrl,
  restoreOrGetSession,
  shutDownDiagnosticsSession,
} from './runtime';

export { handleDebuggerEvent, handleForcedDetach, handleTabNavigation } from './handlers';
export { recoverInterruptedSessions } from './recovery';
export { resetDiagnosticsStateForLocalDataErasure } from './state';

/**
 * Starts diagnostics collection for a recording.
 */
export async function startDiagnostics(
  recordingId: string,
  tabId: number,
  viewport: { width: number; height: number }
): Promise<void> {
  const releaseMutation = acquireDiagnosticsMutationPermit();
  if (!releaseMutation) {
    diagnosticsLogger.warn('Diagnostics start rejected during local data erasure');
    return;
  }

  try {
    await startDiagnosticsWithPermit(recordingId, tabId, viewport);
  } finally {
    releaseMutation();
  }
}

async function startDiagnosticsWithPermit(
  recordingId: string,
  tabId: number,
  viewport: { width: number; height: number }
): Promise<void> {
  diagnosticsLogger.log('Starting diagnostics collection', { recordingId, tabId });

  if (hasActiveDiagnosticsSession(recordingId)) {
    diagnosticsLogger.warn('Diagnostics session already exists', { recordingId });
    return;
  }

  const url = await resolveTabUrl(tabId);
  const meta = buildDiagnosticMeta(url, viewport);
  const session = createDiagnosticsSession(recordingId, tabId, meta);

  registerDiagnosticsSession(session);
  await enableDiagnosticsForSession(tabId, recordingId);
  startDiagnosticsFlushLoop();
  await notifyDiagnosticLogger(tabId, VideoMessageType.ENABLE_DIAGNOSTIC_LOGGER, recordingId);

  diagnosticsLogger.debug('Started diagnostics collection', { recordingId });
}

/**
 * Pauses diagnostics collection when recording stops.
 */
export function pauseDiagnosticsCollection(recordingId: string): void {
  const releaseMutation = acquireDiagnosticsMutationPermit();
  if (!releaseMutation) {
    return;
  }
  try {
    const session = getDiagnosticsSession(recordingId);
    if (!session) {
      return;
    }

    session.isPaused = true;
    diagnosticsLogger.debug('Paused diagnostics collection', { recordingId });
  } finally {
    releaseMutation();
  }
}

/**
 * Stops diagnostics and saves the session to IndexedDB.
 */
export async function stopDiagnostics(recordingId: string): Promise<void> {
  const releaseMutation = acquireDiagnosticsMutationPermit();
  if (!releaseMutation) {
    diagnosticsLogger.warn('Diagnostics stop persistence rejected during local data erasure');
    return;
  }

  try {
    await stopDiagnosticsWithPermit(recordingId);
  } finally {
    releaseMutation();
  }
}

async function stopDiagnosticsWithPermit(recordingId: string): Promise<void> {
  diagnosticsLogger.log('Stopping diagnostics collection', { recordingId });

  const session = await restoreOrGetSession(recordingId);
  if (!session) {
    diagnosticsLogger.warn('No diagnostics session found during stop', { recordingId });
    return;
  }

  await finalizeAndPersistSession(recordingId, session);
  await shutDownDiagnosticsSession(session);
  await cleanupDiagnosticsSession(recordingId, session);

  diagnosticsLogger.debug('Stopped diagnostics collection', { recordingId });
}

async function finalizeAndPersistSession(
  recordingId: string,
  session: ActiveDiagnosticsSession
): Promise<void> {
  finalizeSessionMeta(session);
  const saved = await persistDiagnosticsSession(session, recordingId);
  if (!saved) {
    throw new Error(`Failed to persist diagnostics session ${recordingId}`);
  }
}

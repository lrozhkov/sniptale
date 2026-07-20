import {
  sanitizeDiagnosticsEvents,
  sanitizeDiagnosticsMeta,
} from '@sniptale/platform/observability/diagnostics/sanitizer';
import type { SessionSnapshot } from '@sniptale/platform/observability/diagnostics/types';
import { saveDiagnostics } from '../../composition/persistence/diagnostics/index';
import { acquireDiagnosticsMutationPermit } from './lifecycle-gate';
import { diagnosticsLogger } from './logger';
import {
  clearStoredDiagnosticSnapshots,
  readStoredDiagnosticSnapshots,
  replaceStoredDiagnosticSnapshots,
} from '../storage/diagnostics/active-sessions';

function sanitizeInterruptedSnapshot(snapshot: SessionSnapshot) {
  const interruptedMeta = {
    ...snapshot.meta,
    interrupted: true,
  };

  return {
    sanitizedEvents: sanitizeDiagnosticsEvents(snapshot.events),
    sanitizedMeta: sanitizeDiagnosticsMeta(interruptedMeta),
  };
}

async function saveInterruptedSnapshot(snapshot: SessionSnapshot): Promise<number> {
  const { sanitizedEvents, sanitizedMeta } = sanitizeInterruptedSnapshot(snapshot);
  await saveDiagnostics(
    {
      recordingId: snapshot.recordingId,
      schemaVersion: 1,
      meta: sanitizedMeta,
      createdAt: new Date().toISOString(),
    },
    sanitizedEvents
  );
  return sanitizedEvents.length;
}

/**
 * Recovers interrupted sessions from session storage.
 */
export async function recoverInterruptedSessions(): Promise<void> {
  const releaseMutation = acquireDiagnosticsMutationPermit();
  if (!releaseMutation) {
    diagnosticsLogger.debug('Skipped interrupted diagnostics recovery during local data erasure');
    return;
  }

  try {
    await recoverInterruptedSessionsWithPermit();
  } finally {
    releaseMutation();
  }
}

async function recoverInterruptedSessionsWithPermit(): Promise<void> {
  diagnosticsLogger.debug('Checking for interrupted diagnostics sessions');

  const snapshots = await readStoredDiagnosticSnapshots();
  if (snapshots.length === 0) {
    diagnosticsLogger.debug('No interrupted diagnostics sessions found');
    return;
  }

  diagnosticsLogger.log('Recovering interrupted diagnostics sessions', {
    sessionCount: snapshots.length,
  });
  const failedSnapshots: SessionSnapshot[] = [];

  for (const snapshot of snapshots) {
    try {
      const eventCount = await saveInterruptedSnapshot(snapshot);
      diagnosticsLogger.log('Recovered interrupted diagnostics session', {
        eventCount,
        recordingId: snapshot.recordingId,
      });
    } catch (error) {
      failedSnapshots.push(snapshot);
      diagnosticsLogger.error(
        `Failed to recover interrupted diagnostics session ${snapshot.recordingId}`,
        error
      );
    }
  }

  if (failedSnapshots.length === 0) {
    await clearStoredDiagnosticSnapshots();
    return;
  }

  await replaceStoredDiagnosticSnapshots(failedSnapshots);
}

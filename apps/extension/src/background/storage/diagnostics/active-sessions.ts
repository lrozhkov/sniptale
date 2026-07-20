import type {
  ActiveDiagnosticsSession,
  SessionSnapshot,
} from '@sniptale/platform/observability/diagnostics/types';
import { browserStorage } from '../../../composition/persistence/infrastructure/browser-storage';
import {
  sanitizeDiagnosticsEvents,
  sanitizeDiagnosticsMeta,
  sanitizeNetworkRequestData,
} from '@sniptale/platform/observability/diagnostics/sanitizer';
import { createLogger } from '@sniptale/platform/observability/logger';
import { parseStoredDiagnosticSnapshots } from './guards';

const SESSION_STORAGE_KEY = 'diagnostics-active-sessions';
const logger = createLogger({ namespace: 'BackgroundDiagnosticsStorage' });

function createDiagnosticsSnapshot(session: ActiveDiagnosticsSession): SessionSnapshot {
  return {
    recordingId: session.recordingId,
    tabId: session.tabId,
    startedAt: session.startedAt,
    meta: session.meta,
    events: session.events,
    pendingNetworkRequests: Array.from(session.pendingNetworkRequests.values()),
    isPaused: session.isPaused,
  };
}

function sanitizeDiagnosticsSnapshot(snapshot: SessionSnapshot): SessionSnapshot {
  return {
    recordingId: snapshot.recordingId,
    tabId: snapshot.tabId,
    startedAt: snapshot.startedAt,
    meta: sanitizeDiagnosticsMeta(snapshot.meta),
    events: sanitizeDiagnosticsEvents(snapshot.events),
    pendingNetworkRequests: snapshot.pendingNetworkRequests.map(sanitizeNetworkRequestData),
    isPaused: snapshot.isPaused,
  };
}

function hydrateDiagnosticsSession(snapshot: SessionSnapshot): ActiveDiagnosticsSession {
  return {
    ...snapshot,
    pendingNetworkRequests: new Map(
      snapshot.pendingNetworkRequests.map((request) => [request.requestId, request])
    ),
  };
}

async function readDiagnosticSnapshotsFromStorage(): Promise<SessionSnapshot[]> {
  const stored = await browserStorage.session.get(SESSION_STORAGE_KEY);
  return parseStoredDiagnosticSnapshots(stored[SESSION_STORAGE_KEY]);
}

async function writeDiagnosticSnapshotsToStorage(snapshots: SessionSnapshot[]): Promise<void> {
  if (snapshots.length === 0) {
    await browserStorage.session.remove(SESSION_STORAGE_KEY);
    return;
  }

  await browserStorage.session.set({
    [SESSION_STORAGE_KEY]: snapshots.map((snapshot) => sanitizeDiagnosticsSnapshot(snapshot)),
  });
}

export async function saveActiveDiagnosticsSessionsToStorage(
  sessions: Iterable<ActiveDiagnosticsSession>
): Promise<void> {
  const snapshots = Array.from(sessions, createDiagnosticsSnapshot);
  await writeDiagnosticSnapshotsToStorage(snapshots);
  logger.debug('Saved active diagnostics sessions to storage', {
    sessionCount: snapshots.length,
  });
}

export async function restoreStoredDiagnosticsSession(
  recordingId: string
): Promise<ActiveDiagnosticsSession | null> {
  const snapshots = await readDiagnosticSnapshotsFromStorage();
  const snapshot = snapshots.find((item) => item.recordingId === recordingId);
  return snapshot ? hydrateDiagnosticsSession(snapshot) : null;
}

export async function clearDiagnosticsSessionFromStorage(recordingId: string): Promise<void> {
  const snapshots = await readDiagnosticSnapshotsFromStorage();
  const filteredSnapshots = snapshots.filter((item) => item.recordingId !== recordingId);

  await writeDiagnosticSnapshotsToStorage(filteredSnapshots);
}

export async function readStoredDiagnosticSnapshots(): Promise<SessionSnapshot[]> {
  return readDiagnosticSnapshotsFromStorage();
}

export async function clearStoredDiagnosticSnapshots(): Promise<void> {
  await browserStorage.session.remove(SESSION_STORAGE_KEY);
}

export async function replaceStoredDiagnosticSnapshots(
  snapshots: SessionSnapshot[]
): Promise<void> {
  await writeDiagnosticSnapshotsToStorage(snapshots);
}

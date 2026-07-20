import type {
  ActiveDiagnosticsSession,
  DiagnosticMeta,
} from '@sniptale/platform/observability/diagnostics/types';
import {
  sanitizeDiagnosticUrl,
  sanitizeDiagnosticsEvents,
  sanitizeDiagnosticsMeta,
} from '@sniptale/platform/observability/diagnostics/sanitizer';
import { saveDiagnostics } from '../../composition/persistence/diagnostics/index';
import {
  hasActiveDiagnosticsSessions,
  stopDiagnosticsFlushLoop,
  unregisterDiagnosticsSession,
} from './state';
import { diagnosticsLogger } from './logger';
import { clearDiagnosticsSessionFromStorage } from '../storage/diagnostics/active-sessions';

export function buildDiagnosticMeta(
  url: string,
  viewport: { width: number; height: number }
): DiagnosticMeta {
  return {
    url: sanitizeDiagnosticUrl(url) ?? url,
    userAgent: navigator.userAgent,
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    recordingStartedAt: new Date().toISOString(),
  };
}

export function createDiagnosticsSession(
  recordingId: string,
  tabId: number,
  meta: DiagnosticMeta
): ActiveDiagnosticsSession {
  return {
    recordingId,
    tabId,
    startedAt: performance.now(),
    meta,
    events: [],
    pendingNetworkRequests: new Map(),
    isPaused: false,
  };
}

export function finalizeSessionMeta(session: ActiveDiagnosticsSession): void {
  session.meta.recordingEndedAt = new Date().toISOString();
  const duration = performance.now() - session.startedAt;
  session.events.push({
    id: crypto.randomUUID(),
    recordingId: session.recordingId,
    tsMs: duration,
    kind: 'meta',
    message: 'Recording ended',
    data: { duration: Math.round(duration / 1000) },
  });
}

export async function persistDiagnosticsSession(
  session: ActiveDiagnosticsSession,
  recordingId: string
): Promise<boolean> {
  diagnosticsLogger.debug('Persisting diagnostics session', {
    eventCount: session.events.length,
    recordingId,
  });

  try {
    const sanitizedMeta = sanitizeDiagnosticsMeta(session.meta);
    const sanitizedEvents = sanitizeDiagnosticsEvents(session.events);

    await saveDiagnostics(
      {
        recordingId,
        schemaVersion: 1,
        meta: sanitizedMeta,
        createdAt: new Date().toISOString(),
      },
      sanitizedEvents
    );
    diagnosticsLogger.log('Saved diagnostics session', {
      eventCount: sanitizedEvents.length,
      recordingId,
    });
    return true;
  } catch (error) {
    diagnosticsLogger.error('Failed to persist diagnostics session to IndexedDB', error);
    return false;
  }
}

export async function cleanupDiagnosticsSession(
  recordingId: string,
  session: ActiveDiagnosticsSession
): Promise<void> {
  unregisterDiagnosticsSession(recordingId, session.tabId);
  await clearDiagnosticsSessionFromStorage(recordingId);

  if (!hasActiveDiagnosticsSessions()) {
    stopDiagnosticsFlushLoop();
  }
}

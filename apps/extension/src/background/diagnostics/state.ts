import type { ActiveDiagnosticsSession } from '@sniptale/platform/observability/diagnostics/types';
import { createLazyDefaultOwner } from '@sniptale/foundation/default-owner';
import { diagnosticsLogger } from './logger';
import { acquireDiagnosticsMutationPermit } from './lifecycle-gate';
import { saveActiveDiagnosticsSessionsToStorage } from '../storage/diagnostics/active-sessions';

const FLUSH_INTERVAL_MS = 3000;
const EVENTS_BEFORE_FLUSH = 500;

type DiagnosticsCollectorState = {
  activeSessions: Map<string, ActiveDiagnosticsSession>;
  flushInFlight: Promise<void> | null;
  flushRequestedWhileBusy: boolean;
  tabToRecording: Map<number, string>;
  flushIntervalId: ReturnType<typeof setInterval> | null;
};

function createDiagnosticsSessionRegistry(state: DiagnosticsCollectorState) {
  function hasActiveDiagnosticsSession(recordingId: string): boolean {
    return state.activeSessions.has(recordingId);
  }

  function registerDiagnosticsSession(session: ActiveDiagnosticsSession): void {
    state.activeSessions.set(session.recordingId, session);
    state.tabToRecording.set(session.tabId, session.recordingId);
  }

  function unregisterDiagnosticsSession(recordingId: string, tabId: number): void {
    state.activeSessions.delete(recordingId);
    state.tabToRecording.delete(tabId);
  }

  function getDiagnosticsSession(recordingId: string): ActiveDiagnosticsSession | undefined {
    return state.activeSessions.get(recordingId);
  }

  function getDiagnosticsSessionByTabId(tabId: number): ActiveDiagnosticsSession | undefined {
    const recordingId = state.tabToRecording.get(tabId);
    if (!recordingId) {
      return undefined;
    }

    return state.activeSessions.get(recordingId);
  }

  function getActiveRecordingId(tabId: number): string | undefined {
    return state.tabToRecording.get(tabId);
  }

  function hasActiveDiagnosticsSessions(): boolean {
    return state.activeSessions.size > 0;
  }

  return {
    hasActiveDiagnosticsSession,
    registerDiagnosticsSession,
    unregisterDiagnosticsSession,
    getDiagnosticsSession,
    getDiagnosticsSessionByTabId,
    getActiveRecordingId,
    hasActiveDiagnosticsSessions,
    listActiveDiagnosticsSessions: () => [...state.activeSessions.values()],
  };
}

function createDiagnosticsPersistence(state: DiagnosticsCollectorState) {
  async function saveSessionsToStorage(): Promise<void> {
    await saveActiveDiagnosticsSessionsToStorage(state.activeSessions.values());
  }

  function flushDiagnosticsSessions(): Promise<void> {
    if (state.activeSessions.size === 0) {
      return Promise.resolve();
    }

    if (state.flushInFlight) {
      state.flushRequestedWhileBusy = true;
      return state.flushInFlight;
    }

    const releaseMutation = acquireDiagnosticsMutationPermit();
    if (!releaseMutation) {
      return Promise.resolve();
    }

    const nextFlush = saveSessionsToStorage()
      .catch((error) => {
        diagnosticsLogger.error('Failed to flush diagnostics sessions', error);
      })
      .finally(() => {
        const shouldFlushAgain = state.flushRequestedWhileBusy && state.activeSessions.size > 0;
        state.flushInFlight = null;
        state.flushRequestedWhileBusy = false;
        releaseMutation();

        if (shouldFlushAgain) {
          void flushDiagnosticsSessions();
        }
      });

    state.flushInFlight = nextFlush;
    return nextFlush;
  }

  function maybeFlushDiagnosticsSession(session: ActiveDiagnosticsSession): void {
    if (session.events.length >= EVENTS_BEFORE_FLUSH) {
      void flushDiagnosticsSessions();
    }
  }

  return {
    flushDiagnosticsSessions,
    maybeFlushDiagnosticsSession,
  };
}

function createDiagnosticsFlushOrchestration(
  state: DiagnosticsCollectorState,
  persistence: ReturnType<typeof createDiagnosticsPersistence>
) {
  function startDiagnosticsFlushLoop(): void {
    if (state.flushIntervalId !== null) {
      return;
    }

    state.flushIntervalId = setInterval(() => {
      if (state.activeSessions.size > 0) {
        void persistence.flushDiagnosticsSessions();
      }
    }, FLUSH_INTERVAL_MS);

    diagnosticsLogger.debug('Started diagnostics flush interval');
  }

  function stopDiagnosticsFlushLoop(): void {
    if (state.flushIntervalId === null) {
      return;
    }

    clearInterval(state.flushIntervalId);
    state.flushIntervalId = null;
    diagnosticsLogger.debug('Stopped diagnostics flush interval');
  }

  return {
    startDiagnosticsFlushLoop,
    stopDiagnosticsFlushLoop,
  };
}

function createDiagnosticsCollectorStateService() {
  const activeSessions = new Map<string, ActiveDiagnosticsSession>();
  const tabToRecording = new Map<number, string>();
  const state: DiagnosticsCollectorState = {
    activeSessions,
    flushInFlight: null,
    flushRequestedWhileBusy: false,
    tabToRecording,
    flushIntervalId: null,
  };
  const sessionRegistry = createDiagnosticsSessionRegistry(state);
  const persistence = createDiagnosticsPersistence(state);
  const flushOrchestration = createDiagnosticsFlushOrchestration(state, persistence);

  return {
    ...sessionRegistry,
    ...persistence,
    ...flushOrchestration,
    async resetForLocalDataErasure(): Promise<void> {
      flushOrchestration.stopDiagnosticsFlushLoop();
      state.activeSessions.clear();
      state.tabToRecording.clear();
      state.flushRequestedWhileBusy = false;
      await state.flushInFlight;
      state.flushInFlight = null;
    },
  };
}

const defaultDiagnosticsCollectorStateService = createLazyDefaultOwner(
  createDiagnosticsCollectorStateService
);

export function hasActiveDiagnosticsSession(recordingId: string): boolean {
  return defaultDiagnosticsCollectorStateService
    .getOwner()
    .hasActiveDiagnosticsSession(recordingId);
}

export function registerDiagnosticsSession(session: ActiveDiagnosticsSession): void {
  defaultDiagnosticsCollectorStateService.getOwner().registerDiagnosticsSession(session);
}

export function unregisterDiagnosticsSession(recordingId: string, tabId: number): void {
  defaultDiagnosticsCollectorStateService
    .getOwner()
    .unregisterDiagnosticsSession(recordingId, tabId);
}

export function getDiagnosticsSession(recordingId: string): ActiveDiagnosticsSession | undefined {
  return defaultDiagnosticsCollectorStateService.getOwner().getDiagnosticsSession(recordingId);
}

export function getDiagnosticsSessionByTabId(tabId: number): ActiveDiagnosticsSession | undefined {
  return defaultDiagnosticsCollectorStateService.getOwner().getDiagnosticsSessionByTabId(tabId);
}

export function getActiveRecordingId(tabId: number): string | undefined {
  return defaultDiagnosticsCollectorStateService.getOwner().getActiveRecordingId(tabId);
}

export function startDiagnosticsFlushLoop(): void {
  defaultDiagnosticsCollectorStateService.getOwner().startDiagnosticsFlushLoop();
}

export function stopDiagnosticsFlushLoop(): void {
  defaultDiagnosticsCollectorStateService.getOwner().stopDiagnosticsFlushLoop();
}

export function maybeFlushDiagnosticsSession(session: ActiveDiagnosticsSession): void {
  defaultDiagnosticsCollectorStateService.getOwner().maybeFlushDiagnosticsSession(session);
}

export function hasActiveDiagnosticsSessions(): boolean {
  return defaultDiagnosticsCollectorStateService.getOwner().hasActiveDiagnosticsSessions();
}

export function listActiveDiagnosticsSessions(): ActiveDiagnosticsSession[] {
  return defaultDiagnosticsCollectorStateService.getOwner().listActiveDiagnosticsSessions();
}

export function resetDiagnosticsStateForLocalDataErasure(): Promise<void> {
  return defaultDiagnosticsCollectorStateService.getOwner().resetForLocalDataErasure();
}

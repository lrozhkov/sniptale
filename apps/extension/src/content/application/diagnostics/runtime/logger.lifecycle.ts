import type { DiagnosticEventFromCS } from '@sniptale/platform/observability/diagnostics/types';
import { createLogger } from '@sniptale/platform/observability/logger';
import type { DiagnosticActionHandlers } from './logger.actions';
import type { DiagnosticErrorHandlers } from './logger.errors';
import {
  setupDiagnosticActionListeners,
  setupDiagnosticErrorListeners,
  teardownDiagnosticActionListeners,
  teardownDiagnosticErrorListeners,
} from './logger.listeners';
import { sendDiagnosticContentEvent } from './logger.helpers';

const logger = createLogger({ namespace: 'ContentDiagnostics' });

type DiagnosticLoggerState = {
  isEnabled: boolean;
  lastScrollY: number;
  scrollTimeoutId: number | null;
  sessionRecordingId: string | null;
  sessionStartTime: number;
};

export function createDiagnosticLoggerState(): DiagnosticLoggerState {
  return {
    isEnabled: false,
    lastScrollY: 0,
    scrollTimeoutId: null,
    sessionRecordingId: null,
    sessionStartTime: 0,
  };
}

export function createDiagnosticEventSender(state: DiagnosticLoggerState) {
  return (event: Omit<DiagnosticEventFromCS, 'tsMs'>): void => {
    sendDiagnosticContentEvent({
      event,
      sessionRecordingId: state.sessionRecordingId,
      sessionStartTime: state.sessionStartTime,
      isEnabled: state.isEnabled,
    });
  };
}

export function enableDiagnosticLogger(args: {
  actionHandlers: DiagnosticActionHandlers;
  errorHandlers: DiagnosticErrorHandlers;
  recordingId: string;
  state: DiagnosticLoggerState;
}): void {
  if (args.state.isEnabled) {
    logger.warn('Diagnostic logger is already enabled');
    return;
  }

  args.state.isEnabled = true;
  args.state.sessionRecordingId = args.recordingId;
  args.state.sessionStartTime = performance.now();
  args.state.lastScrollY = window.scrollY;
  setupDiagnosticErrorListeners(args.errorHandlers);
  setupDiagnosticActionListeners(args.actionHandlers);
  logger.debug('Enabled diagnostic logger', { recordingId: args.recordingId });
}

export function disableDiagnosticLogger(args: {
  actionHandlers: DiagnosticActionHandlers;
  errorHandlers: DiagnosticErrorHandlers;
  state: DiagnosticLoggerState;
}): void {
  if (!args.state.isEnabled) {
    return;
  }

  args.state.isEnabled = false;
  teardownDiagnosticErrorListeners(args.errorHandlers);
  teardownDiagnosticActionListeners(args.actionHandlers);

  if (args.state.scrollTimeoutId !== null) {
    window.clearTimeout(args.state.scrollTimeoutId);
    args.state.scrollTimeoutId = null;
  }

  args.state.sessionRecordingId = null;
  logger.debug('Disabled diagnostic logger');
}

import { createDiagnosticActionHandlers } from './logger.actions';
import { createDiagnosticErrorHandlers } from './logger.errors';
import {
  createDiagnosticEventSender,
  createDiagnosticLoggerState,
  disableDiagnosticLogger,
  enableDiagnosticLogger,
} from './logger.lifecycle';

export type DiagnosticLoggerController = {
  disable: () => void;
  dispose: () => void;
  enable: (recordingId: string) => void;
};

/**
 * Creates the content diagnostics controller. The instance owns session metadata, listeners,
 * and throttling timers for runtime diagnostics capture.
 */
export function createDiagnosticLoggerController(): DiagnosticLoggerController {
  const state = createDiagnosticLoggerState();
  const sendEvent = createDiagnosticEventSender(state);
  const errorHandlers = createDiagnosticErrorHandlers({ sendEvent, state });
  const actionHandlers = createDiagnosticActionHandlers({ sendEvent, state });

  return {
    disable: () => disableDiagnosticLogger({ actionHandlers, errorHandlers, state }),
    dispose: () => disableDiagnosticLogger({ actionHandlers, errorHandlers, state }),
    enable: (recordingId) =>
      enableDiagnosticLogger({ actionHandlers, errorHandlers, recordingId, state }),
  };
}

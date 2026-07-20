import {
  createConsoleDiagnosticsCaptureController,
  type ConsoleDiagnosticsSnapshot,
} from './controller';
import { createLazyDefaultOwner } from '@sniptale/foundation/default-owner';

const EMPTY_CONSOLE_DIAGNOSTICS_SNAPSHOT: ConsoleDiagnosticsSnapshot = {
  capturedAt: '',
  droppedCount: 0,
  entries: [],
};
const consoleDiagnosticsCaptureControllerOwner = createLazyDefaultOwner(
  createConsoleDiagnosticsCaptureController
);

/**
 * Starts a bounded console/error snapshot collector for an explicit diagnostics session.
 */
export function startConsoleDiagnosticsCapture(): void {
  consoleDiagnosticsCaptureControllerOwner.getOwner().install();
}

/**
 * Stops diagnostics capture and clears the bounded in-memory buffer.
 */
export function stopConsoleDiagnosticsCapture(): void {
  consoleDiagnosticsCaptureControllerOwner.getOwnerIfCreated()?.dispose();
}

/**
 * Returns a sanitized snapshot of recent content-runtime console and error events.
 */
export function getConsoleDiagnosticsSnapshot(): ConsoleDiagnosticsSnapshot {
  return (
    consoleDiagnosticsCaptureControllerOwner.getOwnerIfCreated()?.getSnapshot() ??
    EMPTY_CONSOLE_DIAGNOSTICS_SNAPSHOT
  );
}

export { createConsoleDiagnosticsCaptureController };
export type { ConsoleDiagnosticsSnapshot };

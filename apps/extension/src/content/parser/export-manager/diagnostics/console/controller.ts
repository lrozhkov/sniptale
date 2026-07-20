import { installConsoleMethodCapture, restoreConsoleMethods } from './capture';
import {
  CONSOLE_LEVELS,
  createConsoleDiagnosticsState,
  DEFAULT_MAX_ENTRIES,
  resetConsoleDiagnosticsState,
} from './state';
import type {
  ConsoleDiagnosticsCaptureController,
  ConsoleDiagnosticsCaptureDeps,
  ConsoleDiagnosticsSnapshot,
} from './types';
import { installWindowErrorCapture, removeWindowErrorCapture } from './window-capture';

/**
 * Creates a reversible console/error diagnostics capture controller with private state.
 */
export function createConsoleDiagnosticsCaptureController(
  deps: ConsoleDiagnosticsCaptureDeps = {}
): ConsoleDiagnosticsCaptureController {
  const consoleTarget = deps.consoleTarget ?? console;
  const getNow = deps.getNow ?? (() => new Date().toISOString());
  const maxEntries = deps.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const state = createConsoleDiagnosticsState();
  const windowTarget = deps.windowTarget ?? (typeof window === 'undefined' ? null : window);

  return {
    install: () => {
      if (state.isInstalled) {
        return;
      }

      state.isInstalled = true;
      CONSOLE_LEVELS.forEach((level) => {
        installConsoleMethodCapture({
          consoleTarget,
          getNow,
          level,
          maxEntries,
          state,
        });
      });
      installWindowErrorCapture({
        getNow,
        maxEntries,
        state,
        windowTarget,
      });
    },

    dispose: () => {
      if (state.isInstalled) {
        restoreConsoleMethods(state, consoleTarget);
        removeWindowErrorCapture(state, windowTarget);
        state.isInstalled = false;
      }

      resetConsoleDiagnosticsState(state);
    },

    getSnapshot: () => ({
      capturedAt: getNow(),
      droppedCount: state.droppedCount,
      entries: [...state.entries],
    }),
  };
}

export type { ConsoleDiagnosticsSnapshot };

import type { ConsoleDiagnosticEntry, ConsoleDiagnosticsState } from './types';

export const DEFAULT_MAX_ENTRIES = 500;
export const CONSOLE_LEVELS = ['log', 'warn', 'error', 'info', 'debug'] as const;

export function createConsoleDiagnosticsState(): ConsoleDiagnosticsState {
  return {
    droppedCount: 0,
    entries: [],
    isInstalled: false,
    originalMethods: {},
    windowHandlers: null,
  };
}

export function resetConsoleDiagnosticsState(state: ConsoleDiagnosticsState): void {
  state.droppedCount = 0;
  state.entries = [];
  state.originalMethods = {};
  state.windowHandlers = null;
}

export function pushEntry(
  state: ConsoleDiagnosticsState,
  maxEntries: number,
  entry: ConsoleDiagnosticEntry
): void {
  if (state.entries.length >= maxEntries) {
    state.entries.shift();
    state.droppedCount += 1;
  }

  state.entries.push(entry);
}

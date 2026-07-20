import { expect, it } from 'vitest';

import { createConsoleDiagnosticsState, pushEntry, resetConsoleDiagnosticsState } from './state';
import type { ConsoleDiagnosticEntry } from './types';

function createEntry(message: string): ConsoleDiagnosticEntry {
  return {
    data: null,
    kind: 'console',
    level: 'log',
    message,
    timestamp: '2026-07-15T00:00:00.000Z',
  };
}

it('bounds entries, counts dropped records, and resets captured data', () => {
  const state = createConsoleDiagnosticsState();
  const first = createEntry('first');
  const second = createEntry('second');

  pushEntry(state, 1, first);
  expect(state.entries).toEqual([first]);
  expect(state.droppedCount).toBe(0);

  pushEntry(state, 1, second);
  expect(state.entries).toEqual([second]);
  expect(state.droppedCount).toBe(1);

  state.originalMethods.log = () => undefined;
  state.windowHandlers = {
    handleUnhandledRejection: (_event: PromiseRejectionEvent) => undefined,
    handleWindowError: (_event: ErrorEvent) => undefined,
  };
  resetConsoleDiagnosticsState(state);

  expect(state).toMatchObject({
    droppedCount: 0,
    entries: [],
    originalMethods: {},
    windowHandlers: null,
  });
});

import { expect, it, vi } from 'vitest';

const handleCaptureSurfaceDebuggerDetach = vi.hoisted(() => vi.fn());

vi.mock('../../../capture-surface', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../capture-surface')>()),
  getCaptureSurfaceService: () => ({
    handleDebuggerDetach: handleCaptureSurfaceDebuggerDetach,
  }),
}));

import {
  clearDebuggerSessionState,
  debuggerDetachListenerRef,
  debuggerEventListenerRef,
  handleDebuggerEvent,
  handleDiagnosticsForcedDetach,
  handleExportHarDebuggerEvent,
  handleExportHarForcedDetach,
  handleTabRecordingDebuggerDetach,
  createModeState,
  flushMicrotasks,
} from '../../../../../../../tooling/test/support/background-runtime-wiring.test-support';
import { registerDebuggerListeners } from './debugger';

const logger = {
  log: vi.fn(),
  warn: vi.fn(),
};

it('fans out debugger events and reconciles physical capture-surface state', async () => {
  const state = createModeState();
  handleCaptureSurfaceDebuggerDetach.mockResolvedValueOnce(['screenshot']);
  registerDebuggerListeners(logger, state);

  debuggerEventListenerRef.current?.({ tabId: 7 }, 'Page.loadEventFired', { frameId: '1' });
  expect(handleDebuggerEvent).toHaveBeenCalledWith({ tabId: 7 }, 'Page.loadEventFired', {
    frameId: '1',
  });
  expect(handleExportHarDebuggerEvent).toHaveBeenCalledWith({ tabId: 7 }, 'Page.loadEventFired', {
    frameId: '1',
  });

  debuggerDetachListenerRef.current?.({ targetId: 'target-7' }, 'target_closed');
  expect(clearDebuggerSessionState).toHaveBeenCalledWith(7);
  expect(handleDiagnosticsForcedDetach).toHaveBeenCalledWith(7);
  expect(handleExportHarForcedDetach).toHaveBeenCalledWith(7);
  await flushMicrotasks();
  expect(handleCaptureSurfaceDebuggerDetach).toHaveBeenCalledWith(7);
  expect(handleTabRecordingDebuggerDetach).toHaveBeenCalledWith(7, expect.any(Function));
  expect(state.viewportOwnerState.has(7)).toBe(false);
  expect(state.viewportState.get(7)).toBeNull();
});

it('ignores detach fan-out when tab resolution fails', () => {
  registerDebuggerListeners(logger, createModeState());

  debuggerDetachListenerRef.current?.({ targetId: 'missing-target' }, 'target_closed');

  expect(clearDebuggerSessionState).not.toHaveBeenCalled();
  expect(handleDiagnosticsForcedDetach).not.toHaveBeenCalled();
  expect(handleExportHarForcedDetach).not.toHaveBeenCalled();
  expect(handleTabRecordingDebuggerDetach).not.toHaveBeenCalled();
});

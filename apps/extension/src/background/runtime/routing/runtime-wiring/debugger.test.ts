import { expect, it, vi } from 'vitest';

import {
  clearDebuggerSessionState,
  debuggerDetachListenerRef,
  debuggerEventListenerRef,
  handleDebuggerEvent,
  handleDiagnosticsForcedDetach,
  handleExportHarDebuggerEvent,
  handleExportHarForcedDetach,
  handleViewportRecordingDebuggerDetach,
} from '../../../../../../../tooling/test/support/background-runtime-wiring.test-support';
import { registerDebuggerListeners } from './debugger';

const logger = {
  log: vi.fn(),
  warn: vi.fn(),
};

it('fans out debugger events and detach notifications to all owners', () => {
  registerDebuggerListeners(logger);

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
  expect(handleViewportRecordingDebuggerDetach).toHaveBeenCalledWith(7);
});

it('ignores detach fan-out when tab resolution fails', () => {
  registerDebuggerListeners(logger);

  debuggerDetachListenerRef.current?.({ targetId: 'missing-target' }, 'target_closed');

  expect(clearDebuggerSessionState).not.toHaveBeenCalled();
  expect(handleDiagnosticsForcedDetach).not.toHaveBeenCalled();
  expect(handleExportHarForcedDetach).not.toHaveBeenCalled();
  expect(handleViewportRecordingDebuggerDetach).not.toHaveBeenCalled();
});

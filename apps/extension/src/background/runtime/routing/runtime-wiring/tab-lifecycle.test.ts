import { expect, it, vi } from 'vitest';

const pinSessionMocks = vi.hoisted(() => ({
  clearPinToTabSessionStorageState: vi.fn(),
}));

vi.mock(
  '../../../../composition/persistence/content-pin-session/index',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../../composition/persistence/content-pin-session/index')
    >()),
    clearPinToTabSessionStorageState: pinSessionMocks.clearPinToTabSessionStorageState,
  })
);

import {
  createModeState,
  flushMicrotasks,
  handleTabClose,
  removedListenerRef,
} from '../../../../../../../tooling/test/support/background-runtime-wiring.test-support';
import { registerTabLifecycleListeners } from './tab-lifecycle';

const logger = {
  log: vi.fn(),
  warn: vi.fn(),
};

it('clears mode state and delegates tab close handling on tab removal', () => {
  const state = createModeState();
  pinSessionMocks.clearPinToTabSessionStorageState.mockResolvedValue(undefined);

  registerTabLifecycleListeners(state, logger);
  removedListenerRef.current?.(7);

  expect(state.screenshotModeState.has(7)).toBe(false);
  expect(state.highlighterModeState.has(7)).toBe(false);
  expect(state.quickEditModeState.has(7)).toBe(false);
  expect(state.viewportState.has(7)).toBe(false);
  expect(handleTabClose).toHaveBeenCalledWith(7);
  expect(pinSessionMocks.clearPinToTabSessionStorageState).toHaveBeenCalledWith(7);
  expect(logger.log).toHaveBeenCalledWith('Tab closed, state cleared', 7);
});

it('logs pin-to-tab session cleanup failures without blocking tab close handling', async () => {
  const state = createModeState();
  const cleanupError = new Error('session unavailable');
  pinSessionMocks.clearPinToTabSessionStorageState.mockRejectedValue(cleanupError);

  registerTabLifecycleListeners(state, logger);
  removedListenerRef.current?.(7);
  await flushMicrotasks();

  expect(handleTabClose).toHaveBeenCalledWith(7);
  expect(logger.warn).toHaveBeenCalledWith(
    'Failed to clear pin-to-tab state after tab close',
    cleanupError
  );
});

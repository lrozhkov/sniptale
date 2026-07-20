// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';

import { scheduleCopiedFormatReset } from './copied-format';

function createExportState() {
  return {
    copyResetTimeoutRef: { current: null as number | null },
    setCopiedFormat: vi.fn(),
  };
}

it('replaces an existing copied-format timeout before scheduling a new reset', () => {
  const state = createExportState();
  const clearTimeout = vi.fn();
  let scheduledCallback: (() => void) | undefined;

  state.copyResetTimeoutRef.current = 4;

  scheduleCopiedFormatReset(state as never, 'json', {
    clearTimeout,
    createRequestId: vi.fn(),
    getActiveTabId: vi.fn(),
    requestPreview: vi.fn(),
    saveArchiveBlob: vi.fn(),
    scheduleTimeout: vi.fn((callback) => {
      scheduledCallback = callback;
      return 9;
    }),
    sendBuildPackageMessage: vi.fn(),
    sendCancelMessage: vi.fn(),
    sendStartMessage: vi.fn(),
    writeClipboardText: vi.fn(),
  });

  expect(clearTimeout).toHaveBeenCalledWith(4);
  expect(state.setCopiedFormat).toHaveBeenCalledWith('json');
  expect(state.copyResetTimeoutRef.current).toBe(9);

  scheduledCallback?.();

  expect(state.setCopiedFormat).toHaveBeenLastCalledWith(null);
  expect(state.copyResetTimeoutRef.current).toBeNull();
});

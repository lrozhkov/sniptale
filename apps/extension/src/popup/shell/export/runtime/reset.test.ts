import { expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { resetPopupExportView } from './reset';
import { createPopupExportRuntimeStateFixture } from './state.test-support';
import type { PopupExportRuntimeDeps } from './types';

function createState() {
  return createPopupExportRuntimeStateFixture({
    setProgress: vi.fn(),
    setResult: vi.fn(),
  });
}

function createDeps(
  sendAckJobStatusMessage = vi.fn().mockResolvedValue({ status: null, success: true })
): PopupExportRuntimeDeps {
  return {
    clearTimeout: vi.fn(),
    createRequestId: vi.fn(),
    getActiveTabId: vi.fn(),
    requestPreview: vi.fn(),
    scheduleTimeout: vi.fn(),
    sendAckJobStatusMessage,
    writeClipboardText: vi.fn(),
  };
}

it('acknowledges terminal job metadata before clearing the local result view', async () => {
  const state = createState();
  const deps = createDeps();

  await resetPopupExportView(state, deps);

  expect(deps.sendAckJobStatusMessage).toHaveBeenCalledWith({
    type: MessageType.ACK_PAGE_PACKAGE_JOB_STATUS,
  });
  expect(state.setProgress).toHaveBeenCalledWith({
    activeStepKey: null,
    current: 0,
    errors: [],
    message: '',
    phase: 'idle',
    total: 0,
  });
  expect(state.setResult).toHaveBeenCalledWith(null);
});

it('still clears the local result view when acknowledgement transport fails', async () => {
  const state = createState();
  const deps = createDeps(vi.fn().mockRejectedValue(new Error('ack failed')));

  await expect(resetPopupExportView(state, deps)).rejects.toThrow('ack failed');

  expect(state.setProgress).toHaveBeenCalledWith(expect.objectContaining({ phase: 'idle' }));
  expect(state.setResult).toHaveBeenCalledWith(null);
});

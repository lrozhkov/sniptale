import { expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { cancelPopupExport } from './cancel';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

const loggingMocks = vi.hoisted(() => ({
  logPopupExportCancelFailure: vi.fn(),
}));

vi.mock('./logging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./logging')>()),
  logPopupExportCancelFailure: loggingMocks.logPopupExportCancelFailure,
}));

function createState(overrides = {}) {
  return {
    cancelRetryRef: {
      current: null as { exportRunId: string; tabIds: number[] } | null,
    },
    exportDisabledReason: null as string | null,
    requestIdRef: { current: 'req-1' as string | null },
    selectedTabIdsInOrder: [12],
    setProgress: vi.fn(),
    ...overrides,
  };
}

function createDeps(overrides = {}) {
  return {
    sendCancelJobMessage: vi.fn().mockResolvedValue({ success: true }),
    ...overrides,
  };
}

it('returns early when export actions are disabled', async () => {
  const state = createState({
    exportDisabledReason: 'blocked',
  });
  const deps = createDeps();

  await cancelPopupExport(state, deps);

  expect(deps.sendCancelJobMessage).not.toHaveBeenCalled();
  expect(state.setProgress).not.toHaveBeenCalled();
});

it('forwards cancellation once to the background job owner', async () => {
  const state = createState({
    selectedTabIdsInOrder: [12, 14],
  });
  const deps = createDeps();

  await cancelPopupExport(state, deps);

  expect(state.requestIdRef.current).toBeNull();
  expect(state.cancelRetryRef.current).toBeNull();
  expect(state.setProgress).toHaveBeenCalledWith({
    activeStepKey: null,
    phase: 'error',
    message: 'content.runtime.exportCancelled',
    current: 0,
    total: 0,
    errors: ['content.runtime.exportCancelled'],
  });
  expect(deps.sendCancelJobMessage).toHaveBeenCalledOnce();
  expect(deps.sendCancelJobMessage).toHaveBeenCalledWith({
    jobId: 'req-1',
    type: MessageType.CANCEL_POPUP_EXPORT_JOB,
  });
});

it('forwards single-tab cancellation through the same job API', async () => {
  const state = createState();
  const deps = createDeps();

  await cancelPopupExport(state, deps);

  expect(deps.sendCancelJobMessage).toHaveBeenCalledWith({
    jobId: 'req-1',
    type: MessageType.CANCEL_POPUP_EXPORT_JOB,
  });
});

it('logs cancel failures from the runtime boundary', async () => {
  const error = new Error('cancel failed');
  const state = createState();
  const deps = createDeps({
    sendCancelJobMessage: vi.fn().mockRejectedValue(error),
  });

  await cancelPopupExport(state, deps);

  expect(loggingMocks.logPopupExportCancelFailure).toHaveBeenCalledWith(error);
  expect(state.requestIdRef.current).toBeNull();
  expect(state.cancelRetryRef.current).toEqual({ exportRunId: 'req-1', tabIds: [12] });
  expect(state.setProgress).not.toHaveBeenCalled();
});

it('treats a fulfilled unsuccessful cancel response as retryable cleanup failure', async () => {
  const state = createState();
  const deps = createDeps({
    sendCancelJobMessage: vi.fn().mockResolvedValue({ error: 'cleanup failed', success: false }),
  });

  await cancelPopupExport(state, deps);

  expect(state.requestIdRef.current).toBeNull();
  expect(state.cancelRetryRef.current).toEqual({ exportRunId: 'req-1', tabIds: [12] });
  expect(loggingMocks.logPopupExportCancelFailure).toHaveBeenCalledWith('cleanup failed');
  expect(state.setProgress).toHaveBeenCalledWith(
    expect.objectContaining({
      message: 'content.runtime.exportCancelFailed',
      phase: 'error',
    })
  );
});

it('invalidates local work before remote cancellation settles', async () => {
  let resolveCancellation: ((value: { success: true }) => void) | undefined;
  const state = createState({ selectedTabIdsInOrder: [12, 14] });
  const sendCancelJobMessage = vi.fn(
    () =>
      new Promise<{ success: true }>((resolve) => {
        resolveCancellation = resolve;
      })
  );
  const cancellation = cancelPopupExport(state, createDeps({ sendCancelJobMessage }));

  expect(state.requestIdRef.current).toBeNull();
  expect(state.cancelRetryRef.current).toEqual({ exportRunId: 'req-1', tabIds: [12, 14] });
  state.selectedTabIdsInOrder.splice(0, 2, 99);
  resolveCancellation?.({ success: true });
  await cancellation;

  expect(sendCancelJobMessage).toHaveBeenCalledOnce();
  expect(sendCancelJobMessage).toHaveBeenCalledWith({
    jobId: 'req-1',
    type: MessageType.CANCEL_POPUP_EXPORT_JOB,
  });
});

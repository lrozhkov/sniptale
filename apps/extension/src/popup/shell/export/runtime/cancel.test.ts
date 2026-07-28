import { expect, it, vi } from 'vitest';

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
    sendCancelMessage: vi.fn().mockResolvedValue({ success: true }),
    ...overrides,
  };
}

it('returns early when export actions are disabled', async () => {
  const state = createState({
    exportDisabledReason: 'blocked',
  });
  const deps = createDeps();

  await cancelPopupExport(state, deps);

  expect(deps.sendCancelMessage).not.toHaveBeenCalled();
  expect(state.setProgress).not.toHaveBeenCalled();
});

it('forwards batch cancellation to every selected tab with the same export identity', async () => {
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
  expect(deps.sendCancelMessage).toHaveBeenNthCalledWith(1, 12, 'req-1');
  expect(deps.sendCancelMessage).toHaveBeenNthCalledWith(2, 14, 'req-1');
});

it('forwards single-tab cancel requests to the tab runtime', async () => {
  const state = createState();
  const deps = createDeps();

  await cancelPopupExport(state, deps);

  expect(deps.sendCancelMessage).toHaveBeenCalledWith(12, 'req-1');
});

it('logs cancel failures from the runtime boundary', async () => {
  const error = new Error('cancel failed');
  const state = createState();
  const deps = createDeps({
    sendCancelMessage: vi.fn().mockRejectedValue(error),
  });

  await cancelPopupExport(state, deps);

  expect(loggingMocks.logPopupExportCancelFailure).toHaveBeenCalledWith(error);
  expect(state.requestIdRef.current).toBeNull();
  expect(state.cancelRetryRef.current).toEqual({ exportRunId: 'req-1', tabIds: [12] });
  expect(state.setProgress).toHaveBeenCalledWith({
    activeStepKey: null,
    phase: 'error',
    message: 'content.runtime.exportCancelFailed',
    current: 0,
    total: 0,
    errors: ['content.runtime.exportCancelFailed'],
  });
});

it('treats a fulfilled unsuccessful cancel response as retryable cleanup failure', async () => {
  const state = createState();
  const deps = createDeps({
    sendCancelMessage: vi.fn().mockResolvedValue({ error: 'cleanup failed', success: false }),
  });

  await cancelPopupExport(state, deps);

  expect(state.requestIdRef.current).toBeNull();
  expect(state.cancelRetryRef.current).toEqual({ exportRunId: 'req-1', tabIds: [12] });
  expect(loggingMocks.logPopupExportCancelFailure).toHaveBeenCalledWith(
    expect.objectContaining({ message: 'cleanup failed' })
  );
  expect(state.setProgress).toHaveBeenCalledWith(
    expect.objectContaining({
      message: 'content.runtime.exportCancelFailed',
      phase: 'error',
    })
  );
});

it('invalidates local batch work before remote cancellation settles and retries original targets', async () => {
  const resolveCancellations: Array<(value: { success: true }) => void> = [];
  const state = createState({ selectedTabIdsInOrder: [12, 14] });
  const sendCancelMessage = vi.fn(
    () =>
      new Promise<{ success: true }>((resolve) => {
        resolveCancellations.push(resolve);
      })
  );
  const cancellation = cancelPopupExport(state, createDeps({ sendCancelMessage }));

  expect(state.requestIdRef.current).toBeNull();
  expect(state.cancelRetryRef.current).toEqual({ exportRunId: 'req-1', tabIds: [12, 14] });
  state.selectedTabIdsInOrder.splice(0, 2, 99);
  for (const resolve of resolveCancellations) resolve({ success: true });
  await cancellation;

  expect(sendCancelMessage).toHaveBeenNthCalledWith(1, 12, 'req-1');
  expect(sendCancelMessage).toHaveBeenNthCalledWith(2, 14, 'req-1');
});

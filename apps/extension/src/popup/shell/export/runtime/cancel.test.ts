import { expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { cancelPopupExport } from './cancel';

vi.mock('../../../../platform/i18n/popup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n/popup')>()),
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
      current: null as {
        cancellationPending?: true;
        exportRunId: string;
        locale?: 'en' | 'ru';
        owner: 'job';
        tabIds: number[];
      } | null,
    },
    exportDisabledReason: null as string | null,
    requestIdRef: { current: 'req-1' as string | null },
    terminalRequestIdRef: { current: null as string | null },
    selectedTabIdsInOrder: [12],
    setProgress: vi.fn(),
    setResult: vi.fn(),
    ...overrides,
  };
}

function createCancellingResponse(jobId = 'req-1') {
  return {
    success: true,
    status: {
      jobId,
      phase: 'cancelling',
      progress: {
        activeStepKey: 'webSnapshotAssets',
        current: 2,
        total: 4,
        errors: [],
        message: 'Collecting',
        phase: 'scanning',
      },
    },
  };
}

function createDeps(overrides = {}) {
  return {
    sendCancelJobMessage: vi.fn().mockResolvedValue(createCancellingResponse()),
    ...overrides,
  };
}

it('cancels the owned job even when new export actions become disabled', async () => {
  const state = createState({
    exportDisabledReason: 'blocked',
  });
  const deps = createDeps();

  await cancelPopupExport(state, deps);

  expect(deps.sendCancelJobMessage).toHaveBeenCalledWith({
    jobId: 'req-1',
    type: 'CANCEL_PAGE_PACKAGE_JOB',
  });
  expect(state.setProgress).toHaveBeenCalled();
});

it('retains authority and shows cancelling until the terminal status broadcast arrives', async () => {
  const state = createState({
    selectedTabIdsInOrder: [12, 14],
  });
  const deps = createDeps();

  await cancelPopupExport(state, deps);

  expect(state.requestIdRef.current).toBe('req-1');
  expect(state.cancelRetryRef.current).toEqual({
    cancellationPending: true,
    exportRunId: 'req-1',
    locale: 'ru',
    owner: 'job',
    tabIds: [12, 14],
  });
  expect(state.terminalRequestIdRef.current).toBeNull();
  expect(state.setResult).not.toHaveBeenCalled();
  expect(state.setProgress).toHaveBeenCalledWith({
    activeStepKey: 'webSnapshotAssets',
    phase: 'scanning',
    message: 'Collecting',
    current: 2,
    total: 4,
    errors: [],
  });
  expect(deps.sendCancelJobMessage).toHaveBeenCalledOnce();
  expect(deps.sendCancelJobMessage).toHaveBeenCalledWith({
    jobId: 'req-1',
    type: MessageType.CANCEL_PAGE_PACKAGE_JOB,
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
  expect(state.requestIdRef.current).toBe('req-1');
  expect(state.cancelRetryRef.current).toEqual({
    exportRunId: 'req-1',
    locale: 'ru',
    owner: 'job',
    tabIds: [12],
  });
  expect(state.setProgress).toHaveBeenCalledWith(
    expect.objectContaining({
      message: 'content.runtime.exportCancelFailed',
      phase: 'error',
    })
  );
});

it('treats a fulfilled unsuccessful cancel response as retryable cleanup failure', async () => {
  const state = createState();
  const deps = createDeps({
    sendCancelJobMessage: vi.fn().mockResolvedValue({ error: 'cleanup failed', success: false }),
  });

  await cancelPopupExport(state, deps);

  expect(state.requestIdRef.current).toBe('req-1');
  expect(state.cancelRetryRef.current).toEqual({
    exportRunId: 'req-1',
    locale: 'ru',
    owner: 'job',
    tabIds: [12],
  });
  expect(loggingMocks.logPopupExportCancelFailure).toHaveBeenCalledWith('cleanup failed');
  expect(state.setProgress).toHaveBeenCalledWith(
    expect.objectContaining({
      message: 'content.runtime.exportCancelFailed',
      phase: 'error',
    })
  );
});

it('retains local job authority after cancellation admission until terminal publication', async () => {
  let resolveCancellation:
    | ((value: ReturnType<typeof createCancellingResponse>) => void)
    | undefined;
  const state = createState({ selectedTabIdsInOrder: [12, 14] });
  const sendCancelJobMessage = vi.fn(
    () =>
      new Promise<ReturnType<typeof createCancellingResponse>>((resolve) => {
        resolveCancellation = resolve;
      })
  );
  const cancellation = cancelPopupExport(state, createDeps({ sendCancelJobMessage }));

  expect(state.requestIdRef.current).toBe('req-1');
  expect(state.cancelRetryRef.current).toEqual({
    cancellationPending: true,
    exportRunId: 'req-1',
    locale: 'ru',
    owner: 'job',
    tabIds: [12, 14],
  });
  expect(state.setProgress).not.toHaveBeenCalled();
  state.selectedTabIdsInOrder.splice(0, 2, 99);
  resolveCancellation?.(createCancellingResponse());
  await cancellation;

  expect(state.requestIdRef.current).toBe('req-1');
  expect(state.cancelRetryRef.current?.cancellationPending).toBe(true);

  expect(sendCancelJobMessage).toHaveBeenCalledOnce();
  expect(sendCancelJobMessage).toHaveBeenCalledWith({
    jobId: 'req-1',
    type: MessageType.CANCEL_PAGE_PACKAGE_JOB,
  });
});

it('does not dispatch a second cancellation while terminal publication is pending', async () => {
  const state = createState({
    cancelRetryRef: {
      current: {
        cancellationPending: true as const,
        exportRunId: 'req-1',
        owner: 'job' as const,
        tabIds: [12],
      },
    },
  });
  const deps = createDeps();

  await cancelPopupExport(state, deps);

  expect(deps.sendCancelJobMessage).not.toHaveBeenCalled();
});

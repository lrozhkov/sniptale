import { expect, it, vi } from 'vitest';

import { cancelPopupExport } from './cancel';

vi.mock('../../../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

const loggingMocks = vi.hoisted(() => ({
  logPopupExportCancelFailure: vi.fn(),
}));

vi.mock('./logging', () => ({
  logPopupExportCancelFailure: loggingMocks.logPopupExportCancelFailure,
}));

function createState(overrides = {}) {
  return {
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

  await cancelPopupExport(state as never, deps as never);

  expect(deps.sendCancelMessage).not.toHaveBeenCalled();
  expect(state.setProgress).not.toHaveBeenCalled();
});

it('cancels batch export locally when multiple tabs are selected', async () => {
  const state = createState({
    selectedTabIdsInOrder: [12, 14],
  });
  const deps = createDeps();

  await cancelPopupExport(state as never, deps as never);

  expect(state.requestIdRef.current).toBeNull();
  expect(state.setProgress).toHaveBeenCalledWith({
    activeStepKey: null,
    phase: 'error',
    message: 'content.runtime.exportCancelled',
    current: 0,
    total: 0,
    errors: ['content.runtime.exportCancelled'],
  });
  expect(deps.sendCancelMessage).not.toHaveBeenCalled();
});

it('forwards single-tab cancel requests to the tab runtime', async () => {
  const state = createState();
  const deps = createDeps();

  await cancelPopupExport(state as never, deps as never);

  expect(deps.sendCancelMessage).toHaveBeenCalledWith(12);
});

it('logs cancel failures from the runtime boundary', async () => {
  const error = new Error('cancel failed');
  const state = createState();
  const deps = createDeps({
    sendCancelMessage: vi.fn().mockRejectedValue(error),
  });

  await cancelPopupExport(state as never, deps as never);

  expect(loggingMocks.logPopupExportCancelFailure).toHaveBeenCalledWith(error);
});

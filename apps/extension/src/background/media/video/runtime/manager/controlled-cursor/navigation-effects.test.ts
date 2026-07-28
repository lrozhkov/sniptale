import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  appendTelemetry: vi.fn(),
  beginNavigation: vi.fn(),
  clearNavigation: vi.fn(),
  disable: vi.fn(),
  enable: vi.fn(),
  getOffset: vi.fn(),
  getRuntimeState: vi.fn(),
  getTabId: vi.fn(),
  isEnabled: vi.fn(),
  loggerWarn: vi.fn(),
  setAutoPaused: vi.fn(),
  setOffset: vi.fn(),
  sync: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({ warn: mocks.loggerWarn }),
}));

vi.mock('../../../session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../session-state')>()),
  appendControlledCursorTelemetry: mocks.appendTelemetry,
  beginControlledCursorNavigation: mocks.beginNavigation,
  clearControlledCursorNavigationPending: mocks.clearNavigation,
  getControlledCursorOffsetSeconds: mocks.getOffset,
  getVideoRecordingTabId: mocks.getTabId,
  isControlledCursorCaptureEnabled: mocks.isEnabled,
  setControlledCursorAutoPaused: mocks.setAutoPaused,
  setControlledCursorOffsetSeconds: mocks.setOffset,
}));
vi.mock('../../session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../session-state')>()),
  getVideoRecordingRuntimeState: mocks.getRuntimeState,
}));
vi.mock('./messages', () => ({
  disableControlledCursorCapture: mocks.disable,
  enableControlledCursorCapture: mocks.enable,
  syncControlledCursorCapture: mocks.sync,
}));

import {
  beginControlledCursorNavigationEffects,
  restoreControlledCursorEffects,
  suspendControlledCursorEffects,
} from './navigation-effects';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.beginNavigation.mockReturnValue(11);
  mocks.clearNavigation.mockReturnValue(true);
  mocks.getOffset.mockReturnValue(12);
  mocks.getRuntimeState.mockReturnValue({ duration: 12 });
  mocks.getTabId.mockReturnValue(7);
  mocks.isEnabled.mockReturnValue(true);
  mocks.disable.mockResolvedValue({ signals: [] });
  mocks.enable.mockResolvedValue(undefined);
  mocks.sync.mockResolvedValue(undefined);
});

const binding = {
  isCurrent: () => true,
  navigationEpoch: 11,
  recordingId: 'recording-1',
  shouldResume: true,
  tabId: 7,
};

it('flushes telemetry without owning recorder pause or resume transport', async () => {
  expect(beginControlledCursorNavigationEffects()).toBe(11);
  await suspendControlledCursorEffects(binding);
  expect(mocks.beginNavigation).toHaveBeenCalledOnce();
  expect(mocks.setAutoPaused).toHaveBeenCalledWith(true);
  expect(mocks.setOffset).toHaveBeenCalledWith(12);
  expect(mocks.appendTelemetry).toHaveBeenCalledWith({ signals: [] });
});

it('restores content telemetry state and clears pending effects', async () => {
  await restoreControlledCursorEffects(binding);
  expect(mocks.enable).toHaveBeenCalledWith(7, 'recording-1', 12);
  expect(mocks.sync).toHaveBeenCalledWith(7, 'resume');
  expect(mocks.setAutoPaused).toHaveBeenCalledWith(false);
  expect(mocks.clearNavigation).toHaveBeenCalledWith(11);
});

it('abandons stale continuations without publishing restored state', async () => {
  let current = true;
  mocks.enable.mockImplementationOnce(async () => {
    current = false;
  });
  await restoreControlledCursorEffects({ ...binding, isCurrent: () => current });
  expect(mocks.sync).not.toHaveBeenCalled();
  expect(mocks.clearNavigation).not.toHaveBeenCalled();
});

it('does not mutate cursor state when the binding is inactive', async () => {
  mocks.isEnabled.mockReturnValueOnce(false);
  await suspendControlledCursorEffects(binding);
  mocks.getTabId.mockReturnValueOnce(8);
  await restoreControlledCursorEffects(binding);

  expect(mocks.disable).not.toHaveBeenCalled();
  expect(mocks.enable).not.toHaveBeenCalled();
  expect(mocks.clearNavigation).toHaveBeenCalledWith(11);
});

it('keeps navigation cleanup alive when telemetry flushing fails', async () => {
  mocks.disable.mockRejectedValueOnce(new Error('content disappeared'));

  await expect(suspendControlledCursorEffects(binding)).resolves.toBeUndefined();

  expect(mocks.loggerWarn).toHaveBeenCalledWith(
    'Failed to flush controlled cursor telemetry before navigation',
    expect.any(Error)
  );
});

it('retries restoration and fails after the bounded retry schedule', async () => {
  vi.useFakeTimers();
  mocks.enable.mockRejectedValue(new Error('content unavailable'));
  const restoration = expect(restoreControlledCursorEffects(binding)).rejects.toThrow(
    'could not be restored after navigation'
  );

  await vi.runAllTimersAsync();
  await restoration;
  expect(mocks.enable).toHaveBeenCalledTimes(3);
  expect(mocks.setAutoPaused).toHaveBeenLastCalledWith(false);
  expect(mocks.clearNavigation).toHaveBeenLastCalledWith(11);
  vi.useRealTimers();
});

it('does not let a stale final retry clear the next navigation epoch', async () => {
  vi.useFakeTimers();
  let current = true;
  let rejectFinalAttempt!: (error: Error) => void;
  mocks.enable
    .mockRejectedValueOnce(new Error('first attempt failed'))
    .mockRejectedValueOnce(new Error('second attempt failed'))
    .mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectFinalAttempt = reject;
        })
    );

  const restoration = restoreControlledCursorEffects({
    ...binding,
    isCurrent: () => current,
  });
  await vi.runAllTimersAsync();
  current = false;
  rejectFinalAttempt(new Error('stale final attempt failed'));
  await expect(restoration).rejects.toThrow('could not be restored after navigation');

  expect(mocks.clearNavigation).not.toHaveBeenCalled();
  expect(mocks.setAutoPaused).not.toHaveBeenCalledWith(false);
  vi.useRealTimers();
});

it('restores a manually paused cursor session without publishing stale completion', async () => {
  let current = true;
  mocks.sync.mockImplementationOnce(async () => {
    current = false;
  });

  await restoreControlledCursorEffects({
    ...binding,
    isCurrent: () => current,
    shouldResume: false,
  });

  expect(mocks.sync).toHaveBeenCalledWith(7, 'pause');
  expect(mocks.clearNavigation).not.toHaveBeenCalled();
});

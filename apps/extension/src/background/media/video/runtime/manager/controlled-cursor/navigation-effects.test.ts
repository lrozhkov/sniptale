import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  appendTelemetry: vi.fn(),
  disable: vi.fn(),
  enable: vi.fn(),
  getOffset: vi.fn(),
  getRuntimeState: vi.fn(),
  getTabId: vi.fn(),
  isEnabled: vi.fn(),
  loggerWarn: vi.fn(),
  setAutoPaused: vi.fn(),
  setOffset: vi.fn(),
  setPending: vi.fn(),
  sync: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({ warn: mocks.loggerWarn }),
}));

vi.mock('../../../session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../session-state')>()),
  appendControlledCursorTelemetry: mocks.appendTelemetry,
  getControlledCursorOffsetSeconds: mocks.getOffset,
  getVideoRecordingTabId: mocks.getTabId,
  isControlledCursorCaptureEnabled: mocks.isEnabled,
  setControlledCursorAutoPaused: mocks.setAutoPaused,
  setControlledCursorNavigationPending: mocks.setPending,
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
  restoreControlledCursorEffects,
  suspendControlledCursorEffects,
} from './navigation-effects';

beforeEach(() => {
  vi.clearAllMocks();
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
  recordingId: 'recording-1',
  shouldResume: true,
  tabId: 7,
};

it('flushes telemetry without owning recorder pause or resume transport', async () => {
  await suspendControlledCursorEffects(binding);
  expect(mocks.setPending).toHaveBeenCalledWith(true);
  expect(mocks.setAutoPaused).toHaveBeenCalledWith(true);
  expect(mocks.setOffset).toHaveBeenCalledWith(12);
  expect(mocks.appendTelemetry).toHaveBeenCalledWith({ signals: [] });
});

it('restores content telemetry state and clears pending effects', async () => {
  await restoreControlledCursorEffects(binding);
  expect(mocks.enable).toHaveBeenCalledWith(7, 'recording-1', 12);
  expect(mocks.sync).toHaveBeenCalledWith(7, 'resume');
  expect(mocks.setAutoPaused).toHaveBeenCalledWith(false);
  expect(mocks.setPending).toHaveBeenCalledWith(false);
});

it('abandons stale continuations without publishing restored state', async () => {
  let current = true;
  mocks.enable.mockImplementationOnce(async () => {
    current = false;
  });
  await restoreControlledCursorEffects({ ...binding, isCurrent: () => current });
  expect(mocks.sync).not.toHaveBeenCalled();
  expect(mocks.setPending).not.toHaveBeenCalledWith(false);
});

it('does not mutate cursor state when the binding is inactive', async () => {
  mocks.isEnabled.mockReturnValueOnce(false);
  await suspendControlledCursorEffects(binding);
  mocks.getTabId.mockReturnValueOnce(8);
  await restoreControlledCursorEffects(binding);

  expect(mocks.disable).not.toHaveBeenCalled();
  expect(mocks.enable).not.toHaveBeenCalled();
  expect(mocks.setPending).not.toHaveBeenCalled();
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
  expect(mocks.setPending).not.toHaveBeenCalledWith(false);
});

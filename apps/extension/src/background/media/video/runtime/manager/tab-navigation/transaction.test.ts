import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  abandon: vi.fn(),
  beginEffects: vi.fn(() => 11 as number | null),
  binding: {
    captureMode: 'TAB_CROP' as 'TAB' | 'TAB_CROP',
    generation: 3,
    recordingId: 'recording-1',
    streamInstanceId: 'stream-1',
    tabId: 7,
  },
  current: true,
  effects: { controlledCursor: true, cropOverlay: true },
  logger: { error: vi.fn(), warn: vi.fn() },
  restore: vi.fn(),
  status: 'RECORDING',
  stop: vi.fn(),
  suspend: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => mocks.logger,
}));
vi.mock('../../session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../session-state')>()),
  getVideoRecordingRuntimeState: () => ({ status: mocks.status }),
}));
vi.mock('../controls.stop', () => ({
  stopRecording: mocks.stop,
}));
vi.mock('./binding', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./binding')>()),
  isCurrentNavigationBinding: () => mocks.current,
  resolveNavigationBinding: (tabId: number) =>
    mocks.current && tabId === mocks.binding.tabId ? { ...mocks.binding } : null,
}));
vi.mock('./page-effects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./page-effects')>()),
  abandonTabNavigationPageEffects: mocks.abandon,
  beginTabNavigationPageEffects: mocks.beginEffects,
  resolveTabNavigationPageEffects: () => mocks.effects,
  restoreTabNavigationPageEffects: mocks.restore,
  suspendTabNavigationPageEffects: mocks.suspend,
}));

import {
  beginTabNavigationTransaction,
  bindTabNavigationDocument,
  completeTabNavigationDocument,
  failActiveTabNavigation,
  isTabNavigationTransactionPending,
  markTabNavigationManuallyPaused,
  resetTabNavigationTransactionForTests,
} from './transaction';

beforeEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  mocks.binding.captureMode = 'TAB_CROP';
  mocks.current = true;
  mocks.status = 'RECORDING';
  mocks.restore.mockResolvedValue(undefined);
  mocks.stop.mockResolvedValue({ result: 'stopped' });
  mocks.suspend.mockResolvedValue(undefined);
  resetTabNavigationTransactionForTests();
});

it('prepares, binds, and restores the current document with the retained pause intent', async () => {
  const verifier = vi.fn().mockResolvedValue(undefined);
  const transaction = beginTabNavigationTransaction(7, true);

  expect(transaction).not.toBeNull();
  expect(isTabNavigationTransactionPending()).toBe(true);
  await transaction?.preparation;
  markTabNavigationManuallyPaused();
  expect(bindTabNavigationDocument(7, 'document-1')).toBe(true);
  expect(completeTabNavigationDocument(7, 'document-1', verifier)).toBe(true);

  await vi.waitFor(() => expect(mocks.restore).toHaveBeenCalledOnce());
  expect(mocks.restore.mock.calls[0]?.[1]).toMatchObject({
    generation: 3,
    navigationEpoch: 11,
    recordingId: 'recording-1',
    shouldResume: false,
    tabId: 7,
  });
  expect(mocks.restore.mock.calls[0]?.[2]).toBe(verifier);
  await vi.waitFor(() => expect(isTabNavigationTransactionPending()).toBe(false));
});

it('rejects missing bindings and mismatched completion documents', async () => {
  mocks.current = false;
  expect(beginTabNavigationTransaction(7, true)).toBeNull();
  expect(bindTabNavigationDocument(7, 'document-1')).toBe(false);
  expect(completeTabNavigationDocument(7, 'document-1', vi.fn())).toBe(false);
  failActiveTabNavigation(new Error('ignored'));
  markTabNavigationManuallyPaused();
  expect(isTabNavigationTransactionPending()).toBe(false);

  mocks.current = true;
  const first = beginTabNavigationTransaction(7, true);
  await first?.preparation;
  expect(beginTabNavigationTransaction(7, false)).toBe(first);
  expect(bindTabNavigationDocument(7, 'document-1')).toBe(true);
  expect(completeTabNavigationDocument(8, 'document-1', vi.fn())).toBe(false);
  expect(completeTabNavigationDocument(7, 'document-2', vi.fn())).toBe(false);
});

it('supersedes a replaced document while retaining the existing navigation epoch', async () => {
  const first = beginTabNavigationTransaction(7, true);
  await first?.preparation;
  expect(bindTabNavigationDocument(7, 'document-1')).toBe(true);
  expect(bindTabNavigationDocument(7, 'document-2')).toBe(true);
  expect(mocks.beginEffects).toHaveBeenCalledOnce();

  const verifier = vi.fn().mockResolvedValue(undefined);
  expect(completeTabNavigationDocument(7, 'document-2', verifier)).toBe(true);
  await vi.waitFor(() => expect(mocks.restore).toHaveBeenCalledOnce());
  expect(mocks.restore.mock.calls[0]?.[1]).toMatchObject({ navigationEpoch: 11 });
});

it('contains suspension and optional restoration failures without stopping recording', async () => {
  mocks.binding.captureMode = 'TAB';
  mocks.suspend.mockRejectedValueOnce(new Error('suspend failed'));
  const transaction = beginTabNavigationTransaction(7, true);
  await transaction?.preparation;
  expect(mocks.logger.warn).toHaveBeenCalledWith(
    'Recording page effects could not be suspended before navigation',
    expect.any(Error)
  );

  mocks.restore.mockRejectedValueOnce(new Error('restore failed'));
  expect(completeTabNavigationDocument(7, 'document-1', vi.fn())).toBe(true);
  await vi.waitFor(() => expect(mocks.abandon).toHaveBeenCalledOnce());
  expect(mocks.stop).not.toHaveBeenCalled();
  expect(isTabNavigationTransactionPending()).toBe(false);
});

it('retries required-crop stop failures until the bound recording stops', async () => {
  vi.useFakeTimers();
  mocks.restore.mockRejectedValueOnce(new Error('crop restore failed'));
  mocks.stop
    .mockResolvedValueOnce({ error: 'first failure', result: 'failed' })
    .mockRejectedValueOnce(new Error('transport failure'))
    .mockResolvedValueOnce({ result: 'already-stopping' })
    .mockResolvedValueOnce({ result: 'stopped' });

  const transaction = beginTabNavigationTransaction(7, true);
  await transaction?.preparation;
  expect(completeTabNavigationDocument(7, 'document-1', vi.fn())).toBe(true);
  failActiveTabNavigation(new Error('duplicate failure'));
  await vi.runAllTimersAsync();

  expect(mocks.stop).toHaveBeenCalledTimes(4);
  expect(mocks.logger.error).toHaveBeenCalledWith(
    'Required recording-region restoration failed; stopping bound recording',
    expect.any(Error)
  );
  expect(mocks.logger.error).toHaveBeenCalledWith(
    'Bound recording stop failed after recording-region restoration failure',
    expect.objectContaining({ attempt: 2, error: 'already-stopping' })
  );
  expect(isTabNavigationTransactionPending()).toBe(false);
});

it('clears a required-crop retry when the binding becomes stale', async () => {
  vi.useFakeTimers();
  mocks.stop.mockImplementationOnce(async () => {
    mocks.current = false;
    return { error: 'stale failure', result: 'failed' };
  });
  const transaction = beginTabNavigationTransaction(7, true);
  await transaction?.preparation;

  failActiveTabNavigation(new Error('crop restore failed'));
  await vi.runAllTimersAsync();

  expect(mocks.stop).toHaveBeenCalledOnce();
  expect(isTabNavigationTransactionPending()).toBe(false);
});

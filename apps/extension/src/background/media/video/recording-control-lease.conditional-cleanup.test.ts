import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const {
  browserStorageSessionGetMock,
  browserStorageSessionIsAvailableMock,
  browserStorageSessionRemoveMock,
  browserStorageSessionSetMock,
  getVideoRecordingIdMock,
  getVideoRecordingTabIdMock,
  setOpenEditorAfterRecordingMock,
  setVideoRecordingIdMock,
  setVideoRecordingRuntimeStateMock,
  setVideoRecordingTabIdMock,
} = vi.hoisted(() => ({
  browserStorageSessionGetMock: vi.fn(),
  browserStorageSessionIsAvailableMock: vi.fn(),
  browserStorageSessionRemoveMock: vi.fn(),
  browserStorageSessionSetMock: vi.fn(),
  getVideoRecordingIdMock: vi.fn(),
  getVideoRecordingTabIdMock: vi.fn(),
  setOpenEditorAfterRecordingMock: vi.fn(),
  setVideoRecordingIdMock: vi.fn(),
  setVideoRecordingRuntimeStateMock: vi.fn(),
  setVideoRecordingTabIdMock: vi.fn(),
}));

vi.mock(
  '../../../composition/persistence/infrastructure/browser-storage',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../composition/persistence/infrastructure/browser-storage')
    >()),
    browserStorage: {
      session: {
        get: browserStorageSessionGetMock,
        isAvailable: browserStorageSessionIsAvailableMock,
        remove: browserStorageSessionRemoveMock,
        set: browserStorageSessionSetMock,
      },
    },
  })
);
vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({ warn: vi.fn() }),
}));
vi.mock('./session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./session-state')>()),
  getVideoRecordingId: getVideoRecordingIdMock,
  getVideoRecordingTabId: getVideoRecordingTabIdMock,
  setOpenEditorAfterRecording: setOpenEditorAfterRecordingMock,
  setVideoRecordingId: setVideoRecordingIdMock,
  setVideoRecordingTabId: setVideoRecordingTabIdMock,
}));
vi.mock('./runtime/session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./runtime/session-state')>()),
  setVideoRecordingRuntimeState: setVideoRecordingRuntimeStateMock,
}));
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import {
  clearActiveVideoRecordingLease,
  issueActiveVideoRecordingLease,
  resetActiveVideoRecordingLeaseForTests,
  validateRecordingControlCapability,
} from './recording-control-lease';

const storageKey = 'video-active-recording-lease';
const ownerSenderUrl = 'chrome-extension://test/apps/extension/src/popup/index.html';
const secondControlToken = '00000000-0000-4000-8000-000000000002';

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'control-token-1') });
  vi.setSystemTime(new Date('2026-06-09T12:00:00.000Z'));
  browserStorageSessionIsAvailableMock.mockReturnValue(true);
  browserStorageSessionGetMock.mockResolvedValue({});
  browserStorageSessionRemoveMock.mockResolvedValue(undefined);
  browserStorageSessionSetMock.mockResolvedValue(undefined);
  getVideoRecordingIdMock.mockReturnValue('recording-1');
  getVideoRecordingTabIdMock.mockReturnValue(42);
  resetActiveVideoRecordingLeaseForTests();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });

  return { promise, resolve };
}

it('restores the lease when conditional cleanup loses a late-activation race', async () => {
  const remove = createDeferred<void>();
  const shouldClear = vi.fn(() => true);

  await issueActiveVideoRecordingLease({
    captureMode: CaptureMode.TAB,
    ownerSenderUrl,
    openEditorAfterRecording: true,
  });
  browserStorageSessionSetMock.mockClear();
  browserStorageSessionRemoveMock.mockReturnValueOnce(remove.promise);

  const cleanup = clearActiveVideoRecordingLease('recording-1', { shouldClear });
  await Promise.resolve();

  shouldClear.mockReturnValue(false);
  remove.resolve();
  await cleanup;

  expect(browserStorageSessionRemoveMock).toHaveBeenCalledWith(storageKey);
  expect(browserStorageSessionSetMock).toHaveBeenCalledWith({
    [storageKey]: expect.objectContaining({
      controlToken: 'control-token-1',
      recordingId: 'recording-1',
      version: 1,
    }),
  });
  expect(
    validateRecordingControlCapability({
      controlToken: 'control-token-1',
      ownerSenderUrl,
      recordingId: 'recording-1',
    })
  ).toBe(true);
});

it('preserves a newer lease when stale conditional cleanup resumes after retry', async () => {
  const remove = createDeferred<void>();
  const shouldClear = vi.fn(() => true);

  await issueActiveVideoRecordingLease({
    captureMode: CaptureMode.TAB,
    ownerSenderUrl,
    openEditorAfterRecording: true,
  });
  browserStorageSessionRemoveMock.mockReturnValueOnce(remove.promise);

  const cleanup = clearActiveVideoRecordingLease('recording-1', { shouldClear });
  await Promise.resolve();

  getVideoRecordingIdMock.mockReturnValue('recording-2');
  vi.mocked(crypto.randomUUID).mockReturnValueOnce(secondControlToken);
  await issueActiveVideoRecordingLease({
    captureMode: CaptureMode.SCREEN,
    ownerSenderUrl,
    openEditorAfterRecording: false,
  });
  browserStorageSessionSetMock.mockClear();

  shouldClear.mockReturnValue(false);
  remove.resolve();
  await cleanup;

  expect(browserStorageSessionSetMock).toHaveBeenCalledWith({
    [storageKey]: expect.objectContaining({
      controlToken: secondControlToken,
      recordingId: 'recording-2',
      version: 1,
    }),
  });
  expect(
    validateRecordingControlCapability({
      controlToken: secondControlToken,
      ownerSenderUrl,
      recordingId: 'recording-2',
    })
  ).toBe(true);
  expect(
    validateRecordingControlCapability({
      controlToken: 'control-token-1',
      ownerSenderUrl,
      recordingId: 'recording-1',
    })
  ).toBe(false);
});

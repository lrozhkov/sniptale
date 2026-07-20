import { beforeEach, expect, it, vi } from 'vitest';

const {
  clearActiveVideoRecordingLeaseMock,
  clearRecordingStartActivationWatchdogMock,
  getVideoRecordingIdMock,
  markOffscreenDocumentReadyMock,
  notifyRecordingStartFailedMock,
  translateMock,
} = vi.hoisted(() => ({
  clearActiveVideoRecordingLeaseMock: vi.fn(),
  clearRecordingStartActivationWatchdogMock: vi.fn(),
  getVideoRecordingIdMock: vi.fn(),
  markOffscreenDocumentReadyMock: vi.fn(),
  notifyRecordingStartFailedMock: vi.fn(),
  translateMock: vi.fn((key: string) => `t:${key}`),
}));

vi.mock('../../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../../platform/i18n')>()),
  translate: translateMock,
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: vi.fn(() => ({ error: vi.fn(), log: vi.fn(), warn: vi.fn() })),
}));

vi.mock('../../../../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../../platform/runtime-messaging')>()),
  sendRuntimeMessage: vi.fn(),
}));

vi.mock('../../../session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../session-state')>()),
  finishVideoRecordingStop: vi.fn(),
  getVideoRecordingId: getVideoRecordingIdMock,
  shouldOpenVideoEditorAfterRecording: vi.fn(() => false),
}));

vi.mock('../../manager', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../manager')>()),
  notifyRecordingStartFailed: notifyRecordingStartFailedMock,
  resetRecordingTabId: vi.fn(),
}));

vi.mock('../../../manager/start-activation-watchdog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../manager/start-activation-watchdog')>()),
  clearRecordingStartActivationWatchdog: clearRecordingStartActivationWatchdogMock,
}));

vi.mock('../../offscreen-manager', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../offscreen-manager')>()),
  markOffscreenDocumentReady: markOffscreenDocumentReadyMock,
}));

vi.mock('../../../recording-control-lease', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../recording-control-lease')>()),
  clearActiveVideoRecordingLease: clearActiveVideoRecordingLeaseMock,
  restoreCurrentRecordingFromLease: vi.fn(() => false),
}));
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { handleOffscreenError, handleOffscreenReady } from './offscreen-lifecycle';

function createSendResponse() {
  return vi.fn<(response?: unknown) => void>();
}

async function flushAsyncRoute() {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.clearAllMocks();
  clearActiveVideoRecordingLeaseMock.mockResolvedValue(undefined);
  getVideoRecordingIdMock.mockReturnValue('rec-1');
  translateMock.mockImplementation((key: string) => `t:${key}`);
});

it('acknowledges stale offscreen ready signals without marking them accepted', () => {
  const sendResponse = createSendResponse();
  markOffscreenDocumentReadyMock.mockReturnValueOnce(false);

  expect(
    handleOffscreenReady(
      { type: VideoMessageType.OFFSCREEN_READY, offscreenStartupId: 'old-startup' },
      sendResponse
    )
  ).toEqual({ handled: true, keepChannelOpen: false });

  expect(markOffscreenDocumentReadyMock).toHaveBeenCalledWith('old-startup');
  expect(sendResponse).toHaveBeenCalledWith({ success: true, result: 'stale' });
});

it('uses the translated fallback for start failures without an error string', async () => {
  const sendResponse = createSendResponse();

  expect(handleOffscreenError({ phase: 'start', recordingId: 'rec-1' }, sendResponse)).toEqual({
    handled: true,
    keepChannelOpen: true,
  });
  await flushAsyncRoute();

  expect(translateMock).toHaveBeenCalledWith('background.runtime.recordingError');
  expect(clearRecordingStartActivationWatchdogMock).toHaveBeenCalledWith('rec-1');
  expect(notifyRecordingStartFailedMock).toHaveBeenCalledWith(
    't:background.runtime.recordingError'
  );
  expect(clearActiveVideoRecordingLeaseMock).toHaveBeenCalledWith('rec-1');
  expect(sendResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' });
});

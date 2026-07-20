import { beforeEach, expect, it, vi } from 'vitest';

const {
  pauseRecordingMock,
  resolveTrustedPopupRuntimeSenderUrlMock,
  resumeRecordingMock,
  stopRecordingMock,
  ensureActiveVideoRecordingLeaseHydratedMock,
  validateRecordingControlCapabilityMock,
} = vi.hoisted(() => ({
  pauseRecordingMock: vi.fn(),
  resolveTrustedPopupRuntimeSenderUrlMock: vi.fn(),
  resumeRecordingMock: vi.fn(),
  stopRecordingMock: vi.fn(),
  ensureActiveVideoRecordingLeaseHydratedMock: vi.fn(),
  validateRecordingControlCapabilityMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  Logger: class Logger {},
  createLogger: () => ({ debug: vi.fn() }),
  isTraceEnabled: vi.fn(() => false),
}));
vi.mock('../../../../../features/media-hub/storage-capacity', () => ({
  StorageEstimateInfo: class StorageEstimateInfo {},
  StorageQuotaHeadroomError: class StorageQuotaHeadroomError extends Error {},
  StorageQuotaHeadroomFailurePayload: class StorageQuotaHeadroomFailurePayload {},
  isStorageQuotaHeadroomError: vi.fn(),
  StoragePressureLevel: {},
  ensureMediaHubStorageHeadroom: vi.fn(),
  getStorageEstimateInfo: vi.fn(),
}));
vi.mock('../../manager', () => ({ startRecording: vi.fn() }));
vi.mock('./controls', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./controls')>()),
  pauseRecording: pauseRecordingMock,
  resumeRecording: resumeRecordingMock,
  stopRecording: stopRecordingMock,
}));
vi.mock('../../recording-control-lease', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../recording-control-lease')>()),
  ensureActiveVideoRecordingLeaseHydrated: ensureActiveVideoRecordingLeaseHydratedMock,
  validateRecordingControlCapability: validateRecordingControlCapabilityMock,
}));
vi.mock('../sender-policy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../sender-policy')>()),
  resolveTrustedPopupRuntimeSenderUrl: resolveTrustedPopupRuntimeSenderUrlMock,
}));
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { routeVideoControlMessage } from './control-route';
import { sendResumeRecordingResponse, sendStartRecordingResponse } from './control-route.responses';

const popupSenderUrl = 'chrome-extension://test/apps/extension/src/popup/index.html';
const sender = { url: popupSenderUrl } satisfies chrome.runtime.MessageSender;
const controlCapability = { controlToken: 'control-token-1', recordingId: 'recording-1' };

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.clearAllMocks();
  ensureActiveVideoRecordingLeaseHydratedMock.mockResolvedValue(null);
  resolveTrustedPopupRuntimeSenderUrlMock.mockReturnValue(popupSenderUrl);
  validateRecordingControlCapabilityMock.mockReturnValue(true);
});

it('maps inactive recording control failures into runtime responses after authorization', async () => {
  const cases = [
    {
      expected: { success: false, error: 'stop failed', result: 'failed' },
      message: { type: VideoMessageType.STOP_RECORDING, ...controlCapability },
      mock: stopRecordingMock,
      response: { result: 'failed', error: 'stop failed' },
    },
    {
      expected: { success: false, error: 'No active recording', result: 'no-active-recording' },
      message: { type: VideoMessageType.STOP_RECORDING, ...controlCapability },
      mock: stopRecordingMock,
      response: { result: 'no-active-recording' },
    },
    {
      expected: { success: false, error: 'pause failed', result: 'failed' },
      message: { type: VideoMessageType.PAUSE_RECORDING, ...controlCapability },
      mock: pauseRecordingMock,
      response: { result: 'failed', error: 'pause failed' },
    },
    {
      expected: { success: false, error: 'No active recording', result: 'no-active-recording' },
      message: { type: VideoMessageType.PAUSE_RECORDING, ...controlCapability },
      mock: pauseRecordingMock,
      response: { result: 'no-active-recording' },
    },
    {
      expected: { success: false, error: 'Resume is blocked', result: 'blocked' },
      message: { type: VideoMessageType.RESUME_RECORDING, ...controlCapability },
      mock: resumeRecordingMock,
      response: { result: 'blocked' },
    },
  ] as const;

  for (const routeCase of cases) {
    const sendResponse = vi.fn();
    routeCase.mock.mockResolvedValueOnce(routeCase.response);
    routeVideoControlMessage({ message: routeCase.message, sender, sendResponse });
    await flushPromises();
    expect(sendResponse).toHaveBeenCalledWith(routeCase.expected);
  }
});

it('maps accepted recording control responses into successful runtime responses', async () => {
  const sendResponse = vi.fn();
  pauseRecordingMock.mockResolvedValueOnce({ result: 'accepted' });

  routeVideoControlMessage({
    message: { type: VideoMessageType.PAUSE_RECORDING, ...controlCapability },
    sender,
    sendResponse,
  });
  await flushPromises();

  expect(sendResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' });
});

it('maps start and resume response helper branches directly', () => {
  const sendResponse = vi.fn();

  sendStartRecordingResponse({ result: 'failed', error: 'start failed' }, sendResponse);
  sendStartRecordingResponse(
    { result: 'accepted', controlToken: 'token', recordingId: 'recording-1' },
    sendResponse
  );
  sendResumeRecordingResponse({ result: 'failed', error: 'resume failed' }, sendResponse);
  sendResumeRecordingResponse({ result: 'no-active-recording' }, sendResponse);
  sendResumeRecordingResponse({ result: 'accepted' }, sendResponse);

  expect(sendResponse).toHaveBeenCalledWith({
    success: false,
    error: 'start failed',
    result: 'failed',
  });
  expect(sendResponse).toHaveBeenCalledWith({
    success: true,
    result: 'accepted',
    controlToken: 'token',
    recordingId: 'recording-1',
  });
  expect(sendResponse).toHaveBeenCalledWith({
    success: false,
    error: 'resume failed',
    result: 'failed',
  });
  expect(sendResponse).toHaveBeenCalledWith({
    success: false,
    error: 'No active recording',
    result: 'no-active-recording',
  });
  expect(sendResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  ensureMediaHubStorageHeadroomMock,
  startRecordingMock,
  pauseRecordingMock,
  resumeRecordingMock,
  stopRecordingMock,
  markPostRecordPopupActivationOwnedByPopupMock,
  loggerDebugMock,
  resolveTrustedPopupRuntimeSenderUrlMock,
  ensureActiveVideoRecordingLeaseHydratedMock,
  validateRecordingControlCapabilityMock,
  waitForVideoCaptureSurfaceRecoveryMock,
  ensureActivePageAccessRuntimeMock,
} = vi.hoisted(() => ({
  ensureMediaHubStorageHeadroomMock: vi.fn(),
  startRecordingMock: vi.fn(),
  pauseRecordingMock: vi.fn(),
  resumeRecordingMock: vi.fn(),
  stopRecordingMock: vi.fn(),
  markPostRecordPopupActivationOwnedByPopupMock: vi.fn(),
  loggerDebugMock: vi.fn(),
  resolveTrustedPopupRuntimeSenderUrlMock: vi.fn(),
  ensureActiveVideoRecordingLeaseHydratedMock: vi.fn(),
  validateRecordingControlCapabilityMock: vi.fn(),
  waitForVideoCaptureSurfaceRecoveryMock: vi.fn(),
  ensureActivePageAccessRuntimeMock: vi.fn(),
}));

vi.mock('../../capture-surface/recovery', () => ({
  waitForVideoCaptureSurfaceRecovery: waitForVideoCaptureSurfaceRecoveryMock,
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  Logger: class Logger {},
  createLogger: () => ({
    debug: loggerDebugMock,
  }),
  isTraceEnabled: vi.fn(() => false),
}));

vi.mock('../../../../../features/media-hub/storage-capacity', () => ({
  StorageEstimateInfo: class StorageEstimateInfo {},
  StorageQuotaHeadroomError: class StorageQuotaHeadroomError extends Error {},
  StorageQuotaHeadroomFailurePayload: class StorageQuotaHeadroomFailurePayload {},
  isStorageQuotaHeadroomError: vi.fn(),
  StoragePressureLevel: {},
  ensureMediaHubStorageHeadroom: ensureMediaHubStorageHeadroomMock,
  getStorageEstimateInfo: vi.fn(),
}));

vi.mock('../../manager', () => ({
  startRecording: startRecordingMock,
}));

vi.mock('./controls', () => ({
  cancelRecordingStart: vi.fn(),
  finalizeRecordingDiagnostics: vi.fn(),
  getCurrentRecordingId: vi.fn(),
  getRecordingTabId: vi.fn(),
  handleTabClose: vi.fn(),
  handleTabUpdated: vi.fn(),
  handleTabRecordingDebuggerDetach: vi.fn(),
  handleTabRecordingNavigationStart: vi.fn(),
  isRecording: vi.fn(),
  notifyRecordingStartFailed: vi.fn(),
  OVERLAY_RESTORE_RETRY_DELAYS_MS: [],
  pauseRecording: pauseRecordingMock,
  resetRecordingId: vi.fn(),
  resetRecordingTabId: vi.fn(),
  resumeRecording: resumeRecordingMock,
  stopRecording: stopRecordingMock,
  updateRecordingSettings: vi.fn(),
}));
vi.mock('../post-record-popup-activation', () => ({
  consumePostRecordPopupActivationOwnedByPopup: vi.fn(),
  markPostRecordPopupActivationOwnedByPopup: markPostRecordPopupActivationOwnedByPopupMock,
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
import type { StartRecordingMessage } from '../../../../../contracts/video/types/messages';
import { CaptureMode, VideoQuality } from '@sniptale/runtime-contracts/video/types/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { routeVideoControlMessage as routeVideoControlMessageBase } from './control-route';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';

const popupSenderUrl = 'chrome-extension://test/apps/extension/src/popup/index.html';
const controlCapability = {
  controlToken: 'control-token-1',
  recordingId: 'recording-1',
};

function createSendResponse() {
  return vi.fn();
}

function createPopupSender(): chrome.runtime.MessageSender {
  return { url: popupSenderUrl };
}

function routeVideoControlMessage(
  args: Omit<Parameters<typeof routeVideoControlMessageBase>[0], 'pageAccessPort'>
) {
  return routeVideoControlMessageBase({
    ...args,
    pageAccessPort: {
      ensureActivePageAccessRuntime: ensureActivePageAccessRuntimeMock,
      ensureNativeVisibleCaptureAuthority: vi.fn(),
    },
  });
}

function createStartMessage(): StartRecordingMessage {
  return {
    type: VideoMessageType.START_RECORDING,
    settings: {
      ...DEFAULT_VIDEO_SETTINGS,
      microphoneEnabled: true,
      microphoneDeviceId: null,
      systemAudioEnabled: true,
      outputProfile: { ...DEFAULT_VIDEO_SETTINGS.outputProfile, quality: VideoQuality.HIGH },
      countdownSeconds: 3,
      autoFadeDelay: 1500,
      interactionDiagnosticsEnabled: false,
    },
    tabId: 17,
  };
}

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function resetVideoControlMocks() {
  vi.clearAllMocks();
  ensureActiveVideoRecordingLeaseHydratedMock.mockResolvedValue(null);
  waitForVideoCaptureSurfaceRecoveryMock.mockResolvedValue(undefined);
  ensureActivePageAccessRuntimeMock.mockResolvedValue(undefined);
  resolveTrustedPopupRuntimeSenderUrlMock.mockReturnValue(popupSenderUrl);
  validateRecordingControlCapabilityMock.mockReturnValue(true);
}

async function verifiesStartRecordingSuccessWithDefaultMode() {
  const sendResponse = createSendResponse();
  ensureMediaHubStorageHeadroomMock.mockResolvedValue(undefined);
  startRecordingMock.mockResolvedValue({
    result: 'accepted',
    recordingId: 'recording-1',
    controlToken: 'control-token-1',
  });

  const handled = routeVideoControlMessage({
    message: createStartMessage(),
    resolvedTabId: 42,
    sendResponse,
    sender: createPopupSender(),
  });

  expect(handled).toBe(true);
  await flushPromises();

  expect(loggerDebugMock).toHaveBeenCalledWith('Starting video recording', {
    tabId: 17,
    captureMode: CaptureMode.TAB,
    hasViewportPreset: false,
  });
  expect(ensureMediaHubStorageHeadroomMock).toHaveBeenCalledTimes(1);
  expect(ensureActivePageAccessRuntimeMock).toHaveBeenCalledWith(
    17,
    'Page access is required for tab recording.'
  );
  expect(startRecordingMock).toHaveBeenCalledWith(
    17,
    createStartMessage().settings,
    CaptureMode.TAB,
    null,
    popupSenderUrl
  );
  expect(sendResponse).toHaveBeenCalledWith({
    success: true,
    result: 'accepted',
    recordingId: 'recording-1',
    controlToken: 'control-token-1',
  });
}

async function verifiesStartRecordingFailureResponse() {
  const sendResponse = createSendResponse();
  ensureMediaHubStorageHeadroomMock.mockRejectedValue(new Error('Quota exceeded'));

  routeVideoControlMessage({
    message: {
      ...createStartMessage(),
      captureMode: CaptureMode.SCREEN,
      viewportPresetId: 'preset-1',
    },
    resolvedTabId: 11,
    sendResponse,
    sender: createPopupSender(),
  });

  await flushPromises();

  expect(startRecordingMock).not.toHaveBeenCalled();
  expect(sendResponse).toHaveBeenCalledWith({
    success: false,
    error: 'Quota exceeded',
  });
  expect(loggerDebugMock).toHaveBeenCalledWith('Starting video recording', {
    tabId: 17,
    captureMode: CaptureMode.SCREEN,
    hasViewportPreset: true,
  });
}

async function verifiesStopRecordingRoute() {
  const sendResponse = createSendResponse();
  stopRecordingMock.mockResolvedValue({ result: 'accepted' });

  const handled = routeVideoControlMessage({
    message: { type: VideoMessageType.STOP_RECORDING, discard: true, ...controlCapability },
    sendResponse,
    sender: createPopupSender(),
  });

  expect(handled).toBe(true);
  await flushPromises();

  expect(ensureActiveVideoRecordingLeaseHydratedMock).toHaveBeenCalledTimes(1);
  expect(waitForVideoCaptureSurfaceRecoveryMock).toHaveBeenCalledTimes(1);
  expect(ensureActiveVideoRecordingLeaseHydratedMock.mock.invocationCallOrder[0]).toBeLessThan(
    waitForVideoCaptureSurfaceRecoveryMock.mock.invocationCallOrder[0]!
  );
  expect(waitForVideoCaptureSurfaceRecoveryMock.mock.invocationCallOrder[0]).toBeLessThan(
    validateRecordingControlCapabilityMock.mock.invocationCallOrder[0]!
  );
  expect(validateRecordingControlCapabilityMock).toHaveBeenCalledWith({
    controlToken: 'control-token-1',
    ownerSenderUrl: popupSenderUrl,
    recordingId: 'recording-1',
  });
  expect(markPostRecordPopupActivationOwnedByPopupMock).toHaveBeenCalledWith('recording-1');
  expect(stopRecordingMock).toHaveBeenCalledWith(true);
  expect(sendResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' });
}

async function verifiesControlWaitsForCaptureSurfaceRecovery() {
  const sendResponse = createSendResponse();
  let releaseRecovery!: () => void;
  waitForVideoCaptureSurfaceRecoveryMock.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        releaseRecovery = resolve;
      })
  );
  stopRecordingMock.mockResolvedValue({ result: 'accepted' });

  routeVideoControlMessage({
    message: { type: VideoMessageType.STOP_RECORDING, ...controlCapability },
    sendResponse,
    sender: createPopupSender(),
  });
  await flushPromises();

  expect(validateRecordingControlCapabilityMock).not.toHaveBeenCalled();
  expect(stopRecordingMock).not.toHaveBeenCalled();

  releaseRecovery();
  await flushPromises();

  expect(stopRecordingMock).toHaveBeenCalledOnce();
}

async function verifiesPauseAndResumeAsyncRoutes() {
  const pauseResponse = createSendResponse();
  const resumeResponse = createSendResponse();
  pauseRecordingMock.mockResolvedValue({ result: 'accepted' });
  resumeRecordingMock.mockRejectedValue('resume failed');

  expect(
    routeVideoControlMessage({
      message: { type: VideoMessageType.PAUSE_RECORDING, ...controlCapability },
      sender: createPopupSender(),
      sendResponse: pauseResponse,
    })
  ).toBe(true);
  expect(
    routeVideoControlMessage({
      message: { type: VideoMessageType.RESUME_RECORDING, ...controlCapability },
      sender: createPopupSender(),
      sendResponse: resumeResponse,
    })
  ).toBe(true);

  await flushPromises();

  expect(ensureActiveVideoRecordingLeaseHydratedMock).toHaveBeenCalledTimes(2);
  expect(pauseResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' });
  expect(resumeResponse).toHaveBeenCalledWith({
    success: false,
    error: 'resume failed',
  });
}

describe('video-control route', () => {
  beforeEach(resetVideoControlMocks);

  it(
    'starts recording through the async quota + manager flow',
    verifiesStartRecordingSuccessWithDefaultMode
  );
  it('returns async errors from the start flow', verifiesStartRecordingFailureResponse);
  it('handles stop recording without resolved tab routing', verifiesStopRecordingRoute);
  it(
    'waits for capture-surface recovery before external recording control',
    verifiesControlWaitsForCaptureSurfaceRecovery
  );
  it('handles pause and resume through async response helpers', verifiesPauseAndResumeAsyncRoutes);
});

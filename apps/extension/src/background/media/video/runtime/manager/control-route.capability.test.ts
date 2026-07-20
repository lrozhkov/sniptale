import { beforeEach, expect, it, vi } from 'vitest';

const {
  cancelRecordingStartMock,
  ensureMediaHubStorageHeadroomMock,
  ensureActiveVideoRecordingLeaseHydratedMock,
  ensureActivePageAccessRuntimeMock,
  getActiveVideoRecordingLeaseSnapshotMock,
  isAuthorizedCameraRecorderDocumentMock,
  resolveTrustedCameraRecorderRuntimeSenderUrlMock,
  resolveTrustedPopupRuntimeSenderUrlMock,
  startRecordingMock,
  stopRecordingMock,
  validateRecordingControlCapabilityMock,
} = vi.hoisted(() => ({
  cancelRecordingStartMock: vi.fn(),
  ensureMediaHubStorageHeadroomMock: vi.fn(),
  ensureActiveVideoRecordingLeaseHydratedMock: vi.fn(),
  ensureActivePageAccessRuntimeMock: vi.fn(),
  getActiveVideoRecordingLeaseSnapshotMock: vi.fn(),
  isAuthorizedCameraRecorderDocumentMock: vi.fn(),
  resolveTrustedCameraRecorderRuntimeSenderUrlMock: vi.fn(),
  resolveTrustedPopupRuntimeSenderUrlMock: vi.fn(),
  startRecordingMock: vi.fn(),
  stopRecordingMock: vi.fn(),
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
  ensureMediaHubStorageHeadroom: ensureMediaHubStorageHeadroomMock,
  getStorageEstimateInfo: vi.fn(),
}));
vi.mock('../../manager', () => ({ startRecording: startRecordingMock }));
vi.mock('./controls', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./controls')>()),
  cancelRecordingStart: cancelRecordingStartMock,
  stopRecording: stopRecordingMock,
}));
vi.mock('../../recording-control-lease', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../recording-control-lease')>()),
  ensureActiveVideoRecordingLeaseHydrated: ensureActiveVideoRecordingLeaseHydratedMock,
  getActiveVideoRecordingLeaseSnapshot: getActiveVideoRecordingLeaseSnapshotMock,
  validateRecordingControlCapability: validateRecordingControlCapabilityMock,
}));
vi.mock('../sender-policy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../sender-policy')>()),
  resolveTrustedCameraRecorderRuntimeSenderUrl: resolveTrustedCameraRecorderRuntimeSenderUrlMock,
  resolveTrustedPopupRuntimeSenderUrl: resolveTrustedPopupRuntimeSenderUrlMock,
}));
vi.mock('../camera-recorder-control', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../camera-recorder-control')>()),
  isAuthorizedCameraRecorderDocument: isAuthorizedCameraRecorderDocumentMock,
}));
import { CaptureMode, VideoQuality } from '@sniptale/runtime-contracts/video/types/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { routeVideoControlMessage as routeVideoControlMessageBase } from './control-route';

const popupSenderUrl = 'chrome-extension://test/apps/extension/src/popup/index.html';
const sender = { url: popupSenderUrl } satisfies chrome.runtime.MessageSender;
const controlCapability = { controlToken: 'control-token-1', recordingId: 'recording-1' };

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

function createStartMessage() {
  return {
    type: VideoMessageType.START_RECORDING,
    settings: {
      microphoneEnabled: true,
      microphoneDeviceId: null,
      systemAudioEnabled: true,
      quality: VideoQuality.HIGH,
      countdownSeconds: 3,
      autoFadeDelay: 1500,
      openEditorAfterRecording: true,
      diagnosticsEnabled: false,
    },
    tabId: 17,
  };
}

async function flushAsync(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.clearAllMocks();
  ensureActiveVideoRecordingLeaseHydratedMock.mockResolvedValue(null);
  ensureMediaHubStorageHeadroomMock.mockResolvedValue(undefined);
  ensureActivePageAccessRuntimeMock.mockResolvedValue(undefined);
  getActiveVideoRecordingLeaseSnapshotMock.mockReturnValue(null);
  isAuthorizedCameraRecorderDocumentMock.mockReturnValue(false);
  resolveTrustedCameraRecorderRuntimeSenderUrlMock.mockReturnValue(null);
  resolveTrustedPopupRuntimeSenderUrlMock.mockReturnValue(popupSenderUrl);
  startRecordingMock.mockResolvedValue({ result: 'started', recordingId: 'recording-1' });
  cancelRecordingStartMock.mockResolvedValue({ result: 'cancelled-before-active' });
  validateRecordingControlCapabilityMock.mockReturnValue(true);
});

it('rejects start recording from non-popup senders before storage and manager side effects', () => {
  const sendResponse = vi.fn();
  resolveTrustedPopupRuntimeSenderUrlMock.mockReturnValue(null);

  expect(
    routeVideoControlMessage({
      message: createStartMessage(),
      resolvedTabId: 42,
      sendResponse,
      sender: { url: 'chrome-extension://test/apps/extension/src/settings/index.html' },
    })
  ).toBe(true);

  expect(ensureMediaHubStorageHeadroomMock).not.toHaveBeenCalled();
  expect(startRecordingMock).not.toHaveBeenCalled();
  expect(sendResponse).toHaveBeenCalledWith({
    success: false,
    error: 'Unauthorized recording control sender',
  });
});

it('rejects tab recording without page access before storage and manager side effects', async () => {
  const sendResponse = vi.fn();
  ensureActivePageAccessRuntimeMock.mockRejectedValue(
    new Error('Page access is required for tab recording.')
  );

  expect(
    routeVideoControlMessage({
      message: { ...createStartMessage(), captureMode: CaptureMode.TAB },
      resolvedTabId: 42,
      sendResponse,
      sender,
    })
  ).toBe(true);
  await flushAsync();

  expect(ensureActivePageAccessRuntimeMock).toHaveBeenCalledWith(
    17,
    'Page access is required for tab recording.'
  );
  expect(ensureMediaHubStorageHeadroomMock).not.toHaveBeenCalled();
  expect(startRecordingMock).not.toHaveBeenCalled();
  expect(sendResponse).toHaveBeenCalledWith({
    success: false,
    error: 'Page access is required for tab recording.',
  });
});

it('allows screen recording without a page-access check', async () => {
  const sendResponse = vi.fn();

  expect(
    routeVideoControlMessage({
      message: { ...createStartMessage(), captureMode: CaptureMode.SCREEN },
      resolvedTabId: 42,
      sendResponse,
      sender,
    })
  ).toBe(true);
  await flushAsync();

  expect(ensureActivePageAccessRuntimeMock).not.toHaveBeenCalled();
  expect(ensureMediaHubStorageHeadroomMock).toHaveBeenCalledTimes(1);
  expect(startRecordingMock).toHaveBeenCalledWith(
    17,
    createStartMessage().settings,
    CaptureMode.SCREEN,
    undefined,
    popupSenderUrl
  );
  expect(sendResponse).toHaveBeenCalledWith({
    success: true,
    result: 'started',
    recordingId: 'recording-1',
  });
});

it('refreshes tab recording content runtime before storage and manager side effects', async () => {
  const sendResponse = vi.fn();

  expect(
    routeVideoControlMessage({
      message: { ...createStartMessage(), captureMode: CaptureMode.TAB },
      resolvedTabId: 42,
      sendResponse,
      sender,
    })
  ).toBe(true);
  await flushAsync();

  expect(ensureActivePageAccessRuntimeMock).toHaveBeenCalledWith(
    17,
    'Page access is required for tab recording.'
  );
  expect(ensureMediaHubStorageHeadroomMock).toHaveBeenCalledTimes(1);
  expect(startRecordingMock).toHaveBeenCalledWith(
    17,
    createStartMessage().settings,
    CaptureMode.TAB,
    undefined,
    popupSenderUrl
  );
});

it('rejects recording controls without a matching capability before manager side effects', async () => {
  const sendResponse = vi.fn();
  validateRecordingControlCapabilityMock.mockReturnValue(false);

  expect(
    routeVideoControlMessage({
      message: { type: VideoMessageType.STOP_RECORDING, ...controlCapability },
      sender,
      sendResponse,
    })
  ).toBe(true);

  await flushAsync();

  expect(stopRecordingMock).not.toHaveBeenCalled();
  expect(sendResponse).toHaveBeenCalledWith({
    success: false,
    error: 'Unauthorized recording control capability',
  });
});

it('authorizes start cancellation through the active recording control capability', async () => {
  const sendResponse = vi.fn();

  expect(
    routeVideoControlMessage({
      message: { type: VideoMessageType.CANCEL_RECORDING_START, ...controlCapability },
      sender,
      sendResponse,
    })
  ).toBe(true);

  await flushAsync();

  expect(validateRecordingControlCapabilityMock).toHaveBeenCalledWith({
    controlToken: 'control-token-1',
    ownerSenderUrl: popupSenderUrl,
    recordingId: 'recording-1',
  });
  expect(cancelRecordingStartMock).toHaveBeenCalledTimes(1);
  expect(sendResponse).toHaveBeenCalledWith({
    success: true,
    result: 'cancelled-before-active',
  });
});

it('hydrates the persisted recording lease before first post-restart control authorization', async () => {
  const sendResponse = vi.fn();
  stopRecordingMock.mockResolvedValue({ result: 'accepted' });

  expect(
    routeVideoControlMessage({
      message: { type: VideoMessageType.STOP_RECORDING, ...controlCapability },
      sender,
      sendResponse,
    })
  ).toBe(true);

  expect(validateRecordingControlCapabilityMock).not.toHaveBeenCalled();
  await flushAsync();

  expect(ensureActiveVideoRecordingLeaseHydratedMock).toHaveBeenCalledTimes(1);
  expect(validateRecordingControlCapabilityMock).toHaveBeenCalledWith({
    controlToken: 'control-token-1',
    ownerSenderUrl: popupSenderUrl,
    recordingId: 'recording-1',
  });
  expect(stopRecordingMock).toHaveBeenCalledTimes(1);
  expect(sendResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' });
});

import { beforeEach, expect, it, vi } from 'vitest';

const {
  ensureActiveVideoRecordingLeaseHydratedMock,
  getActiveVideoRecordingLeaseSnapshotMock,
  isAuthorizedCameraRecorderDocumentMock,
  resolveTrustedCameraRecorderRuntimeSenderUrlMock,
  resolveTrustedPopupRuntimeSenderUrlMock,
  stopRecordingMock,
  validateRecordingControlCapabilityMock,
} = vi.hoisted(() => ({
  ensureActiveVideoRecordingLeaseHydratedMock: vi.fn(),
  getActiveVideoRecordingLeaseSnapshotMock: vi.fn(),
  isAuthorizedCameraRecorderDocumentMock: vi.fn(),
  resolveTrustedCameraRecorderRuntimeSenderUrlMock: vi.fn(),
  resolveTrustedPopupRuntimeSenderUrlMock: vi.fn(),
  stopRecordingMock: vi.fn(),
  validateRecordingControlCapabilityMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({ debug: vi.fn() }),
}));
vi.mock('../../../../../features/media-hub/storage-capacity', () => ({
  ensureMediaHubStorageHeadroom: vi.fn(),
  getStorageEstimateInfo: vi.fn(),
  StorageEstimateInfo: class StorageEstimateInfo {},
  StorageQuotaHeadroomError: class StorageQuotaHeadroomError extends Error {},
  StorageQuotaHeadroomFailurePayload: class StorageQuotaHeadroomFailurePayload {},
  isStorageQuotaHeadroomError: vi.fn(),
  StoragePressureLevel: {},
}));
vi.mock('../../manager', () => ({ startRecording: vi.fn() }));
vi.mock('./controls', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./controls')>()),
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

import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { routeVideoControlMessage } from './control-route';

const popupSenderUrl = 'chrome-extension://test/apps/extension/src/popup/index.html';
const cameraSender = {
  documentId: 'camera-document-1',
  url: 'chrome-extension://test/apps/extension/src/camera-recorder/index.html',
} satisfies chrome.runtime.MessageSender;

async function flushAsync(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.clearAllMocks();
  ensureActiveVideoRecordingLeaseHydratedMock.mockResolvedValue(null);
  resolveTrustedPopupRuntimeSenderUrlMock.mockReturnValue(null);
  resolveTrustedCameraRecorderRuntimeSenderUrlMock.mockReturnValue(cameraSender.url);
  getActiveVideoRecordingLeaseSnapshotMock.mockReturnValue({
    controlToken: 'control-token-1',
    expiresAt: Date.now() + 1000,
    ownerSenderUrl: popupSenderUrl,
    recordingId: 'recording-1',
  });
  isAuthorizedCameraRecorderDocumentMock.mockReturnValue(true);
  validateRecordingControlCapabilityMock.mockReturnValue(true);
  stopRecordingMock.mockResolvedValue({ result: 'accepted' });
});

it('authorizes registered camera recorder document controls through the active lease owner', async () => {
  const sendResponse = vi.fn();

  expect(
    routeVideoControlMessage({
      message: {
        controlToken: 'control-token-1',
        recordingId: 'recording-1',
        type: VideoMessageType.STOP_RECORDING,
      },
      sender: cameraSender,
      sendResponse,
    })
  ).toBe(true);

  await flushAsync();

  expect(validateRecordingControlCapabilityMock).toHaveBeenCalledWith({
    controlToken: 'control-token-1',
    ownerSenderUrl: popupSenderUrl,
    recordingId: 'recording-1',
  });
  expect(stopRecordingMock).toHaveBeenCalledTimes(1);
  expect(sendResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' });
});

it('rejects registered camera recorder document controls with the wrong lease token', async () => {
  const sendResponse = vi.fn();
  validateRecordingControlCapabilityMock.mockReturnValue(false);

  routeVideoControlMessage({
    message: {
      controlToken: 'wrong-token',
      recordingId: 'recording-1',
      type: VideoMessageType.STOP_RECORDING,
    },
    sender: cameraSender,
    sendResponse,
  });
  await flushAsync();

  expect(stopRecordingMock).not.toHaveBeenCalled();
  expect(sendResponse).toHaveBeenCalledWith({
    success: false,
    error: 'Unauthorized recording control capability',
  });
});

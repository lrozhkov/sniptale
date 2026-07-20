import { beforeEach, expect, it, vi } from 'vitest';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { routeVideoControlMessage } from './control-route';

const {
  ensureActiveVideoRecordingLeaseHydratedMock,
  resolveTrustedPopupRuntimeSenderUrlMock,
  updateRecordingSettingsMock,
  validateRecordingControlCapabilityMock,
} = vi.hoisted(() => ({
  ensureActiveVideoRecordingLeaseHydratedMock: vi.fn(),
  resolveTrustedPopupRuntimeSenderUrlMock: vi.fn(),
  updateRecordingSettingsMock: vi.fn(),
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

vi.mock('../../manager', () => ({
  startRecording: vi.fn(),
}));

vi.mock('./controls', () => ({
  cancelRecordingStart: vi.fn(),
  notifyRecordingStartFailed: vi.fn(),
  OVERLAY_RESTORE_RETRY_DELAYS_MS: [],
  pauseRecording: vi.fn(),
  resumeRecording: vi.fn(),
  stopRecording: vi.fn(),
  updateRecordingSettings: updateRecordingSettingsMock,
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

const popupSenderUrl = 'chrome-extension://test/apps/extension/src/popup/index.html';
const controlCapability = {
  controlToken: 'control-token-1',
  recordingId: 'recording-1',
};

function createPopupSender(): chrome.runtime.MessageSender {
  return { url: popupSenderUrl };
}

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.clearAllMocks();
  ensureActiveVideoRecordingLeaseHydratedMock.mockResolvedValue(null);
  resolveTrustedPopupRuntimeSenderUrlMock.mockReturnValue(popupSenderUrl);
  validateRecordingControlCapabilityMock.mockReturnValue(true);
});

it('updates recording settings through the authorized control route', async () => {
  const sendResponse = vi.fn();
  updateRecordingSettingsMock.mockResolvedValue({ result: 'accepted' });

  const handled = routeVideoControlMessage({
    message: {
      type: VideoMessageType.UPDATE_SETTINGS,
      ...controlCapability,
      settings: { microphoneEnabled: false, webcamEnabled: true },
    },
    sender: createPopupSender(),
    sendResponse,
  });

  expect(handled).toBe(true);
  await flushPromises();

  expect(validateRecordingControlCapabilityMock).toHaveBeenCalledWith({
    controlToken: 'control-token-1',
    ownerSenderUrl: popupSenderUrl,
    recordingId: 'recording-1',
  });
  expect(updateRecordingSettingsMock).toHaveBeenCalledWith({
    microphoneEnabled: false,
    webcamEnabled: true,
  });
  expect(sendResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' });
});

it('requires recording control capability for settings updates', async () => {
  const sendResponse = vi.fn();
  validateRecordingControlCapabilityMock.mockReturnValue(false);

  const handled = routeVideoControlMessage({
    message: {
      type: VideoMessageType.UPDATE_SETTINGS,
      ...controlCapability,
      settings: { microphoneEnabled: false },
    },
    sender: createPopupSender(),
    sendResponse,
  });

  expect(handled).toBe(true);
  await flushPromises();

  expect(sendResponse).toHaveBeenCalledWith({
    success: false,
    error: 'Unauthorized recording control capability',
  });
});

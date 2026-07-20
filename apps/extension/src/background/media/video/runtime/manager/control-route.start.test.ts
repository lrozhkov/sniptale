import { expect, it, vi } from 'vitest';

const { ensureMediaHubStorageHeadroomMock, startRecordingMock } = vi.hoisted(() => ({
  ensureMediaHubStorageHeadroomMock: vi.fn(),
  startRecordingMock: vi.fn(),
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

vi.mock('../../manager', () => ({
  startRecording: startRecordingMock,
}));

import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { VideoQuality } from '@sniptale/runtime-contracts/video/types/types';
import { routeVideoControlMessage } from './control-route';

it('rejects start recording when no target tab is resolved', () => {
  const sendResponse = vi.fn();

  expect(
    routeVideoControlMessage({
      message: {
        settings: {
          autoFadeDelay: 1500,
          countdownSeconds: 3,
          diagnosticsEnabled: false,
          microphoneDeviceId: null,
          microphoneEnabled: true,
          openEditorAfterRecording: true,
          quality: VideoQuality.HIGH,
          systemAudioEnabled: true,
        },
        tabId: 17,
        type: VideoMessageType.START_RECORDING,
      },
      sendResponse,
      sender: undefined,
    })
  ).toBe(true);
  expect(ensureMediaHubStorageHeadroomMock).not.toHaveBeenCalled();
  expect(startRecordingMock).not.toHaveBeenCalled();
  expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'No tab ID' });
});

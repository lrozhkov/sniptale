import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ensureHeadroom: vi.fn(),
  ensurePageAccess: vi.fn(),
  resolveSenderUrl: vi.fn(),
  startRecording: vi.fn(),
  translate: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({ debug: vi.fn() }),
  isTraceEnabled: vi.fn(() => false),
  Logger: class Logger {},
}));

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: mocks.translate,
}));

vi.mock('../../../../../platform/i18n/format-bytes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n/format-bytes')>()),
  formatBytes: (value: number) => `${value}B`,
}));

vi.mock('../../../../../features/media-hub/storage-capacity', () => ({
  ensureMediaHubStorageHeadroom: mocks.ensureHeadroom,
  getStorageEstimateInfo: vi.fn(),
  isStorageQuotaHeadroomError: (error: unknown) =>
    Boolean((error as { isStorageQuotaHeadroomError?: unknown })?.isStorageQuotaHeadroomError),
  StorageEstimateInfo: class StorageEstimateInfo {},
  StoragePressureLevel: {},
  StorageQuotaHeadroomError: class StorageQuotaHeadroomError extends Error {},
  StorageQuotaHeadroomFailurePayload: class StorageQuotaHeadroomFailurePayload {},
}));

vi.mock('../../manager', () => ({
  startRecording: mocks.startRecording,
}));

vi.mock('../sender-policy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../sender-policy')>()),
  resolveTrustedPopupRuntimeSenderUrl: mocks.resolveSenderUrl,
}));

import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { VideoQuality } from '@sniptale/runtime-contracts/video/types/types';
import { routeVideoControlMessage } from './control-route';

function createLowHeadroomError() {
  return {
    isStorageQuotaHeadroomError: true,
    payload: {
      estimate: {
        isPersistent: false,
        pressure: 'critical',
        quota: 1000,
        remaining: 20,
        usage: 980,
        usageRatio: 0.98,
      },
      kind: 'storage-headroom-low',
      requiredFreeBytes: 50,
    },
  };
}

function createStartRecordingMessage() {
  return {
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
  };
}

describe('video control quota presentation', () => {
  it('returns localized copy for typed low-headroom failures', async () => {
    mocks.resolveSenderUrl.mockReturnValue(
      'chrome-extension://test/apps/extension/src/popup/index.html'
    );
    mocks.ensurePageAccess.mockResolvedValue(undefined);
    mocks.ensureHeadroom.mockRejectedValue(createLowHeadroomError());
    mocks.translate.mockImplementation((key: string) => {
      const translations: Record<string, string> = {
        'shared.storage.lowSpaceMiddle': 'available.',
        'shared.storage.lowSpacePrefix': 'Not enough storage:',
        'shared.storage.lowSpaceSuffix': 'Free up space and try again.',
      };

      return translations[key] ?? key;
    });
    const sendResponse = vi.fn();

    routeVideoControlMessage({
      message: createStartRecordingMessage(),
      pageAccessPort: {
        ensureActivePageAccessRuntime: mocks.ensurePageAccess,
        ensureNativeVisibleCaptureAuthority: vi.fn(),
      },
      resolvedTabId: 17,
      sendResponse,
      sender: { url: 'chrome-extension://test/apps/extension/src/popup/index.html' },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mocks.startRecording).not.toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({
      error: 'Not enough storage: 20B available. Free up space and try again.',
      success: false,
    });
  });
});

import { beforeEach, expect, it, vi } from 'vitest';
import { CaptureMode, VideoQuality } from '@sniptale/runtime-contracts/video/types/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { FakeRuntimeMessagingTransport } from '../../../../platform/runtime-messaging/fake';
const getBackgroundRuntimeMessagingMock = vi.hoisted(() => vi.fn());

vi.mock('../../../routing-contracts/runtime-messaging/services', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../routing-contracts/runtime-messaging/services')
  >()),
  getBackgroundRuntimeMessaging: getBackgroundRuntimeMessagingMock,
}));

import { sendOffscreenBeginRecording, sendOffscreenStartRecording } from './start-helpers';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';

const settings = {
  ...DEFAULT_VIDEO_SETTINGS,
  microphoneEnabled: false,
  microphoneDeviceId: null,
  webcamEnabled: false,
  webcamDeviceId: null,
  systemAudioEnabled: true,
  quality: VideoQuality.HIGH,
  countdownSeconds: 3,
  autoFadeDelay: 3,
  openEditorAfterRecording: false,
  diagnosticsEnabled: false,
};

function createTransport() {
  const transport = new FakeRuntimeMessagingTransport();
  transport.onRuntimeMessage(VideoMessageType.OFFSCREEN_START_RECORDING, () => undefined);
  return transport;
}

beforeEach(() => {
  getBackgroundRuntimeMessagingMock.mockReset();
});

it('forwards the exact surface contract without preset-derived constraints', async () => {
  const transport = createTransport();
  const surface = {
    presetId: 'wide',
    target: 'viewport' as const,
    width: 1920,
    height: 1080,
    sessionId: 'recording-1',
    leaseId: 'lease-1',
    generation: 4,
  };

  await sendOffscreenStartRecording(
    {
      captureMode: CaptureMode.TAB,
      captureSource: { mode: CaptureMode.TAB, streamId: 'stream-id' },
      generation: 4,
      recordingId: 'recording-1',
      streamInstanceId: 'stream-instance-1',
      recordingTabId: 321,
      settings,
      surface,
    },
    transport
  );

  expect(transport.runtimeRequests).toContainEqual(
    expect.objectContaining({
      type: VideoMessageType.OFFSCREEN_START_RECORDING,
      streamId: 'stream-id',
      generation: 4,
      recordingId: 'recording-1',
      tabId: 321,
      surface: { presetId: 'wide', target: 'viewport', width: 1920, height: 1080 },
    })
  );
  expect(transport.runtimeRequests[0]).not.toHaveProperty('targetResolution');
  expect(transport.runtimeRequests[0]).not.toHaveProperty('emulatedViewportCssSize');
});

it('preserves intentional 1:1 TAB_CROP coordinates', async () => {
  const transport = createTransport();
  await sendOffscreenStartRecording(
    {
      captureMode: CaptureMode.TAB_CROP,
      captureSource: {
        mode: CaptureMode.TAB_CROP,
        streamId: 'stream-area',
        cropRegion: { x: 10, y: 20, width: 300, height: 200 },
      },
      generation: 1,
      recordingId: 'recording-2',
      streamInstanceId: 'stream-instance-2',
      recordingTabId: 9,
      settings,
      surface: null,
    },
    transport
  );
  expect(transport.runtimeRequests[0]).toEqual(
    expect.objectContaining({ cropRegion: { x: 10, y: 20, width: 300, height: 200 } })
  );
});

it('omits optional tab, viewport, crop, and surface fields for a natural window source', async () => {
  const transport = createTransport();
  await sendOffscreenStartRecording(
    {
      captureMode: CaptureMode.SCREEN,
      captureSource: { mode: CaptureMode.SCREEN, streamId: 'screen' },
      generation: 2,
      recordingId: 'recording-screen',
      streamInstanceId: 'stream-instance-screen',
      recordingTabId: null,
      settings,
      surface: null,
    },
    transport
  );

  expect(transport.runtimeRequests[0]).not.toHaveProperty('tabId');
  expect(transport.runtimeRequests[0]).not.toHaveProperty('viewport');
  expect(transport.runtimeRequests[0]).not.toHaveProperty('cropRegion');
  expect(transport.runtimeRequests[0]).not.toHaveProperty('surface');
});

it('surfaces explicit and fallback source-preparation rejection messages', async () => {
  for (const response of [{ error: 'source rejected', success: false }, { success: false }]) {
    const transport = new FakeRuntimeMessagingTransport();
    transport.onRuntimeMessage(VideoMessageType.OFFSCREEN_START_RECORDING, () => response);
    await expect(
      sendOffscreenStartRecording(
        {
          captureMode: CaptureMode.TAB,
          captureSource: { mode: CaptureMode.TAB, streamId: 'stream' },
          generation: 1,
          recordingId: 'recording',
          streamInstanceId: 'stream-instance',
          recordingTabId: 1,
          settings,
          surface: null,
        },
        transport
      )
    ).rejects.toThrow(response.error ?? 'Offscreen rejected recording source preparation');
  }
});

it('begins only the matching prepared stream after an explicit offscreen acknowledgement', async () => {
  const transport = new FakeRuntimeMessagingTransport();
  transport.onRuntimeMessage(VideoMessageType.OFFSCREEN_BEGIN_RECORDING, () => ({ success: true }));
  getBackgroundRuntimeMessagingMock.mockReturnValue(transport);

  await expect(
    sendOffscreenBeginRecording({
      generation: 3,
      recordingId: 'recording',
      streamInstanceId: 'stream-instance',
    })
  ).resolves.toBeUndefined();
  expect(transport.runtimeRequests[0]).toEqual(
    expect.objectContaining({
      generation: 3,
      recordingId: 'recording',
      streamInstanceId: 'stream-instance',
      type: VideoMessageType.OFFSCREEN_BEGIN_RECORDING,
    })
  );

  const missing = new FakeRuntimeMessagingTransport();
  missing.onRuntimeMessage(VideoMessageType.OFFSCREEN_BEGIN_RECORDING, () => undefined);
  getBackgroundRuntimeMessagingMock.mockReturnValue(missing);
  await expect(
    sendOffscreenBeginRecording({
      generation: 3,
      recordingId: 'recording',
      streamInstanceId: 'stream-instance',
    })
  ).rejects.toThrow('Invalid runtime OFFSCREEN_BEGIN_RECORDING response');

  const rejected = new FakeRuntimeMessagingTransport();
  rejected.onRuntimeMessage(VideoMessageType.OFFSCREEN_BEGIN_RECORDING, () => ({ success: false }));
  getBackgroundRuntimeMessagingMock.mockReturnValue(rejected);
  await expect(
    sendOffscreenBeginRecording({
      generation: 3,
      recordingId: 'recording',
      streamInstanceId: 'stream-instance',
    })
  ).rejects.toThrow('Offscreen rejected recording start');
});

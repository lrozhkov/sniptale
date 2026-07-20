import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CaptureMode, VideoQuality } from '@sniptale/runtime-contracts/video/types/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { FakeRuntimeMessagingTransport } from '../../../../platform/runtime-messaging/fake';
import { sendOffscreenStartRecording } from './start-helpers';

const defaultSettings = {
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

beforeEach(() => {
  vi.clearAllMocks();
});

function createTransport() {
  const transport = new FakeRuntimeMessagingTransport();
  transport.onRuntimeMessage(VideoMessageType.OFFSCREEN_START_RECORDING, () => undefined);
  return transport;
}

function createViewportEmulationArgs() {
  return {
    captureMode: CaptureMode.VIEWPORT_EMULATION,
    captureSource: {
      mode: CaptureMode.TAB,
      streamId: 'stream-id',
    },
    currentRecordingId: 'recording-1',
    recordingTabId: 321,
    settings: defaultSettings,
    viewportPreset: {
      id: 'wide',
      label: 'Wide',
      width: 1920,
      height: 1080,
    },
    viewportEmulationResult: {
      cssWidth: 1295.6,
      cssHeight: 734.2,
      scale: 0.7,
    },
  };
}

function createStandardCaptureArgs() {
  return {
    captureMode: CaptureMode.TAB_CROP,
    captureSource: {
      mode: CaptureMode.TAB_CROP,
      streamId: 'stream-area',
      cropRegion: {
        x: 10,
        y: 20,
        width: 300,
        height: 200,
      },
    },
    currentRecordingId: null,
    recordingTabId: null,
    settings: defaultSettings,
    viewport: {
      width: 1440,
      height: 900,
      scrollX: 0,
      scrollY: 0,
      devicePixelRatio: 1,
    },
  };
}

function expectViewportEmulationRequest(transport: FakeRuntimeMessagingTransport) {
  expect(transport.runtimeRequests).toContainEqual(
    expect.objectContaining({
      type: VideoMessageType.OFFSCREEN_START_RECORDING,
      capabilityToken: expect.any(String),
      streamId: 'stream-id',
      settings: defaultSettings,
      tabId: 321,
      recordingId: 'recording-1',
      captureMode: CaptureMode.VIEWPORT_EMULATION,
      targetResolution: {
        width: 1920,
        height: 1080,
      },
      emulatedViewportCssSize: {
        width: 1296,
        height: 734,
      },
    })
  );
}

function expectStandardCaptureRequest(transport: FakeRuntimeMessagingTransport) {
  expect(transport.runtimeRequests).toContainEqual(
    expect.objectContaining({
      type: VideoMessageType.OFFSCREEN_START_RECORDING,
      capabilityToken: expect.any(String),
      streamId: 'stream-area',
      settings: defaultSettings,
      viewport: {
        width: 1440,
        height: 900,
        scrollX: 0,
        scrollY: 0,
        devicePixelRatio: 1,
      },
      captureMode: CaptureMode.TAB_CROP,
      cropRegion: {
        x: 10,
        y: 20,
        width: 300,
        height: 200,
      },
    })
  );
}

describe('video-manager-start-helpers viewport emulation flow', () => {
  it('forwards the reported viewport bounds for VIEWPORT_EMULATION', () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const transport = createTransport();

    sendOffscreenStartRecording(createViewportEmulationArgs(), vi.fn(), transport);

    expectViewportEmulationRequest(transport);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      '[VideoManager]',
      'Viewport emulation offscreen bounds resolved',
      expect.objectContaining({
        viewportBounds: {
          width: 1296,
          height: 734,
        },
      })
    );
  });

  it('drops crop regions from viewport-emulation payloads even when the source still has one', () => {
    const transport = createTransport();

    sendOffscreenStartRecording(
      {
        ...createViewportEmulationArgs(),
        captureSource: {
          mode: CaptureMode.TAB,
          streamId: 'stream-id',
          cropRegion: {
            x: 10,
            y: 20,
            width: 300,
            height: 200,
          },
        },
      },
      vi.fn(),
      transport
    );

    expect(transport.runtimeRequests[0]).not.toHaveProperty('cropRegion');
  });
});

describe('video-manager-start-helpers standard capture flow', () => {
  it('preserves crop regions and skips viewport emulation payload details outside emulation mode', () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const transport = createTransport();

    sendOffscreenStartRecording(createStandardCaptureArgs(), vi.fn(), transport);

    expectStandardCaptureRequest(transport);
    expect(consoleLogSpy).not.toHaveBeenCalled();
  });

  it('supports transport-only invocation without an error callback', async () => {
    const transport = createTransport();

    await expect(
      sendOffscreenStartRecording(createStandardCaptureArgs(), transport)
    ).resolves.toBeUndefined();

    expectStandardCaptureRequest(transport);
  });
});

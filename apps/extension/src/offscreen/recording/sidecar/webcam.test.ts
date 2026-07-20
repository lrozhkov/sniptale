// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';
import { VideoQuality } from '@sniptale/runtime-contracts/video/types/types';
import { createWebcamSidecarRecorder } from './webcam';

class FakeMediaRecorder {
  static isTypeSupported() {
    return true;
  }

  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(
    readonly stream: MediaStream,
    readonly options: MediaRecorderOptions
  ) {}
}

const stopTrack = vi.fn();

function createSettings() {
  return {
    quality: VideoQuality.HIGH,
    webcamDeviceId: null,
    webcamEnabled: true,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: vi.fn().mockResolvedValue({
        getTracks: () => [{ stop: stopTrack }],
        getVideoTracks: () => [{ getSettings: () => ({ height: 720, width: 1280 }) }],
      }),
    },
  });
});

it('stops webcam tracks when the recorder emits a terminal error', async () => {
  const recorder = await createWebcamSidecarRecorder({
    baseRecordingId: 'recording-1',
    settings: createSettings() as never,
  });

  recorder?.recorder.onerror?.(new ErrorEvent('error'));

  expect(stopTrack).toHaveBeenCalledOnce();
});

import { beforeEach, expect, it, vi } from 'vitest';

const { normalizeMultiSourceVideoStreamMock } = vi.hoisted(() => ({
  normalizeMultiSourceVideoStreamMock: vi.fn(),
}));

vi.mock('../stream/fixed-video-output', () => ({
  createFixedVideoOutputStream: normalizeMultiSourceVideoStreamMock,
}));

import {
  DEFAULT_VIDEO_RECORDING_OUTPUT_SETTINGS,
  VideoQuality,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { createMicrophoneRecorder, createSourceRecorders } from './recorders';
import { createAudioStream, createStream } from './media-stream.test-support';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';

class FakeMediaRecorder {
  static isTypeSupported() {
    return false;
  }

  mimeType: string;

  constructor(_stream: MediaStream, options: MediaRecorderOptions) {
    this.mimeType = options.mimeType ?? 'video/webm';
  }
}

function createSettings(microphoneEnabled: boolean): VideoRecordingSettings {
  return {
    ...DEFAULT_VIDEO_SETTINGS,
    autoFadeDelay: 0,
    countdownSeconds: 0,
    diagnosticsEnabled: false,
    microphoneDeviceId: 'mic-1',
    microphoneEnabled,
    openEditorAfterRecording: false,
    output: DEFAULT_VIDEO_RECORDING_OUTPUT_SETTINGS,
    quality: VideoQuality.HIGH,
    sourceCount: 2,
    systemAudioEnabled: false,
    webcamDeviceId: null,
    webcamEnabled: false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: vi.fn().mockResolvedValue(createAudioStream()),
    },
  });
});

it('falls back to video/webm when audio/webm is unavailable for microphone recorders', async () => {
  const recorder = await createMicrophoneRecorder('rec', createSettings(true));

  expect(recorder?.recorder.mimeType).toBe('video/webm');
});

it('rejects an unavailable selected video codec instead of falling back to plain webm', async () => {
  normalizeMultiSourceVideoStreamMock.mockImplementation(async (stream: MediaStream) => ({
    dimensions: { height: 720, width: 1280 },
    frameRate: 30,
    stream,
  }));

  await expect(
    createSourceRecorders({
      baseRecordingId: 'rec',
      settings: createSettings(false),
      sources: [{ label: 'Window 1', stream: createStream(1280, 720) }],
    })
  ).rejects.toThrow('selected recording container and codec are not supported');
});

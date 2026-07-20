import { beforeEach, expect, it, vi } from 'vitest';

const { normalizeMultiSourceVideoStreamMock } = vi.hoisted(() => ({
  normalizeMultiSourceVideoStreamMock: vi.fn(),
}));

vi.mock('./normalize', () => ({
  normalizeMultiSourceVideoStream: normalizeMultiSourceVideoStreamMock,
}));

import {
  VideoQuality,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { createMicrophoneRecorder, createSourceRecorders } from './recorders';
import { createAudioStream, createStream } from './media-stream.test-support';

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
    autoFadeDelay: 0,
    countdownSeconds: 0,
    diagnosticsEnabled: false,
    microphoneDeviceId: 'mic-1',
    microphoneEnabled,
    openEditorAfterRecording: false,
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

it('falls back to video/webm when the configured video quality mime type is unavailable', async () => {
  normalizeMultiSourceVideoStreamMock.mockImplementation(async (stream: MediaStream) => ({
    dimensions: { height: 720, width: 1280 },
    stream,
  }));

  const [recorder] = await createSourceRecorders({
    baseRecordingId: 'rec',
    settings: createSettings(false),
    sources: [{ label: 'Window 1', stream: createStream(1280, 720) }],
  });

  expect(recorder?.recorder.mimeType).toBe('video/webm');
});

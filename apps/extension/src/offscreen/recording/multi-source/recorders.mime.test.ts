import { beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { createRecordingStagingCoordinatorTestDouble } from '../encoding/artifact-session.test-support';
import { createMicrophoneRecorder } from './recorders';
import { createAudioStream } from './media-stream.test-support';

class MediaRecorderMock {
  static isTypeSupported = vi.fn((mimeType: string) => mimeType === 'video/webm');
  mimeType: string;
  ondataavailable = null;
  onerror = null;
  onstart = null;
  onstop = null;
  state: RecordingState = 'inactive';

  constructor(_stream: MediaStream, options: MediaRecorderOptions) {
    this.mimeType = options.mimeType ?? '';
  }
}

beforeEach(() => {
  vi.stubGlobal('MediaRecorder', MediaRecorderMock);
});

it('uses the supported WebM MIME for a separately staged microphone artifact', async () => {
  const audio = createAudioStream();
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue(audio) },
  });
  const recorder = await createMicrophoneRecorder(
    'rec',
    { ...DEFAULT_VIDEO_SETTINGS, microphoneEnabled: true },
    createRecordingStagingCoordinatorTestDouble()
  );
  expect(recorder?.recorder.mimeType).toBe('video/webm');
  expect(recorder?.artifactSession).toBeDefined();
});

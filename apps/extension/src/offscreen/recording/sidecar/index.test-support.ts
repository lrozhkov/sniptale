import { vi } from 'vitest';
import {
  VideoQuality,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';

export class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];
  static isTypeSupported() {
    return true;
  }

  mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onstop: (() => void) | null = null;
  state: RecordingState = 'inactive';

  constructor(
    readonly stream: MediaStream,
    options: MediaRecorderOptions
  ) {
    this.mimeType = options.mimeType ?? 'video/webm';
    FakeMediaRecorder.instances.push(this);
  }

  pause() {
    this.state = 'paused';
  }

  requestData() {
    this.ondataavailable?.({ data: new Blob(['webcam'], { type: this.mimeType }) });
  }

  resume() {
    this.state = 'recording';
  }

  start() {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
    this.onstop?.();
  }
}

export function createSettings(
  overrides: Partial<VideoRecordingSettings> = {}
): VideoRecordingSettings {
  return {
    autoFadeDelay: 3,
    countdownSeconds: 0,
    diagnosticsEnabled: false,
    microphoneDeviceId: null,
    microphoneEnabled: false,
    openEditorAfterRecording: false,
    quality: VideoQuality.HIGH,
    systemAudioEnabled: false,
    webcamDeviceId: 'cam-1',
    webcamEnabled: true,
    ...overrides,
  };
}

export function createStream(
  params: { hasVideo?: boolean; stop?: () => void; trackSettings?: MediaTrackSettings } = {}
): MediaStream {
  const track = {
    getSettings: () => params.trackSettings ?? { height: 720, width: 1280 },
    stop: params.stop ?? vi.fn(),
  };

  return {
    getAudioTracks: () => [],
    getTracks: () => [track],
    getVideoTracks: () => (params.hasVideo === false ? [] : [track]),
  } as unknown as MediaStream;
}

export function installSidecarNavigator(stream = createStream()) {
  vi.stubGlobal('navigator', {
    mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
  });
}

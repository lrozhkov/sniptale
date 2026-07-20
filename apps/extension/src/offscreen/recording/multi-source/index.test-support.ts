import {
  VideoQuality,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';

export function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

export class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];
  static isTypeSupported() {
    return true;
  }

  mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onstop: (() => void) | null = null;
  state: RecordingState = 'inactive';

  constructor(
    readonly stream: MediaStream,
    options: MediaRecorderOptions
  ) {
    this.mimeType = options.mimeType ?? 'video/webm';
    FakeMediaRecorder.instances.push(this);
  }

  requestData() {
    this.ondataavailable?.({ data: new Blob(['chunk'], { type: this.mimeType }) });
  }

  start() {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
    this.onstop?.();
  }
}

export function createSettings(): VideoRecordingSettings {
  return {
    autoFadeDelay: 3,
    controlledCursorCaptureEnabled: false,
    countdownSeconds: 0,
    diagnosticsEnabled: false,
    microphoneDeviceId: null,
    microphoneEnabled: true,
    openEditorAfterRecording: true,
    quality: VideoQuality.HIGH,
    sourceCount: 2,
    systemAudioEnabled: false,
    webcamDeviceId: 'cam-1',
    webcamEnabled: false,
  };
}

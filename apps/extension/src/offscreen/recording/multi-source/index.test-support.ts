import {
  DEFAULT_VIDEO_OUTPUT_PROFILE,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';

export function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

export class FakeMediaRecorder {
  static autoEmitStart = true;
  static instances: FakeMediaRecorder[] = [];
  static isTypeSupported() {
    return true;
  }

  mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onstart: (() => void) | null = null;
  onstop: (() => void) | null = null;
  readonly startTimeslices: Array<number | undefined> = [];
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

  emitStart() {
    this.onstart?.();
  }

  emitUnexpectedStop() {
    this.state = 'inactive';
    this.onstop?.();
  }

  start(timeslice?: number) {
    this.startTimeslices.push(timeslice);
    this.state = 'recording';
    if (FakeMediaRecorder.autoEmitStart) {
      this.emitStart();
    }
  }

  stop() {
    this.state = 'inactive';
    this.onstop?.();
  }
}

export function createSettings(): VideoRecordingSettings {
  return {
    ...DEFAULT_VIDEO_SETTINGS,
    autoFadeDelay: 3,
    controlledCursorCaptureEnabled: false,
    countdownSeconds: 0,
    diagnosticsEnabled: false,
    microphoneDeviceId: null,
    microphoneEnabled: true,
    outputProfile: DEFAULT_VIDEO_OUTPUT_PROFILE,
    sourceCount: 2,
    systemAudioEnabled: false,
    webcamDeviceId: 'cam-1',
    webcamEnabled: false,
  };
}

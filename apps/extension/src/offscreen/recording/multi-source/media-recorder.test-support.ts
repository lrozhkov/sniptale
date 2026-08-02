import { vi } from 'vitest';
import { TestMediaStream } from './media-stream.test-support';

export class TestMediaRecorder extends EventTarget implements MediaRecorder {
  readonly audioBitsPerSecond = 0;
  readonly mimeType = 'video/webm';
  ondataavailable: MediaRecorder['ondataavailable'] = null;
  onerror: MediaRecorder['onerror'] = null;
  onpause: MediaRecorder['onpause'] = null;
  onresume: MediaRecorder['onresume'] = null;
  onstart: MediaRecorder['onstart'] = null;
  onstop: MediaRecorder['onstop'] = null;
  readonly requestData = vi.fn();
  state: RecordingState;
  readonly stop = vi.fn(() => {
    this.state = 'inactive';
  });
  readonly stream: MediaStream;
  readonly videoBitsPerSecond = 0;

  constructor(options: { state?: RecordingState; stream?: MediaStream } = {}) {
    super();
    this.state = options.state ?? 'inactive';
    this.stream = options.stream ?? new TestMediaStream([]);
  }

  pause(): void {
    this.state = 'paused';
  }

  resume(): void {
    this.state = 'recording';
  }

  start(): void {
    this.state = 'recording';
  }
}

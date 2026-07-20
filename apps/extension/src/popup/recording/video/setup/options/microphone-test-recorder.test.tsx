// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MicrophoneTestRecorder } from './microphone-test-recorder';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

class FakeRecorder extends EventTarget implements MediaRecorder {
  static instances: FakeRecorder[] = [];
  static isTypeSupported() {
    return true;
  }
  audioBitsPerSecond = 0;
  mimeType = 'audio/webm';
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onpause: (() => void) | null = null;
  onresume: (() => void) | null = null;
  onstart: (() => void) | null = null;
  onstop: (() => void) | null = null;
  readonly stream: MediaStream;
  state: RecordingState = 'inactive';
  videoBitsPerSecond = 0;

  constructor(stream: MediaStream) {
    super();
    this.stream = stream;
    FakeRecorder.instances.push(this);
  }

  pause() {}
  requestData() {}
  resume() {}

  start() {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['test'], { type: 'audio/webm' }) } as BlobEvent);
    this.onstop?.();
  }
}

class TestMediaStream extends EventTarget implements MediaStream {
  active = true;
  id = 'test-stream';
  onaddtrack = null;
  onremovetrack = null;
  addTrack(): void {}
  clone(): MediaStream {
    return this;
  }
  getAudioTracks(): MediaStreamAudioTrack[] {
    return [];
  }
  getTrackById(): MediaStreamTrack | null {
    return null;
  }
  getTracks(): MediaStreamTrack[] {
    return [];
  }
  getVideoTracks(): MediaStreamVideoTrack[] {
    return [];
  }
  removeTrack(): void {}
}

function renderRecorder() {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(<MicrophoneTestRecorder stream={new TestMediaStream()} />);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('MediaRecorder', FakeRecorder);
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:test'),
    revokeObjectURL: vi.fn(),
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  FakeRecorder.instances = [];
});

it('starts, stops, plays, and revokes a microphone test recording on close', () => {
  renderRecorder();

  act(() => {
    container?.querySelector<HTMLButtonElement>('button')?.click();
  });
  expect(FakeRecorder.instances[0]?.state).toBe('recording');

  act(() => {
    container
      ?.querySelector<HTMLButtonElement>('[aria-label="popup.video.microphoneTestStop"]')
      ?.click();
  });
  expect(URL.createObjectURL).toHaveBeenCalledOnce();
  expect(container?.querySelector('audio')?.getAttribute('src')).toBe('blob:test');

  act(() => {
    container
      ?.querySelector<HTMLButtonElement>('[aria-label="popup.video.microphoneTestPlay"]')
      ?.click();
  });
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();

  act(() => root?.unmount());
  root = null;

  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
});

it('replaces the previous test recording when recording again', () => {
  renderRecorder();

  act(() => {
    container
      ?.querySelector<HTMLButtonElement>('[aria-label="popup.video.microphoneTestRecord"]')
      ?.click();
  });
  act(() => {
    container
      ?.querySelector<HTMLButtonElement>('[aria-label="popup.video.microphoneTestStop"]')
      ?.click();
  });
  act(() => {
    container
      ?.querySelector<HTMLButtonElement>('[aria-label="popup.video.microphoneTestRecord"]')
      ?.click();
  });

  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
  expect(FakeRecorder.instances[1]?.state).toBe('recording');
});

it('auto-stops microphone test recording after 30 seconds', () => {
  renderRecorder();

  act(() => {
    container?.querySelector<HTMLButtonElement>('button')?.click();
    vi.advanceTimersByTime(30_000);
  });

  expect(FakeRecorder.instances[0]?.state).toBe('inactive');
  expect(URL.createObjectURL).toHaveBeenCalledOnce();
});

it('does not create a retained test blob when closed while recording', () => {
  renderRecorder();

  act(() => {
    container?.querySelector<HTMLButtonElement>('button')?.click();
  });

  act(() => root?.unmount());
  root = null;

  expect(FakeRecorder.instances[0]?.state).toBe('inactive');
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});

import { vi } from 'vitest';

abstract class TestMediaStreamTrackBase extends EventTarget implements MediaStreamTrack {
  contentHint = '';
  enabled = true;
  readonly id: string;
  abstract readonly kind: 'audio' | 'video';
  readonly label = '';
  readonly muted = false;
  onended: ((this: MediaStreamTrack, event: Event) => unknown) | null = null;
  onmute: ((this: MediaStreamTrack, event: Event) => unknown) | null = null;
  onunmute: ((this: MediaStreamTrack, event: Event) => unknown) | null = null;
  readonly readyState: MediaStreamTrackState = 'live';
  readonly stop = vi.fn();

  constructor(
    kind: 'audio' | 'video',
    protected readonly settings: MediaTrackSettings = {}
  ) {
    super();
    this.id = `${kind}-track`;
  }

  applyConstraints(): Promise<void> {
    return Promise.resolve();
  }

  abstract clone(): MediaStreamTrack;

  getCapabilities(): MediaTrackCapabilities {
    return {};
  }

  getConstraints(): MediaTrackConstraints {
    return {};
  }

  getSettings(): MediaTrackSettings {
    return this.settings;
  }
}

class TestAudioTrack extends TestMediaStreamTrackBase implements MediaStreamAudioTrack {
  readonly kind = 'audio';

  constructor(settings: MediaTrackSettings = {}) {
    super('audio', settings);
  }

  clone(): MediaStreamAudioTrack {
    return new TestAudioTrack(this.settings);
  }
}

class TestVideoTrack extends TestMediaStreamTrackBase implements MediaStreamVideoTrack {
  readonly kind = 'video';

  constructor(settings: MediaTrackSettings = {}) {
    super('video', settings);
  }

  clone(): MediaStreamVideoTrack {
    return new TestVideoTrack(this.settings);
  }
}

export class TestMediaStream extends EventTarget implements MediaStream {
  readonly active = true;
  readonly id = 'test-media-stream';
  onaddtrack: ((this: MediaStream, event: MediaStreamTrackEvent) => unknown) | null = null;
  onremovetrack: ((this: MediaStream, event: MediaStreamTrackEvent) => unknown) | null = null;

  constructor(private readonly tracks: Array<MediaStreamAudioTrack | MediaStreamVideoTrack>) {
    super();
  }

  addTrack(): void {}

  clone(): MediaStream {
    return new TestMediaStream([...this.tracks]);
  }

  getAudioTracks(): MediaStreamAudioTrack[] {
    return this.tracks.filter((track): track is MediaStreamAudioTrack => track.kind === 'audio');
  }

  getTrackById(trackId: string): MediaStreamTrack | null {
    return this.tracks.find((track) => track.id === trackId) ?? null;
  }

  getTracks(): MediaStreamTrack[] {
    return [...this.tracks];
  }

  getVideoTracks(): MediaStreamVideoTrack[] {
    return this.tracks.filter((track): track is MediaStreamVideoTrack => track.kind === 'video');
  }

  removeTrack(): void {}
}

export function createStream(width: number, height: number): MediaStream {
  return new TestMediaStream([new TestVideoTrack({ height, width })]);
}

export function createTrackedStream() {
  const track = new TestVideoTrack({ height: 720, width: 1280 });
  return Object.assign(new TestMediaStream([track]), { track });
}

export function createAudioStream(): MediaStream {
  return new TestMediaStream([new TestAudioTrack()]);
}

export function createEmptyStream(): MediaStream {
  return new TestMediaStream([]);
}

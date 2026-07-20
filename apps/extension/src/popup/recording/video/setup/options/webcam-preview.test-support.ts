import { vi } from 'vitest';

class TestPreviewVideoTrack extends EventTarget implements MediaStreamVideoTrack {
  contentHint = '';
  enabled = true;
  readonly id = 'preview-video-track';
  readonly kind = 'video';
  readonly label = 'Preview camera';
  readonly muted = false;
  onended: ((this: MediaStreamTrack, event: Event) => unknown) | null = null;
  onmute: ((this: MediaStreamTrack, event: Event) => unknown) | null = null;
  onunmute: ((this: MediaStreamTrack, event: Event) => unknown) | null = null;
  readonly readyState: MediaStreamTrackState = 'live';
  readonly stop: () => void;

  constructor(
    private readonly settings: MediaTrackSettings,
    stop: () => void = vi.fn()
  ) {
    super();
    this.stop = stop;
  }

  applyConstraints(): Promise<void> {
    return Promise.resolve();
  }

  clone(): MediaStreamVideoTrack {
    return new TestPreviewVideoTrack(this.settings, this.stop);
  }

  getCapabilities(): MediaTrackCapabilities {
    return {
      frameRate: { max: 30, min: 15 },
      height: { max: 720, min: 240 },
      width: { max: 1280, min: 320 },
    };
  }

  getConstraints(): MediaTrackConstraints {
    return {};
  }

  getSettings(): MediaTrackSettings {
    return this.settings;
  }
}

class TestPreviewMediaStream extends EventTarget implements MediaStream {
  readonly active = true;
  readonly id = 'preview-stream';
  onaddtrack: ((this: MediaStream, event: MediaStreamTrackEvent) => unknown) | null = null;
  onremovetrack: ((this: MediaStream, event: MediaStreamTrackEvent) => unknown) | null = null;

  constructor(private readonly track: TestPreviewVideoTrack) {
    super();
  }

  addTrack(): void {}

  clone(): MediaStream {
    return new TestPreviewMediaStream(this.track);
  }

  getAudioTracks(): MediaStreamAudioTrack[] {
    return [];
  }

  getTrackById(trackId: string): MediaStreamTrack | null {
    return this.track.id === trackId ? this.track : null;
  }

  getTracks(): MediaStreamTrack[] {
    return [this.track];
  }

  getVideoTracks(): MediaStreamVideoTrack[] {
    return [this.track];
  }

  removeTrack(): void {}
}

export function createPopupPreviewStream({
  settings = { frameRate: 30, height: 720, width: 1280 },
  stop = vi.fn(),
}: {
  settings?: MediaTrackSettings;
  stop?: () => void;
} = {}): MediaStream {
  return new TestPreviewMediaStream(new TestPreviewVideoTrack(settings, stop));
}

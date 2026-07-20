// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../i18n', () => ({
  translate: (key: string) => key,
}));

type Listener = () => void;

class FakeVideoElement {
  private _currentTime = 0;
  duration = 1;
  muted = false;
  playsInline = false;
  preload = '';
  private _src = '';
  videoHeight = 360;
  videoWidth = 640;
  private listeners = new Map<string, Set<Listener>>();

  addEventListener(eventName: string, listener: Listener) {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }
    this.listeners.get(eventName)?.add(listener);
  }

  removeEventListener(eventName: string, listener: Listener) {
    this.listeners.get(eventName)?.delete(listener);
  }

  emit(eventName: 'error' | 'loadeddata' | 'seeked') {
    this.listeners.get(eventName)?.forEach((listener) => listener());
  }

  get currentTime() {
    return this._currentTime;
  }

  set currentTime(value: number) {
    this._currentTime = value;
    queueMicrotask(() => this.emit('seeked'));
  }

  get src() {
    return this._src;
  }

  set src(value: string) {
    this._src = value;
    if (value) {
      queueMicrotask(() => this.emit('loadeddata'));
    }
  }
}

class FakeCanvasElement {
  static failContext = false;
  static returnNullBlob = false;
  static lastContext: {
    drawImage: ReturnType<typeof vi.fn>;
    fillRect: ReturnType<typeof vi.fn>;
    fillStyle: string;
    restore: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    scale: ReturnType<typeof vi.fn>;
    translate: ReturnType<typeof vi.fn>;
  } | null = null;
  height = 0;
  width = 0;

  getContext(_type: '2d') {
    if (FakeCanvasElement.failContext) {
      return null;
    }

    FakeCanvasElement.lastContext = {
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      fillStyle: '',
      restore: vi.fn(),
      save: vi.fn(),
      scale: vi.fn(),
      translate: vi.fn(),
    };
    return FakeCanvasElement.lastContext;
  }

  toBlob(callback: (value: Blob | null) => void, type?: string, quality?: number) {
    if (FakeCanvasElement.returnNullBlob) {
      callback(null);
      return;
    }

    callback(new Blob(['thumb'], { type: type ?? 'image/webp' }));
    expect(quality).toBe(0.88);
  }

  static reset() {
    FakeCanvasElement.failContext = false;
    FakeCanvasElement.returnNullBlob = false;
    FakeCanvasElement.lastContext = null;
  }
}

let createElementSpy: ReturnType<typeof vi.spyOn>;
let createObjectURLSpy: ReturnType<typeof vi.spyOn>;
let revokeObjectURLSpy: ReturnType<typeof vi.spyOn>;
let latestVideo: FakeVideoElement | null = null;
let originalCreateElement: typeof document.createElement;

beforeEach(() => {
  FakeCanvasElement.reset();
  latestVideo = null;
  originalCreateElement = document.createElement.bind(document);
  createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:video');
  revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
    if (tagName === 'video') {
      latestVideo = new FakeVideoElement();
      return latestVideo as unknown as HTMLVideoElement;
    }

    if (tagName === 'canvas') {
      return new FakeCanvasElement() as unknown as HTMLCanvasElement;
    }

    return originalCreateElement(tagName);
  });
});

afterEach(() => {
  createElementSpy.mockRestore();
  createObjectURLSpy.mockRestore();
  revokeObjectURLSpy.mockRestore();
});

it('creates a video thumbnail blob and seeks into longer videos', async () => {
  const { createVideoThumbnailBlob } = await import('./video-thumbnails');
  const thumbnailBlob = await createVideoThumbnailBlob(
    new Blob(['video'], { type: 'video/webm' }),
    320,
    180
  );

  expect(thumbnailBlob.type).toBe('image/webp');
  expect(createObjectURLSpy).toHaveBeenCalled();
  expect(FakeCanvasElement.lastContext?.fillRect).toHaveBeenCalledWith(0, 0, 320, 180);
  expect(FakeCanvasElement.lastContext?.drawImage).toHaveBeenCalledWith(
    latestVideo as unknown as HTMLVideoElement,
    0,
    0
  );
  expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:video');
  expect(latestVideo?.src).toBe('');
});

it('skips seeking for very short videos', async () => {
  const { createVideoThumbnailBlob } = await import('./video-thumbnails');
  latestVideo = new FakeVideoElement();
  latestVideo.duration = 0.05;
  createElementSpy.mockImplementation((tagName: string) => {
    if (tagName === 'video') {
      return latestVideo as unknown as HTMLVideoElement;
    }

    if (tagName === 'canvas') {
      return new FakeCanvasElement() as unknown as HTMLCanvasElement;
    }

    return originalCreateElement(tagName);
  });
  const thumbnailBlob = await createVideoThumbnailBlob(new Blob(['video'], { type: 'video/webm' }));

  expect(thumbnailBlob.type).toBe('image/webp');
  expect(latestVideo?.currentTime).toBe(0);
});

it('throws translated errors when canvas setup or blob creation fails', async () => {
  const { createVideoThumbnailBlob } = await import('./video-thumbnails');

  FakeCanvasElement.failContext = true;
  await expect(
    createVideoThumbnailBlob(new Blob(['video'], { type: 'video/webm' }))
  ).rejects.toThrow('shared.runtime.thumbnailContextFailed');

  FakeCanvasElement.reset();
  FakeCanvasElement.returnNullBlob = true;
  await expect(
    createVideoThumbnailBlob(new Blob(['video'], { type: 'video/webm' }))
  ).rejects.toThrow('shared.runtime.thumbnailContextFailed');
});

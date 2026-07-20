// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../i18n')>()),
  translate: (key: string) => key,
}));

class FakeFileReader {
  static nextError: Error | null = null;
  static nextResult: string | null = null;

  error: Error | null = null;
  onerror: (() => void) | null = null;
  onloadend: (() => void) | null = null;
  result: string | null = null;

  readAsDataURL(_blob: Blob) {
    if (FakeFileReader.nextError) {
      this.error = FakeFileReader.nextError;
      this.onerror?.();
      return;
    }

    this.result = FakeFileReader.nextResult ?? 'data:image/png;base64,Zm9v';
    this.onloadend?.();
  }

  static reset() {
    FakeFileReader.nextError = null;
    FakeFileReader.nextResult = null;
  }
}

class FakeOffscreenCanvas {
  static context: {
    drawImage: ReturnType<typeof vi.fn>;
    fillRect: ReturnType<typeof vi.fn>;
    fillStyle: string;
  } | null = {
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    fillStyle: '',
  };
  static convertToBlobMock = vi.fn().mockResolvedValue(new Blob(['thumb'], { type: 'image/webp' }));

  constructor(
    public readonly width: number,
    public readonly height: number
  ) {}

  getContext(_type: '2d') {
    return FakeOffscreenCanvas.context;
  }

  convertToBlob(options: ImageEncodeOptions) {
    return FakeOffscreenCanvas.convertToBlobMock(options);
  }

  static reset() {
    FakeOffscreenCanvas.context = {
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      fillStyle: '',
    };
    FakeOffscreenCanvas.convertToBlobMock = vi
      .fn()
      .mockResolvedValue(new Blob(['thumb'], { type: 'image/webp' }));
  }
}

beforeEach(() => {
  FakeFileReader.reset();
  FakeOffscreenCanvas.reset();
  vi.stubGlobal('FileReader', FakeFileReader as unknown as typeof FileReader);
  vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas as unknown as typeof OffscreenCanvas);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('media-utils conversion flows', () => {
  it('converts base64 and encoded data urls to blobs and blobs to data urls', async () => {
    const { blobToDataUrl, dataUrlToBlob } = await import('./data-url');
    const base64Blob = await dataUrlToBlob('data:image/png;base64,Zm9v');
    const encodedBlob = await dataUrlToBlob('data:text/plain,hello%20world');
    const defaultMimeBlob = await dataUrlToBlob('data:;base64,Zm9v');

    expect(base64Blob.type).toBe('image/png');
    expect(base64Blob.size).toBe(3);
    expect(encodedBlob.type).toBe('text/plain');
    expect(encodedBlob.size).toBe(11);
    expect(defaultMimeBlob.size).toBe(3);
    await expect(blobToDataUrl(new Blob(['image'], { type: 'image/png' }))).resolves.toBe(
      'data:image/png;base64,Zm9v'
    );
  });

  it('round-trips codec-bearing recording data urls without turning them into text payloads', async () => {
    FakeFileReader.nextResult = 'data:video/webm;codecs=vp9,opus;base64,Zm9v';
    const { blobToDataUrl, dataUrlToBlob } = await import('./data-url');

    const normalizedDataUrl = await blobToDataUrl(
      new Blob(['recording'], { type: 'video/webm;codecs=vp9,opus' })
    );
    const restoredBlob = await dataUrlToBlob('data:video/webm;codecs=vp9,opus;base64,Zm9v');

    expect(normalizedDataUrl).toBe('data:video/webm;base64,Zm9v');
    expect(restoredBlob.type).toBe('video/webm;codecs=vp9,opus');
    expect(restoredBlob.size).toBe(3);
  });

  it('surfaces translated file-reader failures', async () => {
    FakeFileReader.nextError = new Error('read failed');
    const { blobToDataUrl } = await import('./data-url');

    await expect(blobToDataUrl(new Blob(['image']))).rejects.toThrow('read failed');
  });

  it('rejects malformed data urls without using fetch', async () => {
    const { dataUrlToBlob } = await import('./data-url');

    await expect(dataUrlToBlob('broken')).rejects.toThrow('shared.runtime.readBlobFailed');
    await expect(dataUrlToBlob('data:text/plain,')).rejects.toThrow(
      'shared.runtime.readBlobFailed'
    );
    await expect(dataUrlToBlob('data:image/png;base64,%%%')).rejects.toThrow(
      'shared.runtime.readBlobFailed'
    );
  });
});

describe('media-utils image measurement flows', () => {
  it('measures image blobs and closes created image bitmaps', async () => {
    const closeMock = vi.fn();
    const createImageBitmapMock = vi.fn().mockResolvedValue({
      close: closeMock,
      height: 720,
      width: 1280,
    });
    vi.stubGlobal('createImageBitmap', createImageBitmapMock);
    const { measureImageBlob } = await import('@sniptale/platform/browser/media/image-dimensions');

    await expect(measureImageBlob(new Blob(['image']))).resolves.toEqual({
      height: 720,
      width: 1280,
    });
    expect(closeMock).toHaveBeenCalled();
  });

  it('creates centered thumbnail blobs and fails when canvas context is unavailable', async () => {
    const closeMock = vi.fn();
    const createImageBitmapMock = vi.fn().mockResolvedValue({
      close: closeMock,
      height: 100,
      width: 200,
    });
    vi.stubGlobal('createImageBitmap', createImageBitmapMock);
    const { createImageThumbnailBlob } = await import('./image-thumbnail');

    const thumbnailBlob = await createImageThumbnailBlob(new Blob(['image']), 320, 180);
    expect(thumbnailBlob.type).toBe('image/webp');
    expect(FakeOffscreenCanvas.context?.fillRect).toHaveBeenCalledWith(0, 0, 320, 180);
    expect(FakeOffscreenCanvas.context?.drawImage).toHaveBeenCalledWith(
      expect.anything(),
      -20,
      0,
      360,
      180
    );
    expect(FakeOffscreenCanvas.convertToBlobMock).toHaveBeenCalledWith({
      quality: 0.88,
      type: 'image/webp',
    });
    expect(closeMock).toHaveBeenCalled();

    FakeOffscreenCanvas.context = null;
    await expect(createImageThumbnailBlob(new Blob(['image']))).rejects.toThrow(
      'shared.runtime.thumbnailContextFailed'
    );
  });
});

describe('media-utils image loading flows', () => {
  it('loads image blobs and revokes their object URLs on success and failure', async () => {
    class SuccessfulImage {
      public decoding = '';
      public onerror: (() => void) | null = null;
      public onload: (() => void) | null = null;

      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }

    const createObjectURL = vi.fn(() => 'blob:image');
    const revokeObjectURL = vi.fn();
    class TestUrl extends URL {}
    TestUrl.createObjectURL = createObjectURL;
    TestUrl.revokeObjectURL = revokeObjectURL;
    vi.stubGlobal('URL', TestUrl);
    vi.stubGlobal('Image', SuccessfulImage as unknown as typeof Image);
    const { loadImageFromBlob } = await import('@sniptale/platform/browser/media/image-load');

    await expect(loadImageFromBlob(new Blob(['image']), 'load failed')).resolves.toBeInstanceOf(
      SuccessfulImage
    );
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:image');

    class FailingImage {
      public decoding = '';
      public onerror: (() => void) | null = null;
      public onload: (() => void) | null = null;

      set src(_value: string) {
        queueMicrotask(() => this.onerror?.());
      }
    }

    vi.stubGlobal('Image', FailingImage as unknown as typeof Image);

    await expect(loadImageFromBlob(new Blob(['image']), 'load failed')).rejects.toThrow(
      'load failed'
    );
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:image');
  });
});

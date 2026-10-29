vi.mock('../../../platform/media-utils/screenshot-encoding', () => ({
  optimizeScreenshotBlob: mocks.optimizeBlob,
  finalizeScreenshotDataUrl: mocks.finalizeDataUrl,
}));
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  dataUrlToBlob: vi.fn(),
  finalizeDataUrl: vi.fn(),
  optimizeBlob: vi.fn(async (blob: Blob) => blob),
  blobToDataUrl: vi.fn(async () => 'data:image/png;base64,optimized'),
}));

vi.mock('../../../platform/media-utils/data-url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/media-utils/data-url')>()),
  dataUrlToBlob: mocks.dataUrlToBlob,
  blobToDataUrl: mocks.blobToDataUrl,
}));

import {
  DEFAULT_FULL_PAGE_QUALITY_POLICY,
  FULL_PAGE_QUALITY_PROFILES,
} from '../../../contracts/full-page-capture';
import { assertFullPageViewportFallbackWithinPolicy } from './fallback-admission';

function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  bytes.set([73, 72, 68, 82], 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

class CapturedPng extends Blob {
  readonly header: Blob;

  constructor(
    private readonly reportedSize: number,
    width: number,
    height: number
  ) {
    super([], { type: 'image/png' });
    const headerBytes = pngHeader(width, height);
    const headerBuffer = new ArrayBuffer(headerBytes.byteLength);
    new Uint8Array(headerBuffer).set(headerBytes);
    this.header = new Blob([headerBuffer], { type: 'image/png' });
  }

  override get size(): number {
    return this.reportedSize;
  }

  override slice(): Blob {
    return this.header;
  }
}

function capturedPng(args: { height: number; size: number; width: number }): Blob {
  return new CapturedPng(args.size, args.width, args.height);
}

beforeEach(() => {
  mocks.dataUrlToBlob.mockReset();
  mocks.finalizeDataUrl.mockReset();
  mocks.optimizeBlob.mockReset().mockImplementation(async (blob: Blob) => blob);
});

it('admits a browser PNG within the selected file and raster budgets', async () => {
  mocks.dataUrlToBlob.mockResolvedValue(capturedPng({ height: 500, size: 4096, width: 800 }));

  await expect(
    assertFullPageViewportFallbackWithinPolicy({
      dataUrl: 'data:image/png;base64,capture',
      policy: FULL_PAGE_QUALITY_PROFILES.safe,
    })
  ).resolves.toEqual({ height: 500, width: 800 });
});

it('rejects a viewport fallback above the selected encoded-file ceiling before decoding', async () => {
  mocks.dataUrlToBlob.mockResolvedValue(
    capturedPng({ height: 500, size: 64 * 1024 * 1024 + 1, width: 800 })
  );

  await expect(
    assertFullPageViewportFallbackWithinPolicy({
      dataUrl: 'data:image/png;base64,capture',
      policy: FULL_PAGE_QUALITY_PROFILES.safe,
    })
  ).rejects.toThrow('configured maximum file size');
});

it('rejects hostile viewport dimensions from the PNG header without decoding the raster', async () => {
  mocks.dataUrlToBlob.mockResolvedValue(capturedPng({ height: 500, size: 4096, width: 40_000 }));

  await expect(
    assertFullPageViewportFallbackWithinPolicy({
      dataUrl: 'data:image/png;base64,capture',
      policy: DEFAULT_FULL_PAGE_QUALITY_POLICY,
    })
  ).rejects.toThrow('configured quality limits');
});

it('admits a bounded lossless appearance fallback above the selected final file cap', async () => {
  mocks.dataUrlToBlob.mockResolvedValue(
    capturedPng({ height: 500, width: 800, size: 70 * 1024 * 1024 })
  );
  await expect(
    assertFullPageViewportFallbackWithinPolicy({
      dataUrl: 'source',
      policy: FULL_PAGE_QUALITY_PROFILES.safe,
      outputPurpose: 'appearance-source',
    })
  ).resolves.toEqual({ height: 500, width: 800 });
  expect(mocks.optimizeBlob).not.toHaveBeenCalled();
});
it('keeps the absolute encoded source ceiling and raster limits for appearance fallbacks', async () => {
  mocks.dataUrlToBlob.mockResolvedValue(
    capturedPng({ height: 500, width: 800, size: 128 * 1024 * 1024 + 1 })
  );
  await expect(
    assertFullPageViewportFallbackWithinPolicy({
      dataUrl: 'source',
      policy: FULL_PAGE_QUALITY_PROFILES.safe,
      outputPurpose: 'appearance-source',
    })
  ).rejects.toThrow('maximum file size');
  mocks.dataUrlToBlob.mockResolvedValue(capturedPng({ height: 500, width: 40000, size: 4096 }));
  await expect(
    assertFullPageViewportFallbackWithinPolicy({
      dataUrl: 'source',
      policy: FULL_PAGE_QUALITY_PROFILES.safe,
      outputPurpose: 'appearance-source',
    })
  ).rejects.toThrow('quality limits');
});

it('returns the optimized ordinary fallback bytes after checking the final file budget', async () => {
  mocks.dataUrlToBlob.mockResolvedValue(
    capturedPng({ height: 500, width: 800, size: 70 * 1024 * 1024 })
  );
  mocks.optimizeBlob.mockResolvedValueOnce(new Blob(['smaller'], { type: 'image/png' }));
  await expect(
    assertFullPageViewportFallbackWithinPolicy({
      dataUrl: 'source',
      policy: FULL_PAGE_QUALITY_PROFILES.safe,
    })
  ).resolves.toEqual({ height: 500, width: 800, dataUrl: 'data:image/png;base64,optimized' });
});

it.each(['jpeg', 'webp'] as const)(
  'encodes an admitted fallback as %s at the selected quality before final file admission',
  async (format) => {
    const source = capturedPng({ height: 500, width: 800, size: 70 * 1024 * 1024 });
    const output = new Blob(['fits'], { type: `image/${format}` });
    mocks.dataUrlToBlob.mockResolvedValueOnce(source).mockResolvedValueOnce(output);
    mocks.finalizeDataUrl.mockResolvedValue(`data:image/${format};base64,encoded`);
    await expect(
      assertFullPageViewportFallbackWithinPolicy({
        dataUrl: 'data:image/png;base64,source',
        policy: FULL_PAGE_QUALITY_PROFILES.safe,
        format,
        quality: 0.61,
      })
    ).resolves.toEqual({ height: 500, width: 800, dataUrl: `data:image/${format};base64,encoded` });
    expect(mocks.finalizeDataUrl).toHaveBeenCalledWith('data:image/png;base64,source', {
      format,
      quality: 61,
    });
    expect(mocks.optimizeBlob).not.toHaveBeenCalled();
  }
);
it.each(['jpeg', 'webp'] as const)(
  'rejects an oversized final %s fallback after encoding',
  async (format) => {
    mocks.dataUrlToBlob
      .mockResolvedValueOnce(capturedPng({ height: 500, width: 800, size: 4096 }))
      .mockResolvedValueOnce(
        new (class extends Blob {
          get size() {
            return 64 * 1024 * 1024 + 1;
          }
        })(['large'], { type: `image/${format}` })
      );
    mocks.finalizeDataUrl.mockResolvedValue(`data:image/${format};base64,encoded`);
    await expect(
      assertFullPageViewportFallbackWithinPolicy({
        dataUrl: 'data:image/png;base64,source',
        policy: FULL_PAGE_QUALITY_PROFILES.safe,
        format,
        quality: 0.61,
      })
    ).rejects.toThrow('maximum file size');
  }
);

it('keeps appearance-source fallbacks PNG despite the eventual JPEG profile', async () => {
  mocks.dataUrlToBlob.mockResolvedValue(
    capturedPng({ height: 500, width: 800, size: 70 * 1024 * 1024 })
  );
  await expect(
    assertFullPageViewportFallbackWithinPolicy({
      dataUrl: 'source',
      policy: FULL_PAGE_QUALITY_PROFILES.safe,
      outputPurpose: 'appearance-source',
      format: 'jpeg',
      quality: 0.61,
    })
  ).resolves.toEqual({ height: 500, width: 800 });
  expect(mocks.finalizeDataUrl).not.toHaveBeenCalled();
  expect(mocks.optimizeBlob).not.toHaveBeenCalled();
});
it('rejects hostile fallback dimensions before JPEG decoding or encoding', async () => {
  mocks.dataUrlToBlob.mockResolvedValue(capturedPng({ height: 500, width: 40000, size: 4096 }));
  await expect(
    assertFullPageViewportFallbackWithinPolicy({
      dataUrl: 'source',
      policy: FULL_PAGE_QUALITY_PROFILES.safe,
      format: 'jpeg',
      quality: 0.61,
    })
  ).rejects.toThrow('quality limits');
  expect(mocks.finalizeDataUrl).not.toHaveBeenCalled();
});
it('refuses a converted fallback after cancellation before final data admission', async () => {
  const controller = new AbortController();
  mocks.dataUrlToBlob.mockResolvedValue(capturedPng({ height: 500, width: 800, size: 4096 }));
  mocks.finalizeDataUrl.mockImplementation(async () => {
    controller.abort(new Error('capture cancelled'));
    return 'data:image/webp;base64,encoded';
  });
  await expect(
    assertFullPageViewportFallbackWithinPolicy({
      dataUrl: 'source',
      policy: FULL_PAGE_QUALITY_PROFILES.safe,
      format: 'webp',
      quality: 0.61,
      signal: controller.signal,
    })
  ).rejects.toThrow('capture cancelled');
  expect(mocks.dataUrlToBlob).toHaveBeenCalledOnce();
});

import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ dataUrlToBlob: vi.fn() }));

vi.mock('../../../platform/media-utils/data-url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/media-utils/data-url')>()),
  dataUrlToBlob: mocks.dataUrlToBlob,
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

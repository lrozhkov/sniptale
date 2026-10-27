import { beforeEach, expect, it, vi } from 'vitest';
import { finalizeScreenshotDataUrl, optimizeScreenshotDataUrl } from './screenshot-encoding';

function sourceHeader(width = 300, height = 200): string {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
}

const mocks = vi.hoisted(() => ({
  optimizePngBlob: vi.fn(),
  encode: vi.fn(),
  close: vi.fn(),
  bitmap: vi.fn(),
}));
vi.mock('./png-optimization', () => ({ optimizePngBlob: mocks.optimizePngBlob }));
vi.mock('./data-url', () => ({
  dataUrlToBlob: vi.fn(
    async (url: string) => new Blob([url], { type: url.slice(5, url.indexOf(';')) })
  ),
  blobToDataUrl: vi.fn(async (blob: Blob) => `data:${blob.type};base64,${await blob.text()}`),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.optimizePngBlob.mockImplementation(async (blob: Blob) => blob);
  mocks.encode.mockImplementation(
    async ({ type }: { type: string }) => new Blob(['encoded'], { type })
  );
  mocks.bitmap.mockResolvedValue({ width: 300, height: 200, close: mocks.close });
  vi.stubGlobal('createImageBitmap', mocks.bitmap);
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      width = 300;
      height = 200;
      getContext() {
        return { drawImage: vi.fn() };
      }
      convertToBlob = mocks.encode;
    }
  );
});

it.each(['jpeg', 'webp'] as const)(
  'preserves an already encoded %s without a second lossy pass',
  async (format) => {
    const source = `data:image/${format};base64,original`;
    expect(await finalizeScreenshotDataUrl(source, { format, quality: 90 })).toBe(source);
    expect(mocks.encode).not.toHaveBeenCalled();
  }
);

it.each(['jpeg', 'webp'] as const)('encodes final cropped PNG once as %s', async (format) => {
  expect(await finalizeScreenshotDataUrl(sourceHeader(), { format, quality: 90 })).toBe(
    `data:image/${format};base64,encoded`
  );
  expect(mocks.encode).toHaveBeenCalledExactlyOnceWith({ type: `image/${format}`, quality: 0.9 });
  expect(mocks.close).toHaveBeenCalledOnce();
});

it('does not return a silent PNG fallback when the requested codec is unavailable', async () => {
  mocks.encode.mockResolvedValue(new Blob(['fallback'], { type: 'image/png' }));
  await expect(
    finalizeScreenshotDataUrl(sourceHeader(), { format: 'webp', quality: 90 })
  ).rejects.toThrow('unavailable');
  expect(mocks.close).toHaveBeenCalledOnce();
});

it('propagates mandatory encoding failure and releases the bitmap', async () => {
  mocks.encode.mockRejectedValue(new Error('encoding failed'));
  await expect(
    finalizeScreenshotDataUrl(sourceHeader(), { format: 'jpeg', quality: 90 })
  ).rejects.toThrow('encoding failed');
  expect(mocks.close).toHaveBeenCalledOnce();
});

it('keeps the original data URL if optional PNG optimization fails', async () => {
  mocks.optimizePngBlob.mockRejectedValue(new Error('optimization failed'));
  const source = 'data:image/png;base64,original';
  expect(await optimizeScreenshotDataUrl(source)).toBe(source);
});

it('returns the smaller optimized PNG', async () => {
  mocks.optimizePngBlob.mockResolvedValue(new Blob(['small'], { type: 'image/png' }));
  expect(await optimizeScreenshotDataUrl('data:image/png;base64,original')).toBe(
    'data:image/png;base64,small'
  );
});

it('propagates cancellation instead of treating it as an optimizer failure', async () => {
  const controller = new AbortController();
  mocks.optimizePngBlob.mockImplementation(async () => {
    controller.abort();
    throw new Error('cancelled');
  });
  await expect(
    optimizeScreenshotDataUrl('data:image/png;base64,original', controller.signal)
  ).rejects.toMatchObject({ name: 'AbortError' });
});

it('keeps quality 1 as one percent rather than maximum quality', async () => {
  await finalizeScreenshotDataUrl(sourceHeader(), { format: 'jpeg', quality: 1 });
  expect(mocks.encode).toHaveBeenCalledExactlyOnceWith({ type: 'image/jpeg', quality: 0.01 });
});

it('rejects over-budget conversion before decoding or allocating a canvas', async () => {
  await expect(
    finalizeScreenshotDataUrl(sourceHeader(4000, 24000), { format: 'jpeg', quality: 90 })
  ).rejects.toThrow('raster budget');
  expect(mocks.bitmap).not.toHaveBeenCalled();
  expect(mocks.encode).not.toHaveBeenCalled();
});

it('releases a decoded bitmap whose dimensions do not match its header', async () => {
  mocks.bitmap.mockResolvedValue({ width: 3000, height: 2000, close: mocks.close });
  await expect(
    finalizeScreenshotDataUrl(sourceHeader(), { format: 'jpeg', quality: 90 })
  ).rejects.toThrow('dimensions');
  expect(mocks.close).toHaveBeenCalledOnce();
  expect(mocks.encode).not.toHaveBeenCalled();
});

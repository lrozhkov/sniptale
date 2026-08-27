import { afterEach, expect, it, vi } from 'vitest';
import {
  validateRetainedWebSnapshotScreenshot,
  validateWebSnapshotScreenshotBlob,
} from './screenshot-validation';

const MAX_SCREENSHOT_BYTES = 25 * 1024 * 1024;
const MAX_SCREENSHOT_AREA_PX = 64_000_000;

function writeUint32BigEndian(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

function createPng(width: number, height: number): Blob {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  writeUint32BigEndian(bytes, 16, width);
  writeUint32BigEndian(bytes, 20, height);
  return new Blob([bytes], { type: 'image/png' });
}

function createJpeg(width: number, height: number): Blob {
  const bytes = new Uint8Array(21);
  bytes.set([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08]);
  bytes[7] = (height >>> 8) & 0xff;
  bytes[8] = height & 0xff;
  bytes[9] = (width >>> 8) & 0xff;
  bytes[10] = width & 0xff;
  return new Blob([bytes], { type: 'image/jpeg' });
}

function createWebp(chunk: 'VP8 ' | 'VP8L' | 'VP8X', width: number, height: number): Blob {
  const bytes = new Uint8Array(30);
  bytes.set(new TextEncoder().encode('RIFF'), 0);
  bytes.set(new TextEncoder().encode('WEBP'), 8);
  bytes.set(new TextEncoder().encode(chunk), 12);
  if (chunk === 'VP8X') {
    const storedWidth = width - 1;
    const storedHeight = height - 1;
    bytes.set([storedWidth & 0xff, (storedWidth >>> 8) & 0xff, storedWidth >>> 16], 24);
    bytes.set([storedHeight & 0xff, (storedHeight >>> 8) & 0xff, storedHeight >>> 16], 27);
  } else if (chunk === 'VP8 ') {
    bytes.set([0x9d, 0x01, 0x2a], 23);
    bytes[26] = width & 0xff;
    bytes[27] = (width >>> 8) & 0x3f;
    bytes[28] = height & 0xff;
    bytes[29] = (height >>> 8) & 0x3f;
  } else {
    const storedWidth = width - 1;
    const storedHeight = height - 1;
    bytes[20] = 0x2f;
    bytes[21] = storedWidth & 0xff;
    bytes[22] = ((storedWidth >>> 8) & 0x3f) | ((storedHeight & 0x03) << 6);
    bytes[23] = (storedHeight >>> 2) & 0xff;
    bytes[24] = (storedHeight >>> 10) & 0x0f;
  }
  return new Blob([bytes], { type: 'image/webp' });
}

function stubDecodedImage(width: number, height: number) {
  const close = vi.fn();
  const createImageBitmap = vi.fn().mockResolvedValue({ close, height, width });
  vi.stubGlobal('createImageBitmap', createImageBitmap);
  return { close, createImageBitmap };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

it('accepts a bounded screenshot only after header and decoded dimensions agree', async () => {
  const decoded = stubDecodedImage(1280, 720);

  await expect(validateWebSnapshotScreenshotBlob(createPng(1280, 720))).resolves.toEqual({
    height: 720,
    width: 1280,
  });
  expect(decoded.createImageBitmap).toHaveBeenCalledTimes(1);
  expect(decoded.close).toHaveBeenCalledTimes(1);
});

it.each([
  ['jpeg', () => createJpeg(640, 480)],
  ['extended WebP', () => createWebp('VP8X', 640, 480)],
  ['lossy WebP', () => createWebp('VP8 ', 640, 480)],
  ['lossless WebP', () => createWebp('VP8L', 640, 480)],
])('accepts bounded %s headers after matching browser decode', async (_label, createBlob) => {
  stubDecodedImage(640, 480);

  await expect(validateWebSnapshotScreenshotBlob(createBlob())).resolves.toEqual({
    height: 480,
    width: 640,
  });
});

it('rejects empty and unsupported screenshot blobs', async () => {
  const decoded = stubDecodedImage(1, 1);

  await expect(
    validateWebSnapshotScreenshotBlob(new Blob([], { type: 'image/png' }))
  ).rejects.toThrow('Web snapshot screenshot is missing.');
  await expect(
    validateWebSnapshotScreenshotBlob(new Blob(['gif'], { type: 'image/gif' }))
  ).rejects.toThrow('Web snapshot screenshot MIME type is not supported.');
  expect(decoded.createImageBitmap).not.toHaveBeenCalled();
});

it('rejects MIME-correct corrupt bytes before browser image decode', async () => {
  const decoded = stubDecodedImage(1, 1);

  await expect(
    validateWebSnapshotScreenshotBlob(new Blob(['not-png'], { type: 'image/png' }))
  ).rejects.toThrow('Web snapshot screenshot is invalid.');
  expect(decoded.createImageBitmap).not.toHaveBeenCalled();
});

it('rejects oversized screenshot bytes before browser image decode', async () => {
  const decoded = stubDecodedImage(1, 1);
  const oversized = new Blob([new Uint8Array(MAX_SCREENSHOT_BYTES + 1)], {
    type: 'image/png',
  });

  await expect(validateWebSnapshotScreenshotBlob(oversized)).rejects.toThrow(
    'Web snapshot screenshot is too large.'
  );
  expect(decoded.createImageBitmap).not.toHaveBeenCalled();
});

it('rejects over-budget header dimensions before browser image decode', async () => {
  const decoded = stubDecodedImage(1, 1);
  const width = 8000;
  const height = Math.floor(MAX_SCREENSHOT_AREA_PX / width) + 1;

  await expect(validateWebSnapshotScreenshotBlob(createPng(width, height))).rejects.toThrow(
    'Web snapshot screenshot dimensions exceed safe limits.'
  );
  expect(decoded.createImageBitmap).not.toHaveBeenCalled();
});

it('rejects a header side above the capture-compatible ceiling before decode', async () => {
  const decoded = stubDecodedImage(1, 1);

  await expect(validateWebSnapshotScreenshotBlob(createPng(32_769, 1))).rejects.toThrow(
    'Web snapshot screenshot dimensions exceed safe limits.'
  );
  expect(decoded.createImageBitmap).not.toHaveBeenCalled();
});

it('normalizes browser decoder failures into the bounded screenshot error', async () => {
  vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('decoder failed')));

  await expect(validateWebSnapshotScreenshotBlob(createPng(1280, 720))).rejects.toThrow(
    'Web snapshot screenshot is invalid.'
  );
});

it('rejects decoded dimensions that exceed the profile even when the header is bounded', async () => {
  const decoded = stubDecodedImage(8000, 8001);

  await expect(validateWebSnapshotScreenshotBlob(createPng(100, 100))).rejects.toThrow(
    'Web snapshot screenshot dimensions exceed safe limits.'
  );
  expect(decoded.close).toHaveBeenCalledTimes(1);
});

it('rejects corrupt decoded dimensions and closes the browser bitmap', async () => {
  const decoded = stubDecodedImage(1279, 720);

  await expect(validateWebSnapshotScreenshotBlob(createPng(1280, 720))).rejects.toThrow(
    'Web snapshot screenshot dimensions are invalid.'
  );
  expect(decoded.close).toHaveBeenCalledTimes(1);
});

it('accepts only a decoded retained screenshot that is byte-identical to the package entry', async () => {
  const screenshot = createPng(1280, 720);
  const packageBytes = new Uint8Array(await screenshot.arrayBuffer());
  stubDecodedImage(1280, 720);

  await expect(
    validateRetainedWebSnapshotScreenshot({ packageBytes, screenshotBlob: screenshot })
  ).resolves.toEqual({ height: 720, width: 1280 });
});

it.each([
  ['different length', new Uint8Array([1])],
  ['different bytes', new Uint8Array(24).fill(1)],
])('rejects a retained screenshot with %s from its package entry', async (_case, packageBytes) => {
  const screenshot = createPng(1280, 720);
  stubDecodedImage(1280, 720);

  await expect(
    validateRetainedWebSnapshotScreenshot({ packageBytes, screenshotBlob: screenshot })
  ).rejects.toThrow('Web snapshot retained screenshot does not match the package.');
});

import { afterEach, expect, it, vi } from 'vitest';
import {
  createPagePackagePngBytes,
  createPagePackageTestBlobFromBytes,
} from './package.test-support';
import { validateImportedWebSnapshotAsset } from './asset-validation';

function createBox(type: string, payload: Uint8Array): Uint8Array {
  const box = new Uint8Array(8 + payload.byteLength);
  new DataView(box.buffer).setUint32(0, box.byteLength, false);
  box.set(new TextEncoder().encode(type), 4);
  box.set(payload, 8);
  return box;
}

function createAvif(width: number, height: number): Blob {
  const ispePayload = new Uint8Array(12);
  const ispeView = new DataView(ispePayload.buffer);
  ispeView.setUint32(4, width, false);
  ispeView.setUint32(8, height, false);
  const ispe = createBox('ispe', ispePayload);
  const ipco = createBox('ipco', ispe);
  const iprp = createBox('iprp', ipco);
  const metaPayload = new Uint8Array(4 + iprp.byteLength);
  metaPayload.set(iprp, 4);
  const meta = createBox('meta', metaPayload);
  const ftyp = createBox('ftyp', new TextEncoder().encode('avif0000'));
  const bytes = new Uint8Array(ftyp.byteLength + meta.byteLength);
  bytes.set(ftyp);
  bytes.set(meta, ftyp.byteLength);
  return createPagePackageTestBlobFromBytes(bytes, 'image/avif');
}

function createGif(width: number, height: number, frameWidth = width, frameHeight = height): Blob {
  const bytes = new Uint8Array(29);
  bytes.set(new TextEncoder().encode('GIF89a'));
  const view = new DataView(bytes.buffer);
  view.setUint16(6, width, true);
  view.setUint16(8, height, true);
  bytes[13] = 0x2c;
  view.setUint16(18, frameWidth, true);
  view.setUint16(20, frameHeight, true);
  bytes.set([0x02, 0x02, 0x44, 0x01, 0x00, 0x3b], 23);
  return createPagePackageTestBlobFromBytes(bytes, 'image/gif');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

it('decodes bounded raster assets and always closes the bitmap', async () => {
  const close = vi.fn();
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ close, height: 1, width: 1 }))
  );
  await expect(
    validateImportedWebSnapshotAsset(
      createPagePackageTestBlobFromBytes(createPagePackagePngBytes(), 'image/png'),
      'image/png',
      'assets/pixel.png'
    )
  ).resolves.toBeUndefined();
  expect(close).toHaveBeenCalledOnce();
});

it('rejects decoder failures and excessive decoded geometry', async () => {
  const image = createPagePackageTestBlobFromBytes(createPagePackagePngBytes(), 'image/png');
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => Promise.reject(new Error('decode')))
  );
  await expect(
    validateImportedWebSnapshotAsset(image, 'image/png', 'assets/a.png')
  ).rejects.toThrow('image asset is invalid');

  const close = vi.fn();
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ close, height: 32_769, width: 1 }))
  );
  await expect(
    validateImportedWebSnapshotAsset(image, 'image/png', 'assets/a.png')
  ).rejects.toThrow('dimensions exceed safe limits');
  expect(close).toHaveBeenCalledOnce();
});

it('rejects empty assets before signature or browser decode', async () => {
  const decode = vi.fn();
  vi.stubGlobal('createImageBitmap', decode);
  await expect(
    validateImportedWebSnapshotAsset(
      new Blob([], { type: 'image/png' }),
      'image/png',
      'assets/a.png'
    )
  ).rejects.toThrow('empty or too large');
  expect(decode).not.toHaveBeenCalled();
});

it('rejects hostile encoded geometry before browser decode', async () => {
  const bytes = createPagePackagePngBytes();
  new DataView(bytes.buffer).setUint32(16, 32_769, false);
  const decode = vi.fn();
  vi.stubGlobal('createImageBitmap', decode);

  await expect(
    validateImportedWebSnapshotAsset(
      createPagePackageTestBlobFromBytes(bytes, 'image/png'),
      'image/png',
      'assets/hostile.png'
    )
  ).rejects.toThrow('dimensions exceed safe limits');
  expect(decode).not.toHaveBeenCalled();
});

it.each([
  ['GIF', createGif(1, 1), 'image/gif'],
  ['AVIF', createAvif(1, 1), 'image/avif'],
])('admits bounded %s geometry before matching browser decode', async (_label, blob, mimeType) => {
  const close = vi.fn();
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ close, height: 1, width: 1 }))
  );

  await expect(
    validateImportedWebSnapshotAsset(blob, mimeType, `assets/image.${mimeType.slice(6)}`)
  ).resolves.toBeUndefined();
  expect(close).toHaveBeenCalledOnce();
});

it('rejects an oversized GIF frame before browser decode even with a small logical screen', async () => {
  const decode = vi.fn();
  vi.stubGlobal('createImageBitmap', decode);

  await expect(
    validateImportedWebSnapshotAsset(createGif(1, 1, 32_769, 1), 'image/gif', 'assets/hostile.gif')
  ).rejects.toThrow('dimensions exceed safe limits');
  expect(decode).not.toHaveBeenCalled();
});

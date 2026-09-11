import { describe, expect, it } from 'vitest';
import { assertSafeProjectAssetStorageInput } from './project-assets';

describe('project asset storage admission', () => {
  it.each([
    ['image/png', 1],
    [' AUDIO/OGG; codecs=opus ', 8],
    ['video/mp4', 16],
  ])('accepts bounded %s input', (mimeType, size) => {
    expect(() =>
      assertSafeProjectAssetStorageInput(new Blob([new Uint8Array(size)]), mimeType)
    ).not.toThrow();
  });

  it('rejects unsupported MIME types', () => {
    expect(() => assertSafeProjectAssetStorageInput(new Blob(['text']), 'text/plain')).toThrow(
      'Unsupported project asset MIME type.'
    );
  });

  it.each([
    ['empty', new Blob([], { type: 'image/png' }), 'image/png'],
    [
      'oversized image',
      new Blob([new Uint8Array(64 * 1024 * 1024 + 1)], { type: 'image/png' }),
      'image/png',
    ],
  ])('rejects %s input', (_case, blob, mimeType) => {
    expect(() => assertSafeProjectAssetStorageInput(blob, mimeType)).toThrow(
      'Project asset exceeds storage size limit.'
    );
  });
});

import { assertImportableProjectImage } from './project-assets';
it.each([
  ['image/png', [137, 80, 78, 71, 13, 10, 26, 10]],
  ['image/jpeg', [255, 216, 255]],
  ['image/gif', [...'GIF89a'].map((char) => char.charCodeAt(0))],
  ['image/webp', [...'RIFF0000WEBP'].map((char) => char.charCodeAt(0))],
  ['image/avif', [...'0000ftypavif'].map((char) => char.charCodeAt(0))],
])('admits %s signature and rejects mismatching bytes', async (mime, bytes) => {
  await expect(
    assertImportableProjectImage(new Blob([new Uint8Array(bytes)], { type: mime }))
  ).resolves.toBeUndefined();
  await expect(assertImportableProjectImage(new Blob(['wrong'], { type: mime }))).rejects.toThrow();
});
it('rejects empty, unsupported and oversized raster imports', async () => {
  for (const blob of [
    new Blob([], { type: 'image/png' }),
    new Blob(['svg'], { type: 'image/svg+xml' }),
    new Blob([new Uint8Array(64 * 1024 * 1024 + 1)], { type: 'image/png' }),
  ]) {
    await expect(assertImportableProjectImage(blob)).rejects.toThrow();
  }
});

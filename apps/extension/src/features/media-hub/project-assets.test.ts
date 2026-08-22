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

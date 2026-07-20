import { describe, expect, it } from 'vitest';
import { blobToScenarioDeckDataUrl } from './data-url';
import { createScenarioDeckAssetFilename } from './filename';

describe('scenario deck export assets', () => {
  it('creates data URLs with blob MIME type and binary fallback MIME type', async () => {
    const png = await blobToScenarioDeckDataUrl(new Blob(['asset'], { type: 'image/png' }));
    const binary = await blobToScenarioDeckDataUrl(new Blob(['asset']));

    expect(png).toBe('data:image/png;base64,YXNzZXQ=');
    expect(binary).toBe('data:application/octet-stream;base64,YXNzZXQ=');
  });

  it('creates stable sanitized asset filenames by MIME type', () => {
    expect(createAssetFilename('Hero Image!', 'image/png', 0)).toBe('assets/hero-image.png');
    expect(createAssetFilename('Vector', 'image/svg+xml', 1)).toBe('assets/vector.svg');
    expect(createAssetFilename('Photo', 'image/jpeg', 2)).toBe('assets/photo.jpg');
    expect(createAssetFilename('Preview', 'image/webp', 3)).toBe('assets/preview.webp');
    expect(createAssetFilename('***', 'application/octet-stream', 4)).toBe('assets/asset-5.png');
  });
});

function createAssetFilename(assetId: string, type: string, index: number) {
  return createScenarioDeckAssetFilename({
    assetId,
    blob: new Blob(['asset'], { type }),
    index,
  });
}

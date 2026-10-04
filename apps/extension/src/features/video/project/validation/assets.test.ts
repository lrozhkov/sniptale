import { expect, it } from 'vitest';
import { createVideoProjectAsset } from '../factories/creation';
import { isVideoProjectAsset } from './assets';

it('validates stable library source identities without accepting missing or malformed ids', () => {
  const asset = createVideoProjectAsset(
    'Shared',
    'IMAGE',
    { kind: 'library-asset', mediaId: 'scenario-asset:deleted-child' },
    {
      width: 100,
      height: 100,
      duration: null,
      mimeType: 'image/png',
      size: 5,
      hasAudio: false,
      audioPeaks: null,
    }
  );
  expect(isVideoProjectAsset(asset)).toBe(true);
  for (const mediaId of [undefined, null, 1, {}, '']) {
    expect(isVideoProjectAsset({ ...asset, source: { kind: 'library-asset', mediaId } })).toBe(
      false
    );
  }
});

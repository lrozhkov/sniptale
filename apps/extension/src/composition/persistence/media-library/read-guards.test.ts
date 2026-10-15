import { expect, it } from 'vitest';
import { parseMediaLibraryEntry } from './read-guards';

it('sanitizes legacy provenance before background storage maintenance completes', () => {
  const parsed = parseMediaLibraryEntry({
    createdAt: 10,
    duration: null,
    filename: 'asset.png',
    height: 1080,
    id: 'asset-1',
    kind: 'screenshot',
    mimeType: 'image/png',
    originalFilename: 'asset.png',
    size: 123,
    source: { kind: 'screenshot' },
    sourceTitle: null,
    tags: [],
    updatedAt: 20,
    width: 1920,
    sourceUrl: 'https://user:pass@example.com/page?token=secret#fragment',
    sourceFavicon: 'https://user:pass@example.com/favicon.ico?token=secret',
  });
  expect(parsed).toMatchObject({
    sourceUrl: 'https://example.com/page',
    sourceFavicon: 'https://example.com/favicon.ico',
  });
});

import { describe, expect, it } from 'vitest';
import { createSafeWebCopyContributions } from './web-copy';

const digest = async (blob: Blob) => (blob.size % 2 === 0 ? 'a' : 'b').repeat(64);

function artifacts() {
  return {
    assets: [
      {
        blob: new Blob(['css'], { type: 'text/css' }),
        localPath: 'assets/styles/site.css',
        originalUrl: 'https://example.test/styles/site.css',
      },
      {
        blob: new Blob(['img'], { type: 'image/png' }),
        localPath: 'assets/images/photo.png',
        originalUrl: 'https://example.test/images/photo.png',
      },
    ],
    html: '<!doctype html><html><body>Safe</body></html>',
    screenshotBlob: new Blob(['png'], { type: 'image/png' }),
    thumbnailBlob: new Blob(['webp'], { type: 'image/webp' }),
  };
}

describe('safe Web-copy Page Package contributions', () => {
  it('keeps exact HTML-linked asset paths after required singleton entries', async () => {
    const contributions = await createSafeWebCopyContributions(artifacts(), digest);
    expect(contributions.map((entry) => entry.path)).toEqual([
      'snapshot/index.html',
      'page-screenshot.png',
      'thumbnail.webp',
      'assets/styles/site.css',
      'assets/images/photo.png',
    ]);
    expect(contributions.map((entry) => entry.mimeType)).toEqual([
      'text/html',
      'image/png',
      'image/webp',
      'text/css',
      'image/png',
    ]);
  });

  it('rejects wrong required image formats, escaped assets, ZIPs and case collisions', async () => {
    await expect(
      createSafeWebCopyContributions(
        {
          ...artifacts(),
          screenshotBlob: new Blob(['jpeg'], { type: 'image/jpeg' }),
        },
        digest
      )
    ).rejects.toThrow('image/png');
    await expect(
      createSafeWebCopyContributions(
        {
          ...artifacts(),
          assets: [
            {
              blob: new Blob(['x'], { type: 'image/png' }),
              localPath: '../asset.png',
              originalUrl: 'https://example.test/asset.png',
            },
          ],
        },
        digest
      )
    ).rejects.toThrow('Invalid safe Web-copy asset path');
    await expect(
      createSafeWebCopyContributions(
        {
          ...artifacts(),
          assets: [
            {
              blob: new Blob(['x'], { type: 'application/zip' }),
              localPath: 'assets/archive.ZIP',
              originalUrl: 'https://example.test/archive.ZIP',
            },
          ],
        },
        digest
      )
    ).rejects.toThrow('Invalid safe Web-copy asset path');
    await expect(
      createSafeWebCopyContributions(
        {
          ...artifacts(),
          assets: [
            {
              blob: new Blob(['x'], { type: 'image/png' }),
              localPath: 'assets/photo.png',
              originalUrl: 'https://example.test/photo.png',
            },
            {
              blob: new Blob(['y'], { type: 'image/png' }),
              localPath: 'assets/PHOTO.PNG',
              originalUrl: 'https://example.test/PHOTO.PNG',
            },
          ],
        },
        digest
      )
    ).rejects.toThrow('Duplicate safe Web-copy asset path');
  });

  it('rejects MIME-extension mismatches and paths that canonical allocation would rename', async () => {
    await expect(
      createSafeWebCopyContributions(
        {
          ...artifacts(),
          assets: [
            {
              blob: new Blob(['png'], { type: 'image/png' }),
              localPath: 'assets/style.css',
              originalUrl: 'https://example.test/style.css',
            },
          ],
        },
        digest
      )
    ).rejects.toThrow('path or MIME');
    await expect(
      createSafeWebCopyContributions(
        {
          ...artifacts(),
          assets: [
            {
              blob: new Blob(['png'], { type: 'image/png' }),
              localPath: 'assets/a?.png',
              originalUrl: 'https://example.test/a.png',
            },
          ],
        },
        digest
      )
    ).rejects.toThrow('requires renaming');
  });

  it('rejects oversized asset inventories before invoking the digest', async () => {
    let digestCalls = 0;
    const asset = {
      blob: new Blob(['png'], { type: 'image/png' }),
      localPath: 'assets/photo.png',
      originalUrl: 'https://example.test/photo.png',
    };
    await expect(
      createSafeWebCopyContributions(
        { ...artifacts(), assets: Array.from({ length: 24_998 }, () => asset) },
        async () => {
          digestCalls += 1;
          return 'a'.repeat(64);
        }
      )
    ).rejects.toThrow('count exceeds');
    expect(digestCalls).toBe(0);
  });
});

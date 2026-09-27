// @vitest-environment jsdom

import { expect, it } from 'vitest';
import { createViewablePackageFileBlob, isPreviewableAssetImage } from './asset-opening';

it('keeps passive raster images viewable and renders executable attachment types as text', async () => {
  const png = new Blob(['png'], { type: 'image/png' });
  expect(await createViewablePackageFileBlob(png, 'image/png')).toBe(png);
  expect(isPreviewableAssetImage('image/png')).toBe(true);
  expect(isPreviewableAssetImage('text/html')).toBe(false);

  const html = await createViewablePackageFileBlob(
    new Blob(['<script>alert(1)</script>'], { type: 'text/html' }),
    'text/html'
  );
  expect(html.type).toBe('text/plain');
  expect(await html.text()).toContain('<script>');
});

it('sanitizes an SVG before it can become a standalone document', async () => {
  const blob = await createViewablePackageFileBlob(
    new Blob(['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'], {
      type: 'image/svg+xml',
    }),
    'image/svg+xml'
  );
  expect(blob.type).toBe('image/svg+xml');
  expect(await blob.text()).not.toContain('<script');
});

it('rejects malformed SVG instead of opening it', async () => {
  await expect(
    createViewablePackageFileBlob(
      new Blob(['<html>not an image</html>'], { type: 'image/svg+xml' }),
      'image/svg+xml'
    )
  ).rejects.toThrow('invalid web snapshot SVG asset');
});

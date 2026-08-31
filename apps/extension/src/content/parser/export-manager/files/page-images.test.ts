// @vitest-environment jsdom

import { beforeEach, expect, it } from 'vitest';

import { collectPageImageResources } from './page-images';

beforeEach(() => {
  document.body.innerHTML = '';
});

function collect() {
  return collectPageImageResources({ document, pageUrl: 'https://example.test/page' });
}

it('collects browser-selected standard images without parsing srcset', () => {
  document.body.innerHTML = `
    <img src="/images/photo.png" alt="Photo">
    <img src="/images/tracker.gif" width="1" height="1">
  `;

  expect(collect()).toEqual([
    {
      filename: 'photo.png',
      source: 'page-image',
      url: 'https://example.test/images/photo.png',
    },
  ]);
});

it('prefers an explicit linked image original and rejects cross-origin candidates', () => {
  document.body.innerHTML = `
    <a href="/originals/photo.jpg"><img src="/thumbs/photo.jpg" alt="Original"></a>
    <img src="https://cdn.example.org/remote.png" alt="Remote">
  `;

  expect(collect()).toEqual([
    {
      filename: 'photo.jpg',
      source: 'page-image',
      url: 'https://example.test/originals/photo.jpg',
    },
  ]);
});

it('does not treat a linked HTML page as an image original', () => {
  document.body.innerHTML = `
    <a href="/article"><img src="/images/cover.webp" alt="Cover"></a>
  `;

  expect(collect()[0]?.url).toBe('https://example.test/images/cover.webp');
});

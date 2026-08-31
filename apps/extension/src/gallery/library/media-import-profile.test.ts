// @vitest-environment jsdom

import { expect, it } from 'vitest';
import {
  GALLERY_MEDIA_IMPORT_ACCEPT,
  resolveGalleryMediaImportCreatedAt,
  resolveGalleryMediaImportMimeType,
} from './media-import-profile';

it('accepts supported image and video MIME types', () => {
  expect(GALLERY_MEDIA_IMPORT_ACCEPT).toContain('image/png');
  expect(GALLERY_MEDIA_IMPORT_ACCEPT).toContain('video/mp4');
  expect(resolveGalleryMediaImportMimeType(new File([], 'clip.mp4', { type: 'video/mp4' }))).toBe(
    'video/mp4'
  );
  expect(
    resolveGalleryMediaImportMimeType(new File([], 'vector.svg', { type: 'image/svg+xml' }))
  ).toBeNull();
});

it('uses a supported filename extension only when the browser omits MIME', () => {
  expect(resolveGalleryMediaImportMimeType(new File([], 'PHOTO.JPG'))).toBe('image/jpeg');
  expect(resolveGalleryMediaImportMimeType(new File([], 'document.pdf'))).toBeNull();
});

it('uses a valid file modification time as imported media creation time', () => {
  const now = Date.UTC(2026, 7, 26);
  const lastModified = Date.UTC(2020, 2, 4, 12, 30);
  const file = new File([], 'photo.png', { lastModified, type: 'image/png' });

  expect(resolveGalleryMediaImportCreatedAt(file, now)).toBe(lastModified);
});

it.each([0, -1, Date.UTC(2026, 7, 26) + 1])(
  'falls back to the import time for invalid file modification time %s',
  (lastModified) => {
    const now = Date.UTC(2026, 7, 26);
    const file = new File([], 'photo.png', { lastModified, type: 'image/png' });

    expect(resolveGalleryMediaImportCreatedAt(file, now)).toBe(now);
  }
);

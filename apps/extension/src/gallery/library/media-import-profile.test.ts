// @vitest-environment jsdom

import { expect, it } from 'vitest';
import {
  GALLERY_MEDIA_IMPORT_ACCEPT,
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

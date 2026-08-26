// @vitest-environment jsdom

import { beforeEach, expect, it } from 'vitest';
import { clearGalleryRecordingPreviewUrlParams } from '.';

beforeEach(() => {
  window.history.replaceState(
    { preserved: true },
    '',
    '/gallery.html?recordingId=recording-1&folder=recording&scope=temporary&keep=1#preview'
  );
});

it('consumes one-shot recording params without changing unrelated route state', () => {
  clearGalleryRecordingPreviewUrlParams();

  expect(window.location.pathname).toBe('/gallery.html');
  expect(window.location.search).toBe('?keep=1');
  expect(window.location.hash).toBe('#preview');
  expect(window.history.state).toEqual({ preserved: true });
});

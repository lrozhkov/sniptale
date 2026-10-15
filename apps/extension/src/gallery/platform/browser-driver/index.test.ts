// @vitest-environment jsdom

import { beforeEach, expect, it } from 'vitest';
import {
  clearGalleryRecordingPreviewUrlParams,
  setGalleryQuickEditUrl,
  clearGalleryQuickEditUrl,
} from '.';

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

it('retains a canonical editor address and clears it without changing unrelated state', () => {
  setGalleryQuickEditUrl('recording:one & two');
  const params = new URLSearchParams(window.location.search);
  expect(params.get('mediaId')).toBe('recording:one & two');
  expect(params.get('mode')).toBe('edit');
  expect(params.has('recordingId')).toBe(false);
  clearGalleryQuickEditUrl('recording:one & two');
  expect(window.location.search).toBe('?folder=recording&scope=temporary&keep=1');
  expect(window.location.hash).toBe('#preview');
  expect(window.history.state).toEqual({ preserved: true });
});

it('does not remove a newer editor route during stale cleanup', () => {
  setGalleryQuickEditUrl('first');
  setGalleryQuickEditUrl('second');
  clearGalleryQuickEditUrl('first');
  expect(new URLSearchParams(window.location.search).get('mediaId')).toBe('second');
});

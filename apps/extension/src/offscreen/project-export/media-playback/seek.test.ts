// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

import { seekMediaElement } from './seek';

beforeEach(() => {
  vi.clearAllMocks();
});

function createVideo(eventName: 'error' | 'seeked') {
  const video = document.createElement('video');
  Object.defineProperty(video, 'currentTime', {
    configurable: true,
    get: () => 0,
    set: () => {
      video.dispatchEvent(new Event(eventName));
    },
  });
  Object.defineProperty(video, 'seeking', {
    configurable: true,
    get: () => false,
  });
  return video;
}

it('returns early for non-finite times and settled seeks', async () => {
  const video = document.createElement('video');
  Object.defineProperty(video, 'currentTime', {
    configurable: true,
    get: () => 1,
    set: vi.fn(),
  });
  Object.defineProperty(video, 'seeking', {
    configurable: true,
    get: () => false,
  });

  await expect(seekMediaElement(video, Number.NaN)).resolves.toBeUndefined();
  await expect(seekMediaElement(video, 1)).resolves.toBeUndefined();
});

it('rejects aborted and errored seek operations', async () => {
  const controller = new AbortController();
  controller.abort();

  await expect(seekMediaElement(createVideo('seeked'), 4, controller.signal)).rejects.toThrow(
    'The export was aborted.'
  );
  await expect(seekMediaElement(createVideo('error'), 4)).rejects.toThrow(
    'offscreenExport.seekMediaElementError'
  );
});

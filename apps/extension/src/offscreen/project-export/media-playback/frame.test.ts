// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

const seekMediaElementMock = vi.hoisted(() => vi.fn());

vi.mock('./seek', () => ({
  seekMediaElement: seekMediaElementMock,
}));

vi.mock('../../../features/video/project/timeline', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../features/video/project/timeline')>()),
  getMediaClipSourceTime: vi.fn(() => 4),
  isClipActiveAtTime: vi.fn(() => true),
  isVideoClip: vi.fn(() => true),
}));

import { syncVideoClipFrame } from './frame';

beforeEach(() => {
  vi.clearAllMocks();
  seekMediaElementMock.mockReset();
});

it('seeks active video clips while syncing frame-accurate previews', async () => {
  const video = document.createElement('video');

  seekMediaElementMock.mockResolvedValue(undefined);

  await syncVideoClipFrame(
    {
      clipMediaElements: new Map([['clip-1', video]]),
    } as never,
    {
      clips: [{ id: 'clip-1' }],
    } as never,
    2
  );

  expect(seekMediaElementMock).toHaveBeenCalledWith(video, 4, undefined);
});

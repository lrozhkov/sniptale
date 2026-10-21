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

it('does not seek retained camera clips outside actual media coverage', async () => {
  const { createEmptyVideoProject, createVideoProjectAsset } =
    await import('../../../features/video/project/factories/creation');
  const { createVideoClipFromAsset } =
    await import('../../../features/video/project/factories/clip');
  const project = createEmptyVideoProject();
  const asset = createVideoProjectAsset(
    'Camera',
    'VIDEO',
    { kind: 'project-asset', projectAssetId: 'camera' },
    {
      duration: 4,
      width: 100,
      height: 100,
      mimeType: 'video/webm',
      size: 1,
      hasAudio: false,
      audioPeaks: null,
    }
  );
  const clip = createVideoClipFromAsset(project.tracks[0]!.id, asset, 100, 100, 0);
  if (clip.type !== 'VIDEO') throw new Error('Expected camera video');
  clip.duration = 12;
  clip.sourceDuration = 12;
  clip.cameraTiming = { offsetSeconds: 3, transitions: 'bounded' };
  project.clips = [clip];
  project.assets = [asset];
  const video = document.createElement('video');
  const job = { clipMediaElements: new Map([[clip.id, video]]) };
  for (const time of [0, 2.9, 7, 11]) await syncVideoClipFrame(job, project, time);
  expect(seekMediaElementMock).not.toHaveBeenCalled();
  await syncVideoClipFrame(job, project, 3);
  expect(seekMediaElementMock).toHaveBeenCalledOnce();
});

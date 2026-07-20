import { expect, it, vi } from 'vitest';

const { getAssetByIdMock } = vi.hoisted(() => ({
  getAssetByIdMock: vi.fn(),
}));

vi.mock('../../../../features/video/project/timeline/basics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../features/video/project/timeline/basics')>()),
  getAssetById: getAssetByIdMock,
}));

import { clipAudioClipToExportRange, collectRenderableAudioClips } from './collect';

function createProject() {
  return {
    duration: 6,
    clips: [
      {
        assetId: 'asset-1',
        duration: 1,
        fadeInMs: 0,
        fadeOutMs: 0,
        muted: false,
        sourceDuration: 1,
        sourceStart: 0,
        startTime: 0,
        trackId: 'track-1',
        type: 'AUDIO',
        volume: 1,
      },
    ],
    tracks: [{ id: 'track-1', visible: true }],
  };
}

it('collects only renderable audio clips', () => {
  const project = createProject();
  const [firstClip] = project.clips;
  if (!firstClip) {
    throw new Error('Expected project fixture clip');
  }

  project.clips.push({ ...firstClip, assetId: 'asset-2', muted: true });

  getAssetByIdMock.mockImplementation((_, assetId: string) => {
    if (assetId === 'asset-1') {
      return { metadata: { hasAudio: true } };
    }
    return { metadata: { hasAudio: false } };
  });

  const clips = collectRenderableAudioClips(project as never);

  expect(clips).toHaveLength(1);
  expect(clips[0]).toEqual(expect.objectContaining({ assetId: 'asset-1' }));
});

it('ignores clips on hidden tracks or without audio-backed assets', () => {
  const project = createProject();
  project.tracks[0]!.visible = false;

  getAssetByIdMock.mockReturnValue({ metadata: { hasAudio: true } });
  expect(collectRenderableAudioClips(project as never)).toEqual([]);

  project.tracks[0]!.visible = true;
  getAssetByIdMock.mockReturnValue({ metadata: { hasAudio: false } });
  expect(collectRenderableAudioClips(project as never)).toEqual([]);
});

it('clips audio render ranges and interpolates gain envelopes for partial exports', () => {
  const project = createProject();
  const [firstClip] = project.clips;
  if (!firstClip) {
    throw new Error('Expected project fixture clip');
  }

  project.clips[0] = {
    ...firstClip,
    audioGainEnd: 0.5,
    audioGainStart: 1,
    duration: 4,
    fadeInMs: 900,
    fadeOutMs: 800,
    playbackRate: 2,
    sourceDuration: 8,
    sourceStart: 10,
    startTime: 1,
    volumeEnvelopeEnd: 0.25,
    volumeEnvelopeStart: 1,
  } as never;

  getAssetByIdMock.mockReturnValue({ metadata: { hasAudio: true } });

  expect(
    collectRenderableAudioClips(project as never, {
      rangeEndSeconds: 4,
      rangeStartSeconds: 2,
    })
  ).toEqual([
    expect.objectContaining({
      audioGainEnd: 0.625,
      audioGainStart: 0.875,
      duration: 2,
      fadeInMs: 0,
      fadeOutMs: 0,
      sourceDuration: 4,
      sourceStart: 12,
      startTime: 0,
      volumeEnvelopeEnd: 0.4375,
      volumeEnvelopeStart: 0.8125,
    }),
  ]);
});

it('drops non-overlapping clips and preserves clips without gain envelopes', () => {
  const project = createProject();

  getAssetByIdMock.mockReturnValue({ metadata: { hasAudio: true } });

  expect(
    collectRenderableAudioClips(project as never, {
      rangeEndSeconds: 6,
      rangeStartSeconds: 5,
    })
  ).toEqual([]);
  expect(
    collectRenderableAudioClips(project as never, {
      rangeEndSeconds: 0.75,
      rangeStartSeconds: 0.25,
    })
  ).toEqual([
    expect.objectContaining({
      duration: 0.5,
      sourceDuration: 0.5,
      sourceStart: 0.25,
      startTime: 0,
    }),
  ]);
});

it('clips EffectV1 audio with the same playback-rate source mapping used by export media', () => {
  const effectClip = {
    assetBlob: new Blob(['tone']),
    assetCacheKey: 'snapshot:tone:sha',
    assetMimeType: 'audio/wav',
    audioGainEnd: 1,
    audioGainStart: 1,
    duration: 1,
    effectInstanceId: 'effect-1',
    fadeInMs: 0,
    fadeOutMs: 0,
    id: 'effect-1:audio:0',
    muted: false,
    playbackRate: 2,
    snapshotId: 'snapshot-1',
    sourceDuration: 2,
    sourceKind: 'effect-snapshot',
    sourceStart: 0.25,
    startTime: 2,
    volume: 0.4,
    volumeEnvelopeEnd: 1,
    volumeEnvelopeStart: 1,
  } as const;

  expect(clipAudioClipToExportRange(effectClip, { end: 2.75, start: 2.25 })).toEqual(
    expect.objectContaining({
      duration: 0.5,
      sourceDuration: 1,
      sourceStart: 0.75,
      startTime: 0,
    })
  );
});

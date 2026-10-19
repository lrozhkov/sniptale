import { parseHydratableVideoProject } from '../../../../features/video/project/validation/root';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
  createVideoProjectTrack,
} from '../../../../features/video/project/factories/creation';
import { createAudioClipFromAsset } from '../../../../features/video/project/factories/clip';
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
        id: 'clip-1',
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

  project.clips.push({ ...firstClip, id: 'clip-2', assetId: 'asset-2', muted: true });

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
      fadeInMs: 900,
      fadeOutMs: 800,
      audioFadePhase: { offset: 1, duration: 4 },
      sourceDuration: 4,
      sourceStart: 12,
      startTime: 0,
      volumeEnvelopeEnd: 0.625,
      volumeEnvelopeStart: 0.875,
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

it('retains crossfade phase when exporting a range inside the audio overlap', () => {
  const project = createProject();
  const first = { ...project.clips[0]!, duration: 4, sourceDuration: 4 };
  project.clips = [first, { ...first, id: 'clip-2', startTime: 3 }];
  const withTransition = {
    ...project,
    transitions: [
      {
        id: 'fade',
        leadingClipId: 'clip-1',
        trailingClipId: 'clip-2',
        duration: 1,
        kind: 'CROSSFADE',
        easing: 'LINEAR',
      },
    ],
  };
  getAssetByIdMock.mockReturnValue({ metadata: { hasAudio: true } });
  const clips = collectRenderableAudioClips(withTransition as never, {
    rangeStartSeconds: 3.25,
    rangeEndSeconds: 3.75,
  });
  expect(clips).toHaveLength(2);
  expect(clips[0]?.audioTransitions).toEqual([
    { start: -0.25, end: 0.75, easing: 'LINEAR', incoming: false },
  ]);
  expect(clips[1]?.audioTransitions).toEqual([
    { start: -0.25, end: 0.75, easing: 'LINEAR', incoming: true },
  ]);
});

it('collects independent original attenuation and crops cells without changing authored gain', () => {
  const project = createEmptyVideoProject('Original mix');
  project.version = 6;
  const track = createVideoProjectTrack('Audio', 2, 'AUDIO');
  project.tracks.push(track);
  const asset = createVideoProjectAsset(
    'Source',
    'AUDIO',
    { kind: 'project-asset', projectAssetId: 'source' },
    {
      width: 0,
      height: 0,
      duration: 8,
      mimeType: 'audio/wav',
      size: 100,
      hasAudio: true,
      audioPeaks: null,
    }
  );
  const source = createAudioClipFromAsset(track.id, asset);
  source.volume = 0.8;
  source.audioGainStart = 0.8;
  source.audioGainEnd = 0.4;
  source.volumeEnvelopeEnd = 0.5;
  const take = {
    ...createAudioClipFromAsset(track.id, asset, 2),
    id: 'voice',
    duration: 2,
    sourceDuration: 2,
    muted: true,
    originalAudioMute: {
      volume: 0.25,
      targets: [{ assetId: source.assetId, sourceInstanceId: source.id }],
    },
  };
  project.assets = [asset];
  project.clips = [source, take];
  project.duration = 8;
  const before = structuredClone(project);
  getAssetByIdMock.mockReturnValue(asset);
  const collected = collectRenderableAudioClips(project);
  expect(collected).toHaveLength(1);
  expect(collected[0]).toMatchObject({
    volume: 1,
    volumeEnvelopeStart: 0.8,
    volumeEnvelopeEnd: 0.4,
    originalAudioRanges: [{ start: 2, end: 4, volume: 0.25 }],
  });
  const partial = collectRenderableAudioClips(project, {
    rangeStartSeconds: 3,
    rangeEndSeconds: 5,
  });
  expect(partial[0]).toMatchObject({
    startTime: 0,
    duration: 2,
    sourceStart: 3,
    originalAudioRanges: [{ start: 0, end: 1, volume: 0.25 }],
  });
  const tail = collectRenderableAudioClips(project, { rangeStartSeconds: 5, rangeEndSeconds: 7 });
  expect(tail[0]?.originalAudioRanges).toEqual([]);
  expect(project).toEqual(before);
});

it.each([{}, [{ start: 0, end: 8, volume: 0 }], [{ start: 0, end: 8, volume: 'invalid' }]])(
  'ignores imported export-local attenuation metadata %j',
  (injected) => {
    const project = createEmptyVideoProject('Imported original audio');
    const track = createVideoProjectTrack('Audio', 2, 'AUDIO');
    project.tracks.push(track);
    const asset = createVideoProjectAsset(
      'Source',
      'AUDIO',
      { kind: 'project-asset', projectAssetId: 'source' },
      {
        width: 0,
        height: 0,
        duration: 8,
        mimeType: 'audio/wav',
        size: 100,
        hasAudio: true,
        audioPeaks: null,
      }
    );
    const source = createAudioClipFromAsset(track.id, asset);
    project.duration = 8;
    project.assets = [asset];
    const serialized: unknown = JSON.parse(
      JSON.stringify({ ...project, clips: [{ ...source, originalAudioRanges: injected }] })
    );
    const imported = parseHydratableVideoProject(serialized);
    if (!imported) throw new Error('Expected supported project');
    getAssetByIdMock.mockReturnValue(asset);
    expect(collectRenderableAudioClips(imported)[0]?.originalAudioRanges).toEqual([]);
    expect(
      collectRenderableAudioClips(imported, { rangeStartSeconds: 2, rangeEndSeconds: 4 })[0]
        ?.originalAudioRanges
    ).toEqual([]);
  }
);

it('projects AUDIO masters once for full and partial export while preserving clips', () => {
  const project = createEmptyVideoProject('Track export');
  project.duration = 8;
  const track = createVideoProjectTrack('Music', 1, 'AUDIO');
  track.audioVolume = 2;
  const asset = createVideoProjectAsset(
    'Music',
    'AUDIO',
    { kind: 'project-asset', projectAssetId: 'music' },
    {
      width: 0,
      height: 0,
      duration: 8,
      mimeType: 'audio/wav',
      size: 10,
      hasAudio: true,
      audioPeaks: null,
    }
  );
  const clip = createAudioClipFromAsset(track.id, asset);
  clip.volume = 1;
  clip.audioGainStart = clip.audioGainEnd = 1.5;
  clip.volumeEnvelopeStart = clip.volumeEnvelopeEnd = 1.5;
  const neighbor = { ...clip, id: 'neighbor', trackId: project.tracks[0]!.id };
  project.assets = [asset];
  project.tracks.push(track);
  project.clips = [clip, neighbor];
  getAssetByIdMock.mockReturnValue(asset);
  const before = structuredClone(project);
  expect(
    collectRenderableAudioClips(project).map(
      (clip) => clip.volume * (clip.volumeEnvelopeStart ?? 1)
    )
  ).toEqual([3, 1.5]);
  const partial = collectRenderableAudioClips(project, {
    rangeStartSeconds: 2,
    rangeEndSeconds: 4,
  });
  expect(
    partial.map((clip) => [
      clip.volume * (clip.volumeEnvelopeStart ?? 1),
      clip.startTime,
      clip.duration,
    ])
  ).toEqual([
    [3, 0, 2],
    [1.5, 0, 2],
  ]);
  expect(project).toEqual(before);
  track.audioVolume = 0;
  expect(
    collectRenderableAudioClips(project).map(
      (clip) => clip.volume * (clip.volumeEnvelopeStart ?? 1)
    )
  ).toEqual([0, 1.5]);
});

it.each([null, 'invalid', { offset: -200, duration: 1 }, { offset: 0, duration: 10000 }])(
  'replaces imported export-only fade phase %j',
  (injected) => {
    const project = createEmptyVideoProject('Imported fade');
    const asset = createVideoProjectAsset(
      'Music',
      'AUDIO',
      { kind: 'project-asset', projectAssetId: 'music' },
      {
        width: 0,
        height: 0,
        duration: 8,
        mimeType: 'audio/wav',
        size: 10,
        hasAudio: true,
        audioPeaks: null,
      }
    );
    const clip = createAudioClipFromAsset(project.tracks[0]!.id, asset);
    project.assets = [asset];
    project.duration = 8;
    const serialized: unknown = JSON.parse(
      JSON.stringify({ ...project, clips: [{ ...clip, fadeInMs: 6000, audioFadePhase: injected }] })
    );
    const imported = parseHydratableVideoProject(serialized);
    if (!imported) throw new Error('Expected supported project');
    getAssetByIdMock.mockReturnValue(asset);
    const before = JSON.stringify(imported);
    const full = collectRenderableAudioClips(imported)[0];
    expect(full?.audioFadePhase).toEqual({ offset: 0, duration: 8 });
    const partial = full && clipAudioClipToExportRange(full, { start: 1, end: 7 });
    const nested = partial && clipAudioClipToExportRange(partial, { start: 1, end: 4 });
    expect(nested).toMatchObject({
      audioFadePhase: { offset: 2, duration: 8 },
      fadeInMs: 6000,
      sourceStart: 2,
      duration: 3,
    });
    expect(JSON.stringify(imported)).toBe(before);
  }
);

it.each([
  { volume: 4, volumeEnvelopeStart: 0.5, volumeEnvelopeEnd: 0.5, expected: 1 },
  {
    volume: 4,
    volumeEnvelopeStart: 0.5,
    volumeEnvelopeEnd: 0.5,
    audioGainStart: 0.3,
    audioGainEnd: 0.3,
    expected: 0.3,
  },
  {
    volume: 3,
    volumeEnvelopeStart: 0.25,
    volumeEnvelopeEnd: 0.75,
    audioGainStart: 1.5,
    expected: 1.5,
  },
  { volume: 0.5, volumeEnvelopeStart: 4, volumeEnvelopeEnd: 4, expected: 1 },
  {
    volume: 4,
    volumeEnvelopeStart: 0.5,
    volumeEnvelopeEnd: 0.5,
    audioGainStart: 3,
    audioGainEnd: 4,
    expected: 2,
  },
])('derives canonical media gain without rewriting admitted fields: %j', (values) => {
  const project = createEmptyVideoProject('Legacy render');
  project.version = 7;
  project.duration = 2;
  const track = createVideoProjectTrack('Audio', 1, 'AUDIO');
  track.audioVolume = 1.5;
  const asset = createVideoProjectAsset(
    'Audio',
    'AUDIO',
    { kind: 'project-asset', projectAssetId: 'source' },
    {
      width: 0,
      height: 0,
      duration: 2,
      mimeType: 'audio/wav',
      size: 1,
      hasAudio: true,
      audioPeaks: null,
    }
  );
  const clip = createAudioClipFromAsset(track.id, asset);
  delete clip.audioGainStart;
  delete clip.audioGainEnd;
  const { expected, ...gain } = values;
  Object.assign(clip, gain);
  project.tracks.push(track);
  project.assets = [asset];
  project.clips = [clip];
  const serialized: unknown = JSON.parse(JSON.stringify(project));
  const imported = parseHydratableVideoProject(serialized);
  if (!imported) throw new Error('Expected admitted project');
  getAssetByIdMock.mockReturnValue(asset);
  const before = JSON.stringify(imported);
  for (const settings of [undefined, { rangeStartSeconds: 0.25, rangeEndSeconds: 1.25 }]) {
    const prepared = collectRenderableAudioClips(imported, settings);
    expect(prepared[0]).toMatchObject({
      volume: 1.5,
      audioGainStart: expected,
      audioGainEnd: expected,
      volumeEnvelopeStart: expected,
      volumeEnvelopeEnd: expected,
    });
  }
  expect(JSON.stringify(imported)).toBe(before);
});

import { expect, it, vi } from 'vitest';
import { createReviewExportFixture as fixture } from './export-lifecycle.test-support';
import { exportReviewedVideo, buildReviewExportClipPlan } from './export-lifecycle';
import { quickEditAudioSourceKey } from '../../features/video/review/advanced/audio-plan';
import { buildReviewTimeMap } from '../../features/video/review/timeline';
import {
  buildReviewActionAudioPlan,
  ReviewActionAudioUnavailable,
} from '../../features/video/review/action-audio';
function nativeActionBuffer(): AudioBuffer {
  const plane = new Float32Array(7995).fill(0.25);
  return {
    sampleRate: 44100,
    length: plane.length,
    duration: plane.length / 44100,
    numberOfChannels: 1,
    getChannelData: () => plane,
    copyFromChannel: (to, _channel, offset = 0) => {
      to.set(plane.subarray(offset, offset + to.length));
    },
    copyToChannel: (from, _channel, offset = 0) => {
      plane.set(from, offset);
    },
  };
}

it('admits compact action audio, clips fragment boundaries once and uses bundled resolution only', async () => {
  const { args, deps } = fixture();
  const read = vi.fn(async () => nativeActionBuffer()),
    dispose = vi.fn();
  const plan = buildReviewActionAudioPlan({
    applied: true,
    settings: [
      {
        ref: { kind: 'action', id: 'click' },
        enabled: true,
        presetId: 'mouse-classic-v1',
        volume: 0.35,
        offset: 0,
      },
    ],
    markers: [{ ref: { kind: 'action', id: 'click' }, eventType: 'CLICK', start: 1, end: 1.2 }],
    segments: buildReviewTimeMap(6, []),
  });
  const result = await buildReviewExportClipPlan(
    {
      advanced: args.snapshot.workspace.advanced,
      signal: args.signal,
      fragmentOffset: 1.05,
      readProjectAsset: deps.readProjectAsset,
      action: { plan, offset: 1.05, bounds: { start: 1.05, end: 2 } },
    },
    { openAudioSource: deps.openAudioSource, createActionSource: () => ({ read, dispose }) }
  );
  expect(result.entries).toEqual([]);
  expect(result.action).toMatchObject({ offset: 1.05, busGain: 1 });
  expect(
    result.buffers.get(quickEditAudioSourceKey({ kind: 'bundled', sampleId: 'mouse-click-v1' }))
  ).toBeDefined();
  expect(read).toHaveBeenCalledExactlyOnceWith('mouse-click-v1');
  expect(deps.readProjectAsset).not.toHaveBeenCalled();
  expect(deps.openAudioSource).not.toHaveBeenCalled();
  result.dispose?.();
  result.dispose?.();
  expect(dispose).toHaveBeenCalledOnce();
});

it('blocks missing action samples before publication and cleans the job', async () => {
  const { args, deps } = fixture();
  const dispose = vi.fn();
  const plan = buildReviewActionAudioPlan({
    applied: true,
    settings: [
      {
        ref: { kind: 'action', id: 'click' },
        enabled: true,
        presetId: 'mouse-classic-v1',
        volume: 0.35,
        offset: 0,
      },
    ],
    markers: [{ ref: { kind: 'action', id: 'click' }, eventType: 'CLICK', start: 1, end: 1.2 }],
    segments: buildReviewTimeMap(6, []),
  });
  await expect(
    buildReviewExportClipPlan(
      {
        advanced: args.snapshot.workspace.advanced,
        signal: args.signal,
        fragmentOffset: 0,
        readProjectAsset: deps.readProjectAsset,
        action: { plan, offset: 0 },
      },
      {
        openAudioSource: deps.openAudioSource,
        createActionSource: () => ({
          read: async () => {
            throw new ReviewActionAudioUnavailable('resource-missing');
          },
          dispose,
        }),
      }
    )
  ).rejects.toMatchObject({ reasons: ['action-audio-resource'] });
  expect(dispose).toHaveBeenCalledOnce();
  expect(deps.createSeekableAssetObjectWriter).not.toHaveBeenCalled();
});
it('opens only intersecting preview audio, reuses distant references, and disposes partial acquisition', async () => {
  const { buildReviewExportClipPlan } = await import('./export-lifecycle');
  const sources = await import('./audio-clip-source');
  const { args } = fixture();
  const advanced = args.snapshot.workspace.advanced;
  advanced.ui.mode = 'advanced';
  advanced.ui.tracks.audio = true;
  advanced.audio.music = [0, 100, 200].map((timelineStart, index) => ({
    id: `m${index}`,
    assetId: index === 2 ? 'other' : 'shared',
    timelineStart,
    sourceOffset: index * 1000,
    duration: 10,
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
  }));
  const readProjectAsset = vi.fn(async () => new Blob(['audio']));
  const dispose = vi.fn();
  const opened = vi.spyOn(sources, 'openReviewAudioClipSource').mockResolvedValue({
    sampleRate: 48000,
    numberOfChannels: 1,
    length: 48000 * 4000,
    read: async (start, end) => ({ start, planes: [new Float32Array(end - start)] }),
    dispose,
  });
  const signal = new AbortController().signal;
  try {
    const silent = await buildReviewExportClipPlan({
      advanced,
      fragmentOffset: 0,
      signal,
      readProjectAsset,
      window: null,
    });
    expect(silent.entries).toEqual([]);
    expect(opened).not.toHaveBeenCalled();
    silent.dispose?.();
    const late = await buildReviewExportClipPlan({
      advanced,
      fragmentOffset: 0,
      signal,
      readProjectAsset,
      window: { start: 102, end: 104 },
    });
    expect(late.entries.map((entry) => entry.clipId)).toEqual(['m1']);
    expect(readProjectAsset).toHaveBeenCalledWith('shared');
    expect(opened).toHaveBeenCalledOnce();
    late.dispose?.();
    late.dispose?.();
    expect(dispose).toHaveBeenCalledOnce();
    dispose.mockClear();
    opened.mockClear();
    readProjectAsset.mockClear();
    opened.mockRejectedValueOnce(new Error('decode failed'));
    await expect(
      buildReviewExportClipPlan({
        advanced,
        fragmentOffset: 0,
        signal,
        readProjectAsset,
        window: { start: 1, end: 205 },
      })
    ).rejects.toThrow();
    expect(opened).toHaveBeenCalledOnce();
    opened
      .mockResolvedValueOnce({
        sampleRate: 48000,
        numberOfChannels: 1,
        length: 48000,
        read: async (start, end) => ({ start, planes: [new Float32Array(end - start)] }),
        dispose,
      })
      .mockRejectedValueOnce(new Error('second failed'));
    await expect(
      buildReviewExportClipPlan({
        advanced,
        fragmentOffset: 0,
        signal,
        readProjectAsset,
        window: { start: 1, end: 205 },
      })
    ).rejects.toThrow();
    expect(dispose).toHaveBeenCalledOnce();
  } finally {
    opened.mockRestore();
  }
});

it.each(['success', 'admission', 'render', 'cancel'] as const)(
  'releases external audio readers on %s',
  async (outcome) => {
    const { args, deps } = fixture();
    const advanced = args.snapshot.workspace.advanced;
    advanced.ui.mode = 'advanced';
    advanced.ui.tracks.audio = true;
    advanced.audio.music = [
      {
        id: 'm',
        assetId: 'music',
        timelineStart: 0,
        sourceOffset: 0,
        duration: 2,
        volume: 1,
        muted: false,
        fadeIn: 0,
        fadeOut: 0,
      },
    ];
    const controller = new AbortController();
    args.signal = controller.signal;
    if (outcome === 'admission')
      deps.assertAssetWriteAdmission.mockRejectedValue(new Error('admission'));
    if (outcome === 'render') deps.writeReviewPackets.mockRejectedValue(new Error('render'));
    if (outcome === 'cancel')
      deps.assertAssetWriteAdmission.mockImplementation(async () => {
        controller.abort();
      });
    if (outcome === 'success') await exportReviewedVideo(args, deps);
    else await expect(exportReviewedVideo(args, deps)).rejects.toThrow();
    expect(deps.openAudioSource).toHaveBeenCalledOnce();
    const source = await deps.openAudioSource.mock.results[0]!.value;
    expect(source.dispose).toHaveBeenCalledOnce();
  }
);

it('ignores retained alpha replacement scheduling and offsets ordinary voiceover once', async () => {
  const { buildReviewExportClipPlan } = await import('./export-lifecycle');
  const { args, deps } = fixture();
  const advanced = args.snapshot.workspace.advanced;
  advanced.ui.mode = 'advanced';
  advanced.ui.tracks.audio = true;
  advanced.audio.originalSpeech = {
    enabled: true,
    transcript: {
      version: 1,
      phrases: [],
      replacements: [
        {
          id: 'accepted',
          phraseId: 'p',
          start: 2,
          end: 8,
          duration: 4,
          enabled: true,
          originalVolume: 0.25,
          assetId: 'project-asset:accepted',
          revision: 0,
          text: 'accepted',
          textSignature: 'test',
          profile: { modelId: 'tts', voiceId: 'voice', responseFormat: 'wav' },
        },
      ],
    },
  };
  advanced.audio.voiceover = [
    {
      id: 'voice',
      assetId: 'project-asset:voice',
      timelineStart: 3,
      duration: 1,
      sourceOffset: 2,
      playbackRate: 2,
      volume: 1,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
    },
  ];
  const before = structuredClone(advanced.audio);
  const input = {
    advanced,
    fragmentOffset: 3,
    signal: args.signal,
    readProjectAsset: deps.readProjectAsset,
    window: { start: 0, end: 2 },
  };
  const plan = await buildReviewExportClipPlan(input, deps);
  expect(plan.entries).toMatchObject([
    { lane: 'voiceover', timelineStart: 0, duration: 1, sourceOffset: 2, playbackRate: 2 },
  ]);
  expect(plan).not.toHaveProperty('automaticOriginalRanges');
  expect(deps.readProjectAsset).toHaveBeenCalledWith('project-asset:voice');
  expect(deps.readProjectAsset).not.toHaveBeenCalledWith('project-asset:accepted');
  expect(advanced.audio).toEqual(before);
  expect(deps.openAudioSource).toHaveBeenCalledOnce();
  plan.dispose?.();
  await expect(
    buildReviewExportClipPlan({ ...input, readProjectAsset: async () => null }, deps)
  ).rejects.toMatchObject({ reasons: ['asset-missing'] });
  advanced.ui.mode = 'basic';
  expect((await buildReviewExportClipPlan(input, deps)).entries).toEqual([]);
});

it('exports ordinary voiceover and authored mute with packet video and preserves the original', async () => {
  const { args, deps, original } = fixture();
  const before = await original.arrayBuffer();
  args.index.processedAudioCodec = 'opus';
  args.snapshot.workspace.advanced.ui.mode = 'advanced';
  args.snapshot.workspace.advanced.ui.tracks.audio = true;
  args.snapshot.workspace.advanced.audio.voiceover = [
    {
      id: 'accepted',
      assetId: 'project-asset:accepted',
      timelineStart: 2,
      duration: 1,
      sourceOffset: 0,
      volume: 1,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
    },
  ];
  args.snapshot.workspace.advanced.audio.original.ranges = [
    { id: 'mute', start: 4, end: 5, volume: 0 },
  ];
  await exportReviewedVideo(args, deps);
  expect(deps.writeReviewPackets).toHaveBeenCalledOnce();
  expect(deps.writeReviewFrames).not.toHaveBeenCalled();
  expect(deps.writeReviewPackets).toHaveBeenCalledWith(
    expect.objectContaining({
      exportAudio: expect.objectContaining({
        entries: [
          expect.objectContaining({
            lane: 'voiceover',
            timelineStart: 2,
            duration: 1,
            sourceOffset: 0,
          }),
        ],
        originalRanges: [{ id: 'mute', start: 4, end: 5, volume: 0 }],
      }),
    })
  );
  expect(await original.arrayBuffer()).toEqual(before);
});

it('exports linked source attenuation even when no manual source ranges exist', async () => {
  const { args, deps } = fixture();
  args.index.processedAudioCodec = 'opus';
  const advanced = args.snapshot.workspace.advanced;
  advanced.ui.mode = 'advanced';
  advanced.ui.tracks.audio = true;
  advanced.audio.voiceoverSegments = buildReviewTimeMap(
    args.snapshot.workspace.source.duration,
    []
  );
  advanced.audio.voiceover = [
    {
      id: 'take',
      assetId: 'project-asset:take',
      timelineStart: 2,
      duration: 1,
      sourceOffset: 0,
      volume: 1,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
    },
  ];
  advanced.audio.original.mutes = [{ id: 'binding', kind: 'take', clipId: 'take' }];
  await exportReviewedVideo(args, deps);
  expect(deps.writeReviewPackets).toHaveBeenCalledWith(
    expect.objectContaining({
      exportAudio: expect.objectContaining({
        originalRanges: [{ id: 'source-envelope:0', start: 2, end: 3, volume: 0 }],
      }),
    })
  );
});

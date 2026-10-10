import { createReviewExportFixture as fixture } from './export-lifecycle.test-support';
import { createQuickEditZoomRegion } from '../../features/video/review/advanced/zoom';
import { expect, it, vi } from 'vitest';
import { exportReviewedVideo, type ReviewExportClipPlan } from './export-lifecycle';
import { createCanvasComment } from '../../features/video/review/comments';
import { anchorReviewVoiceover } from '../../features/video/review/voiceover-edits';
import { buildReviewTimeMap } from '../../features/video/review/timeline';

it('publishes a new prepared asset once and returns a separate downloadable file and revision receipt', async () => {
  const { args, deps, writer, original, result } = fixture();
  const exported = await exportReviewedVideo(args, deps);
  expect(exported.file).toBe(result);
  expect(exported.receipt).toMatchObject({
    revision: 2,
    resultDuration: 4,
    filename: expect.stringMatching(/^Sniptale_video-review_.*_edited\.webm$/),
  });
  expect(deps.writeReviewPackets).toHaveBeenCalledWith(expect.objectContaining({ file: original }));
  expect(deps.saveRecordingsBatchSafely).toHaveBeenCalledOnce();
  expect(deps.saveRecordingsBatchSafely).toHaveBeenCalledWith([
    expect.objectContaining({
      filename: expect.stringMatching(/^Sniptale_video-review_.*_edited\.webm$/),
      preparedAsset: expect.objectContaining({
        ref: expect.objectContaining({ assetId: 'output' }),
      }),
    }),
  ]);
  expect(writer.abort).not.toHaveBeenCalled();
  expect(deps.releaseAssetReadyProtection).toHaveBeenCalledWith(['output']);
});

it('exports native overlapping voices and uninterrupted music through Speed and a Cut', async () => {
  const { args, deps } = fixture();
  const speed = {
    id: 's',
    kind: 'speed' as const,
    start: 1,
    end: 2,
    requestedStart: 1,
    requestedEnd: 2,
    rate: 2 as const,
    audio: 'mute' as const,
  };
  args.snapshot.workspace.history.push({
    id: 'speed',
    at: 3,
    target: 'edit',
    before: null,
    after: speed,
  });
  args.snapshot.workspace.cursor = 2;
  args.index.boundaries = [0, 1, 2, 4, 6];
  const advanced = args.snapshot.workspace.advanced;
  advanced.ui.mode = 'advanced';
  advanced.ui.tracks.audio = true;
  const map = buildReviewTimeMap(6, [
    speed,
    { id: 'cut', kind: 'cut', start: 2, end: 4, requestedStart: 2, requestedEnd: 4 },
  ]);
  const base = {
    id: 'music',
    assetId: 'project-asset:m',
    timelineStart: 0,
    sourceOffset: 1,
    duration: 3.5,
    volume: 1,
    muted: false,
    fadeIn: 0.2,
    fadeOut: 0.3,
  };
  advanced.audio.music = [base];
  advanced.audio.voiceoverSegments = map;
  advanced.audio.voiceover = [0.8, 0.9].map((timelineStart, index) =>
    anchorReviewVoiceover({ ...base, id: `v${index}`, timelineStart, duration: 1.3 }, map)
  );
  vi.stubGlobal(
    'OfflineAudioContext',
    class {
      async decodeAudioData() {
        return { duration: 10 };
      }
    }
  );
  try {
    await exportReviewedVideo(args, deps);
    const call = deps.writeReviewPackets.mock.calls[0] as unknown as [
      { exportAudio: ReviewExportClipPlan },
    ];
    const entries = call[0].exportAudio.entries;
    expect(entries.filter((entry) => entry.lane === 'music')).toMatchObject([
      { timelineStart: 0, sourceOffset: 1, duration: 3.5, fadeIn: 0.2, fadeOut: 0.3 },
    ]);
    const voices = entries.filter((entry) => entry.lane === 'voiceover');
    expect(voices).toHaveLength(2);
    voices.forEach((voice, index) => {
      expect(voice.timelineStart).toBeCloseTo(index === 0 ? 0.8 : 0.9);
      expect(voice.duration).toBeCloseTo(1.3);
      expect(voice.playbackRate).toBe(1);
      expect(voice.sourceOffset).toBe(1);
    });
  } finally {
    vi.unstubAllGlobals();
  }
});
it('rejects a replaced source before admitting any staging bytes', async () => {
  const { args, deps } = fixture();
  deps.loadVideoReviewSource.mockResolvedValueOnce({
    ...(await deps.loadVideoReviewSource()),
    snapshot: {
      ...args.snapshot,
      workspace: { ...args.snapshot.workspace, sourceAssetId: 'replaced' },
    },
  });
  await expect(exportReviewedVideo(args, deps)).rejects.toThrow('changed');
  expect(deps.createSeekableAssetObjectWriter).not.toHaveBeenCalled();
});

it('prepares a temporary download without publishing and releases it only when the downloader finishes', async () => {
  const { args, deps, writer } = fixture();
  const result = await exportReviewedVideo({ ...args, destination: 'download' }, deps);
  expect(result.receipt.mediaId).toBeNull();
  expect(deps.saveRecordingsBatchSafely).not.toHaveBeenCalled();
  expect(writer.abort).not.toHaveBeenCalled();
  expect(result.release).toBeTypeOf('function');
  await result.release?.();
  expect(writer.abort).toHaveBeenCalledOnce();
});

it('downloads only the selected kept fragment without mutating history or publishing a gallery row', async () => {
  const { args, deps, writer } = fixture();
  const before = structuredClone(args.snapshot);
  const exported = await exportReviewedVideo(
    { ...args, destination: 'download', selection: { kind: 'range', start: 0.1, end: 2.1 } },
    deps
  );
  expect(exported.receipt.filename).toMatch(
    /^Sniptale_video-review_.*_fragment-0\.000-2\.000\.webm$/
  );
  expect(deps.writeReviewPackets).toHaveBeenCalledWith(
    expect.objectContaining({ edits: [expect.objectContaining({ kind: 'cut', start: 2, end: 6 })] })
  );
  expect(args.snapshot).toEqual(before);
  expect(deps.saveRecordingsBatchSafely).not.toHaveBeenCalled();
  await exported.release?.();
  expect(writer.abort).toHaveBeenCalledOnce();
});

it('rejects a removed fragment or gallery destination before allocating storage', async () => {
  const { args, deps } = fixture();
  await expect(
    exportReviewedVideo(
      { ...args, destination: 'download', selection: { kind: 'range', start: 2, end: 4 } },
      deps
    )
  ).rejects.toThrow('nonempty fragment');
  await expect(
    exportReviewedVideo({ ...args, selection: { kind: 'range', start: 0, end: 2 } }, deps)
  ).rejects.toThrow('temporary download');
  expect(deps.createSeekableAssetObjectWriter).not.toHaveBeenCalled();
});

it('mixes applied external audio and original settings into an audio-only export', async () => {
  const { args, deps } = fixture();
  const advanced = args.snapshot.workspace.advanced;
  advanced.ui.mode = 'advanced';
  advanced.ui.tracks.audio = true;
  advanced.audio.music = [
    {
      id: 'm',
      assetId: 'project-asset:m',
      timelineStart: 1,
      sourceOffset: 0,
      duration: 2,
      volume: 0.5,
      muted: false,
      fadeIn: 0.2,
      fadeOut: 0,
    },
  ];
  advanced.audio.original = { muted: false, volume: 1.5 };
  advanced.audio.laneVolumes = { voiceover: 1, music: 0.4 };
  class FakeOfflineContext {
    async decodeAudioData() {
      return { duration: 2, numberOfChannels: 2, getChannelData: () => new Float32Array(96_000) };
    }
  }
  vi.stubGlobal('OfflineAudioContext', FakeOfflineContext);
  try {
    await exportReviewedVideo(args, deps);
    const call = (deps.writeReviewPackets.mock.calls[0] ?? []) as unknown as Record<
      string,
      unknown
    >[];
    const exported = (call[0] ?? {}) as { exportAudio?: ReviewExportClipPlan };
    expect(exported.exportAudio).toMatchObject({
      originalVolume: 1.5,
      originalMuted: false,
    });
    expect(exported.exportAudio!.entries).toEqual([
      expect.objectContaining({ clipId: 'm', timelineStart: 1, volume: 0.2 }),
    ]);
    expect(exported.exportAudio!.buffers.get('project-asset:m')).toBeDefined();
  } finally {
    vi.unstubAllGlobals();
  }
});

it('blocks the export when an applied clip asset is missing or undecodable', async () => {
  const { args, deps } = fixture();
  const advanced = args.snapshot.workspace.advanced;
  advanced.ui.mode = 'advanced';
  advanced.ui.tracks.audio = true;
  advanced.audio.music = [
    {
      id: 'm',
      assetId: 'project-asset:m',
      timelineStart: 1,
      sourceOffset: 0,
      duration: 2,
      volume: 1,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
    },
  ];
  deps.readProjectAsset.mockResolvedValue(null);
  vi.stubGlobal(
    'OfflineAudioContext',
    class {
      async decodeAudioData() {
        return { duration: 2, numberOfChannels: 2, getChannelData: () => new Float32Array(96_000) };
      }
    }
  );
  try {
    await expect(exportReviewedVideo(args, deps)).rejects.toMatchObject({
      name: 'QuickEditExportUnavailable',
      reasons: ['asset-missing'],
    });
  } finally {
    vi.unstubAllGlobals();
  }
  expect(deps.writeReviewPackets).not.toHaveBeenCalled();
});

it('routes visual changes to the full frame renderer and stages the encoded result', async () => {
  const { args, deps, writer } = fixture();
  const advanced = args.snapshot.workspace.advanced;
  advanced.ui.mode = 'advanced';
  advanced.ui.tracks.zoom = true;
  advanced.zoom.enabled = true;
  advanced.zoom.regions = [createQuickEditZoomRegion({ id: 'visual', at: 0, endMax: 4 })];
  args.index = {
    ...args.index,
    processedVideoCodec: 'vp9',
    frameRate: 30,
  };
  deps.writeReviewFrames = vi.fn(async () => ({
    videoPackets: 90,
    audioPackets: 0,
    resultDuration: 4,
    audioRanges: [],
  }));
  const exported = await exportReviewedVideo(args, deps);
  expect(deps.writeReviewFrames).toHaveBeenCalledWith(
    expect.objectContaining({ fragmentOffset: 0 })
  );
  expect(deps.writeReviewPackets).not.toHaveBeenCalled();
  expect(exported.receipt).toMatchObject({
    resultDuration: 4,
    filename: expect.stringMatching(/^Sniptale_video-review_.*_edited\.webm$/),
  });
  expect(writer.abort).not.toHaveBeenCalled();
});

it('blocks visual changes without a video encoder and never stages bytes', async () => {
  const { args, deps } = fixture();
  const advanced = args.snapshot.workspace.advanced;
  advanced.ui.mode = 'advanced';
  advanced.ui.tracks.zoom = true;
  advanced.zoom.enabled = true;
  advanced.zoom.regions = [createQuickEditZoomRegion({ id: 'visual', at: 0, endMax: 4 })];
  await expect(exportReviewedVideo(args, deps)).rejects.toMatchObject({
    name: 'QuickEditExportUnavailable',
    reasons: ['video-encoder'],
  });
  expect(deps.createSeekableAssetObjectWriter).not.toHaveBeenCalled();
});

it('routes stored in-frame comments into rendered exports', async () => {
  const { args, deps, writer } = fixture();
  const advanced = args.snapshot.workspace.advanced;
  advanced.ui.mode = 'advanced';
  advanced.ui.tracks.zoom = true;
  advanced.zoom.enabled = true;
  advanced.zoom.regions = [createQuickEditZoomRegion({ id: 'visual', at: 0, endMax: 4 })];
  args.index = {
    ...args.index,
    processedVideoCodec: 'vp9',
    frameRate: 30,
  };
  args.snapshot.workspace.history.push(
    {
      id: 'op-annotation',
      at: 3,
      target: 'annotation',
      before: null,
      after: { id: 'a1', text: 'Look at this', anchor: { kind: 'point', time: 2 } },
    },
    {
      id: 'op-comment',
      at: 4,
      target: 'canvasComment',
      before: null,
      after: { ...createCanvasComment({ id: 'c', at: 1, annotationId: 'a1' }) },
    }
  );
  args.snapshot.workspace.cursor = 3;
  deps.writeReviewFrames = vi.fn(async () => ({
    videoPackets: 90,
    audioPackets: 0,
    resultDuration: 4,
    audioRanges: [],
  }));
  await exportReviewedVideo(args, deps);
  expect(deps.writeReviewFrames).toHaveBeenCalledWith(
    expect.objectContaining({
      fragmentOffset: 0,
      comments: [
        expect.objectContaining({
          id: 'c',
          annotationId: 'a1',
          resolvedText: 'Look at this',
          renderToVideo: true,
        }),
      ],
    })
  );
  expect(deps.writeReviewPackets).not.toHaveBeenCalled();
  expect(writer.abort).not.toHaveBeenCalled();
  expect(args.snapshot.workspace.history.at(-1)?.target).toBe('canvasComment');
});

it('blocks the export with the audio-encoder reason when the indexed probe failed', async () => {
  const { args, deps } = fixture();
  const advanced = args.snapshot.workspace.advanced;
  advanced.ui.mode = 'advanced';
  advanced.audio.original = { muted: false, volume: 1.5 };
  const index = { ...args.index, audioCodec: 'opus' as const, processedAudioCodec: null };
  await expect(exportReviewedVideo({ ...args, index }, deps)).rejects.toMatchObject({
    name: 'QuickEditExportUnavailable',
    reasons: ['audio-encoder'],
  });
  expect(deps.createSeekableAssetObjectWriter).not.toHaveBeenCalled();
});

it('rejects unsupported speed audio before allocating any temporary or published asset', async () => {
  const { args, deps } = fixture();
  args.snapshot.workspace.history[0]!.after = {
    id: 'speed',
    kind: 'speed',
    start: 2,
    end: 4,
    requestedStart: 2,
    requestedEnd: 4,
    rate: 2,
    audio: 'mute',
  };
  await expect(
    exportReviewedVideo(
      { ...args, index: { ...args.index, audioCodec: 'opus', processedAudioCodec: null } },
      deps
    )
  ).rejects.toMatchObject({ name: 'QuickEditExportUnavailable', reasons: ['audio-encoder'] });
  expect(deps.createSeekableAssetObjectWriter).not.toHaveBeenCalled();
  expect(deps.saveRecordingsBatchSafely).not.toHaveBeenCalled();
});
it('aborts uncommitted staging on cancellation or packet write failure', async () => {
  for (const cancel of [true, false]) {
    const { args, deps, writer, controller } = fixture();
    deps.writeReviewPackets.mockImplementationOnce(async () => {
      if (cancel) controller.abort();
      throw new Error(cancel ? 'Cancelled' : 'Quota exceeded');
    });
    await expect(exportReviewedVideo(args, deps)).rejects.toThrow();
    expect(writer.abort).toHaveBeenCalledOnce();
    expect(deps.saveRecordingsBatchSafely).not.toHaveBeenCalled();
  }
});
it('never deletes a journal-owned object after uncertain publication failure', async () => {
  const { args, deps, writer } = fixture();
  deps.saveRecordingsBatchSafely.mockRejectedValueOnce(new Error('Publication pending'));
  await expect(exportReviewedVideo(args, deps)).rejects.toThrow('Publication pending');
  expect(writer.abort).not.toHaveBeenCalled();
  expect(deps.releaseAssetReadyProtection).toHaveBeenCalledWith(['output']);
});
it('completes the publication transaction even if the page cancels at its boundary', async () => {
  const { args, deps, writer, controller } = fixture();
  const result = await exportReviewedVideo(
    { ...args, onPublishing: () => controller.abort() },
    deps
  );
  expect(result.receipt.mediaId).toMatch(/^recording:/);
  expect(writer.abort).not.toHaveBeenCalled();
});

it('publishes the effective canvas dimensions instead of the original source metadata', async () => {
  const { args, deps } = fixture();
  args.snapshot.workspace.advanced.ui.mode = 'advanced';
  args.snapshot.workspace.advanced.canvas = { width: 1080, height: 1920 };
  args.index.processedVideoCodec = 'vp8';
  deps.writeReviewFrames.mockResolvedValue({
    videoPackets: 40,
    audioPackets: 0,
    resultDuration: 4,
    audioRanges: [],
  });
  await exportReviewedVideo(args, deps);
  expect(deps.saveRecordingsBatchSafely).toHaveBeenCalledWith([
    expect.objectContaining({
      mediaMetadata: { kind: 'video', width: 1080, height: 1920, duration: 4 },
    }),
  ]);
});

it('does not load hidden audio assets or render hidden focus during export', async () => {
  const { args, deps } = fixture();
  const advanced = args.snapshot.workspace.advanced;
  advanced.ui.mode = 'advanced';
  advanced.ui.tracks = { actions: true, zoom: false, audio: false };
  advanced.zoom.enabled = true;
  advanced.zoom.regions = [createQuickEditZoomRegion({ id: 'visual', at: 0, endMax: 4 })];
  advanced.audio.music = [
    {
      id: 'hidden',
      assetId: 'missing',
      timelineStart: 0,
      sourceOffset: 0,
      duration: 2,
      volume: 1,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
    },
  ];
  deps.readProjectAsset.mockResolvedValue(null);
  await exportReviewedVideo(args, deps);
  expect(deps.writeReviewPackets).toHaveBeenCalledOnce();
  expect(deps.writeReviewFrames).not.toHaveBeenCalled();
  expect(deps.readProjectAsset).not.toHaveBeenCalled();
  expect(advanced.audio.music).toHaveLength(1);
});

it('publishes the chosen container, resolution and matching filename for a converted export', async () => {
  const { args, deps } = fixture();
  args.snapshot.workspace.advanced.ui.mode = 'advanced';
  args.snapshot.workspace.advanced.canvas = { width: 1920, height: 1080 };
  args.index.outputCodecs = { mp4: ['avc'], webm: ['vp9'] };
  deps.writeReviewFrames.mockResolvedValue({
    videoPackets: 40,
    audioPackets: 0,
    resultDuration: 4,
    audioRanges: [],
  });
  const renderSettings = {
    format: 'mp4' as const,
    codec: 'avc' as const,
    resolution: '720P' as const,
    quality: 'HIGH' as const,
    frameRate: 30 as const,
  };
  const result = await exportReviewedVideo({ ...args, renderSettings }, deps);
  expect(result.receipt.filename).toMatch(/^Sniptale_video-review_.*_edited\.mp4$/);
  expect(deps.createSeekableAssetObjectWriter).toHaveBeenCalledWith({ mimeType: 'video/mp4' });
  expect(deps.writeReviewFrames).toHaveBeenCalledWith(expect.objectContaining({ renderSettings }));
  expect(deps.saveRecordingsBatchSafely).toHaveBeenCalledWith([
    expect.objectContaining({
      filename: expect.stringMatching(/^Sniptale_video-review_.*_edited\.mp4$/),
      mediaMetadata: { kind: 'video', width: 1280, height: 720, duration: 4 },
    }),
  ]);
  expect(deps.writeReviewPackets).not.toHaveBeenCalled();
});

it('copies Basic video with source gain while ignoring stored external audio', async () => {
  const { args, deps } = fixture();
  const advanced = args.snapshot.workspace.advanced;
  advanced.audio.original = {
    muted: false,
    volume: 0.5,
    ranges: [{ id: 'quiet', start: 0, end: 1, volume: 0 }],
  };
  advanced.audio.music = [
    {
      id: 'hidden',
      assetId: 'missing',
      timelineStart: 0,
      sourceOffset: 0,
      duration: 1,
      volume: 1,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
    },
  ];
  vi.stubGlobal('OfflineAudioContext', class {});
  try {
    await exportReviewedVideo(
      { ...args, destination: 'download', selection: { kind: 'range', start: 0, end: 6 } },
      deps
    );
    expect(deps.writeReviewFrames).not.toHaveBeenCalled();
    expect(deps.readProjectAsset).not.toHaveBeenCalled();
    expect(deps.writeReviewPackets).toHaveBeenCalledWith(
      expect.objectContaining({
        exportAudio: expect.objectContaining({
          originalVolume: 0.5,
          originalMuted: false,
          originalRanges: advanced.audio.original.ranges,
          entries: [],
        }),
      })
    );
  } finally {
    vi.unstubAllGlobals();
  }
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

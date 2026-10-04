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

it('shifts fragment clip placements across a leading cut to global output time', async () => {
  const { args, deps } = fixture();
  args.snapshot.workspace.history[0]!.after = {
    id: 'cut',
    kind: 'cut',
    start: 1,
    end: 3,
    requestedStart: 1,
    requestedEnd: 3,
  };
  args.index.processedVideoCodec = 'vp8';
  deps.writeReviewFrames.mockResolvedValue({
    videoPackets: 40,
    audioPackets: 0,
    resultDuration: 3,
    audioRanges: [],
  });
  const advanced = args.snapshot.workspace.advanced;
  advanced.ui.mode = 'advanced';
  advanced.ui.tracks.audio = true;
  advanced.audio.music = [
    {
      id: 'm',
      assetId: 'project-asset:m',
      timelineStart: 1.5,
      sourceOffset: 0,
      duration: 2,
      volume: 1,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
    },
  ];
  vi.stubGlobal(
    'OfflineAudioContext',
    class {
      async decodeAudioData() {
        return { duration: 2, numberOfChannels: 2, getChannelData: () => new Float32Array(96_000) };
      }
    }
  );
  try {
    await exportReviewedVideo(
      { ...args, destination: 'download', selection: { kind: 'range', start: 2, end: 6 } },
      deps
    );
  } finally {
    vi.unstubAllGlobals();
  }
  expect(deps.writeReviewPackets).not.toHaveBeenCalled();
  const call = (deps.writeReviewFrames.mock.calls[0] ?? []) as unknown as Record<string, unknown>[];
  const exported = (call[0] ?? {}) as { exportAudio?: ReviewExportClipPlan };
  // Full-output time of source 2 is 1; the clip plays at 1.5 globally → 0.5 fragment-local.
  expect(exported.exportAudio!.entries[0]).toMatchObject({ timelineStart: 0.5 });
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

it('plans exact advanced fragment cuts before selecting the frame renderer', async () => {
  const { args, deps } = fixture();
  args.snapshot.workspace.advanced.ui.mode = 'advanced';
  args.snapshot.workspace.history = [];
  args.snapshot.workspace.cursor = 0;
  args.index.processedVideoCodec = 'vp8';
  deps.writeReviewFrames.mockResolvedValue({
    videoPackets: 20,
    audioPackets: 0,
    resultDuration: 2,
    audioRanges: [],
  });
  const before = structuredClone(args.snapshot);
  const result = await exportReviewedVideo(
    { ...args, destination: 'download', selection: { kind: 'range', start: 0.1, end: 2.1 } },
    deps
  );
  expect(result.receipt.filename).toMatch(
    /^Sniptale_video-review_.*_fragment-0\.100-2\.100\.webm$/
  );
  expect(deps.writeReviewPackets).not.toHaveBeenCalled();
  expect(deps.writeReviewFrames).toHaveBeenCalledWith(
    expect.objectContaining({
      edits: [
        expect.objectContaining({ kind: 'cut', start: 0, end: 0.1 }),
        expect.objectContaining({ kind: 'cut', start: 2.1, end: 6 }),
      ],
    })
  );
  expect(args.snapshot).toEqual(before);
  expect(deps.saveRecordingsBatchSafely).not.toHaveBeenCalled();
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

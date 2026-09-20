import { expect, it, vi } from 'vitest';
import { exportReviewedVideo, type ReviewExportClipPlan } from './export-lifecycle';
import type { VideoWorkspaceSnapshot } from '../../composition/persistence/review-workspaces/contracts';
import type { PreparedAssetObject } from '../../composition/persistence/assets';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import { createCanvasComment } from '../../features/video/review/comments';
import type { ReviewMediaIndex } from './media-index';
import type { ReviewPacketReceipt } from './packet-export';

function fixture() {
  const source = { duration: 6, width: 160, height: 90, mimeType: 'video/webm', size: 5 };
  const snapshot: VideoWorkspaceSnapshot = {
    workspace: {
      aggregateId: 'recording:original',
      sourceAssetId: 'original-asset',
      formatVersion: 1,
      source,
      revision: 2,
      cursor: 1,
      advanced: createQuickEditAdvancedState(),
      createdAt: 1,
      updatedAt: 2,
      history: [
        {
          id: 'op',
          at: 2,
          target: 'edit',
          before: null,
          after: { id: 'cut', kind: 'cut', start: 2, end: 4, requestedStart: 2, requestedEnd: 4 },
        },
      ],
    },
    draft: null,
  };
  const prepared: PreparedAssetObject = {
    ref: {
      assetId: 'output',
      createdAt: 3,
      mimeType: 'video/webm',
      size: 4,
      sha256: null,
      location: { kind: 'opfs', objectKey: 'objects/output' },
    },
  };
  const writer = {
    assetId: 'output',
    append: vi.fn(),
    writeAt: vi.fn(),
    abort: vi.fn(),
    finalize: vi.fn(async () => prepared),
  };
  const original = new File(['video'], 'clip.webm');
  const result = new File(['copy'], 'clip-edited.webm');
  const deps = {
    loadVideoReviewSource: vi.fn(async () => ({
      source,
      snapshot,
      filename: 'clip.webm',
      file: original,
      telemetry: null,
    })),
    assertAssetWriteAdmission: vi.fn(async () => undefined),
    createSeekableAssetObjectWriter: vi.fn(async () => writer),
    readAssetFile: vi.fn(async () => result),
    releaseAssetReadyProtection: vi.fn(async () => undefined),
    saveRecordingsBatchSafely: vi.fn(async () => undefined),
    readProjectAsset: vi.fn(async (_assetId: string) => new Blob() as unknown as Blob | null),
    writeReviewPackets: vi.fn(async () => ({
      videoPackets: 40,
      audioPackets: 0,
      resultDuration: 4,
      audioRanges: [],
    })),
    writeReviewFrames: vi.fn(async (): Promise<ReviewPacketReceipt> => {
      throw new Error('Unexpected full render in packet-path fixture.');
    }),
  } satisfies Parameters<typeof exportReviewedVideo>[1];
  const controller = new AbortController();
  const args = {
    snapshot,
    index: {
      duration: 6,
      boundaries: [0, 2, 4, 6],
      videoCodec: 'vp8' as const,
      audioCodec: null,
      container: 'webm' as const,
      rotation: 0 as const,
    } as ReviewMediaIndex,
    signal: controller.signal,
  };
  return { args, deps, writer, controller, original, result };
}

it('publishes a new prepared asset once and returns a separate downloadable file and revision receipt', async () => {
  const { args, deps, writer, original, result } = fixture();
  const exported = await exportReviewedVideo(args, deps);
  expect(exported.file).toBe(result);
  expect(exported.receipt).toMatchObject({
    revision: 2,
    resultDuration: 4,
    filename: 'clip-edited.webm',
  });
  expect(deps.writeReviewPackets).toHaveBeenCalledWith(expect.objectContaining({ file: original }));
  expect(deps.saveRecordingsBatchSafely).toHaveBeenCalledOnce();
  expect(deps.saveRecordingsBatchSafely).toHaveBeenCalledWith([
    expect.objectContaining({
      filename: 'clip-edited.webm',
      preparedAsset: expect.objectContaining({
        ref: expect.objectContaining({ assetId: 'output' }),
      }),
    }),
  ]);
  expect(writer.abort).not.toHaveBeenCalled();
  expect(deps.releaseAssetReadyProtection).toHaveBeenCalledWith(['output']);
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
  expect(exported.receipt.filename).toBe('clip-fragment-0.000-2.000.webm');
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
      expect.objectContaining({ clipId: 'm', timelineStart: 1, volume: 0.5 }),
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
  advanced.zoom.enabled = true;
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
  expect(exported.receipt).toMatchObject({ resultDuration: 4, filename: 'clip-edited.webm' });
  expect(writer.abort).not.toHaveBeenCalled();
});

it('blocks visual changes without a video encoder and never stages bytes', async () => {
  const { args, deps } = fixture();
  const advanced = args.snapshot.workspace.advanced;
  advanced.ui.mode = 'advanced';
  advanced.zoom.enabled = true;
  await expect(exportReviewedVideo(args, deps)).rejects.toMatchObject({
    name: 'QuickEditExportUnavailable',
    reasons: ['video-encoder'],
  });
  expect(deps.createSeekableAssetObjectWriter).not.toHaveBeenCalled();
});

it('keeps stored in-frame comments out of rendered exports while the feature is unavailable', async () => {
  const { args, deps, writer } = fixture();
  const advanced = args.snapshot.workspace.advanced;
  advanced.ui.mode = 'advanced';
  advanced.zoom.enabled = true;
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
      comments: [],
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

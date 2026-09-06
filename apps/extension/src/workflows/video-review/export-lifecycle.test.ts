import { expect, it, vi } from 'vitest';
import { exportReviewedVideo } from './export-lifecycle';
import type { VideoWorkspaceSnapshot } from '../../composition/persistence/review-workspaces/contracts';
import type { PreparedAssetObject } from '../../composition/persistence/assets';

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
    writeReviewPackets: vi.fn(async () => ({
      videoPackets: 40,
      audioPackets: 0,
      resultDuration: 4,
      audioRanges: [],
    })),
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
    },
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
  ).rejects.toThrow('Audio processing');
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

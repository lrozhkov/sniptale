import { vi } from 'vitest';
import type { exportReviewedVideo } from './export-lifecycle';
import type { loadVideoReviewSource } from './source';
import type { saveRecordingsBatchSafely } from '../media-hub/store';
import type { VideoWorkspaceSnapshot } from '../../composition/persistence/review-workspaces/contracts';
import type { PreparedAssetObject } from '../../composition/persistence/assets';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import type { ReviewMediaIndex } from './media-index';
import type { ReviewPacketReceipt } from './packet-export';

export function createReviewExportFixture() {
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
    loadVideoReviewSource: vi.fn(
      async (
        _id?: string,
        _signal?: AbortSignal
      ): Promise<Awaited<ReturnType<typeof loadVideoReviewSource>>> => ({
        source,
        snapshot,
        filename: 'clip.webm',
        file: original,
        telemetry: null,
      })
    ),
    assertAssetWriteAdmission: vi.fn(async () => undefined),
    createSeekableAssetObjectWriter: vi.fn(async () => writer),
    initDB: vi.fn<NonNullable<Parameters<typeof exportReviewedVideo>[1]>['initDB']>(),
    readAssetFile: vi.fn(async () => result),
    releaseAssetReadyProtection: vi.fn(async () => undefined),
    saveRecordingsBatchSafely: vi.fn(
      async (_inputs: Parameters<typeof saveRecordingsBatchSafely>[0]) => undefined
    ),
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

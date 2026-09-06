import { isSafeArchiveEntryLeafFilename } from '@sniptale/platform/data/zip-profile/entry-filenames';
import {
  assertAssetWriteAdmission,
  createSeekableAssetObjectWriter,
  readAssetFile,
  releaseAssetReadyProtection,
} from '../../composition/persistence/assets';
import type { VideoWorkspaceSnapshot } from '../../composition/persistence/review-workspaces/contracts';
import { replayReviewHistory } from '../../features/video/review/document';
import { saveRecordingsBatchSafely } from '../media-hub/store';
import { loadVideoReviewSource } from './source';
import { writeReviewPackets, type ReviewPacketReceipt } from './packet-export';
import type { ReviewMediaIndex } from './media-index';
import { encodeReviewProvenance } from '../../features/video/review/provenance';

export interface ReviewExportReceipt extends ReviewPacketReceipt {
  revision: number;
  mediaId: string | null;
  filename: string;
  createdAt: number;
}
const persistence = {
  assertAssetWriteAdmission,
  createSeekableAssetObjectWriter,
  readAssetFile,
  releaseAssetReadyProtection,
  saveRecordingsBatchSafely,
  loadVideoReviewSource,
  writeReviewPackets,
};

/** Owns staging cancellation until journal publication becomes the final non-cancellable step. */
export async function exportReviewedVideo(
  args: {
    snapshot: VideoWorkspaceSnapshot;
    index: ReviewMediaIndex;
    signal: AbortSignal;
    destination?: 'gallery' | 'download';
    onProgress?(fraction: number): void;
    onPublishing?(): void;
  },
  deps = persistence
) {
  const { signal, index } = args;
  const snapshot = structuredClone(args.snapshot);
  const workspace = snapshot.workspace;
  signal.throwIfAborted();
  const original = await deps.loadVideoReviewSource(workspace.aggregateId, signal);
  if (
    original.snapshot.workspace.sourceAssetId !== workspace.sourceAssetId ||
    original.snapshot.workspace.revision !== workspace.revision ||
    original.source.duration !== index.duration
  )
    throw new Error('Review source or committed revision changed.');
  const document = replayReviewHistory(workspace.history, workspace.cursor, workspace.source);
  const audioReencoded = !!index.audioCodec && document.edits.some((edit) => edit.kind === 'speed');
  if (audioReencoded && !index.processedAudioCodec)
    throw new Error('Audio processing is unavailable.');
  const createdAt = Date.now();
  const provenance = encodeReviewProvenance({
    format: 'sniptale.video-edit.v1',
    timeUnit: 'seconds',
    source: { ...workspace.source, filename: original.filename },
    revision: workspace.revision,
    exportedAt: createdAt,
    edits: document.edits,
    audioReencoded,
  });
  const id = crypto.randomUUID();
  const candidate = `${original.filename.replace(/\.[^.]+$/, '')}-edited.${index.container}`;
  const filename = isSafeArchiveEntryLeafFilename(candidate)
    ? candidate
    : `video-edited.${index.container}`;
  await deps.assertAssetWriteAdmission(original.file.size + 1024 * 1024);
  signal.throwIfAborted();
  const writer = await deps.createSeekableAssetObjectWriter({
    mimeType: `video/${index.container}`,
  });
  let publishing = false;
  try {
    const packetReceipt = await deps.writeReviewPackets({
      file: original.file,
      index,
      edits: document.edits,
      writer,
      signal,
      provenance,
      ...(args.onProgress ? { onProgress: args.onProgress } : {}),
    });
    signal.throwIfAborted();
    const prepared = await writer.finalize();
    const file = await deps.readAssetFile(prepared.ref, filename);
    signal.throwIfAborted();
    if (args.destination === 'download') {
      const receipt: ReviewExportReceipt = {
        ...packetReceipt,
        revision: workspace.revision,
        mediaId: null,
        filename,
        createdAt,
      };
      return { file, receipt, release: () => writer.abort() };
    }
    args.onPublishing?.();
    publishing = true;
    await deps.saveRecordingsBatchSafely([
      {
        id,
        filename,
        preparedAsset: prepared,
        mediaMetadata: {
          kind: 'video',
          width: workspace.source.width,
          height: workspace.source.height,
          duration: packetReceipt.resultDuration,
        },
      },
    ]);
    await deps.releaseAssetReadyProtection([writer.assetId]);
    const receipt: ReviewExportReceipt = {
      ...packetReceipt,
      revision: workspace.revision,
      mediaId: `recording:${id}`,
      filename,
      createdAt,
    };
    return { file, receipt };
  } catch (error) {
    try {
      // Publication owns any ready journal from this point; abort must not delete referenced media.
      if (publishing) await deps.releaseAssetReadyProtection([writer.assetId]);
      else await writer.abort();
    } catch (cleanup) {
      throw new AggregateError(
        [error, cleanup],
        'Export failed and staging cleanup needs recovery.',
        { cause: cleanup }
      );
    }
    throw error;
  }
}

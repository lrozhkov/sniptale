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

export interface ReviewExportReceipt extends ReviewPacketReceipt {
  revision: number;
  mediaId: string;
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
  if (!document.edits.length) throw new Error('There are no edits to export.');
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
      ...(args.onProgress ? { onProgress: args.onProgress } : {}),
    });
    signal.throwIfAborted();
    const prepared = await writer.finalize();
    const file = await deps.readAssetFile(prepared.ref, filename);
    signal.throwIfAborted();
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
      createdAt: Date.now(),
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

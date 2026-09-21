import { configuredReviewExportPlan } from './export-configuration';
import { resolveReviewOutputProfile } from './render-settings';
import type { ReviewRenderSettings } from './media-index';
import { isSafeArchiveEntryLeafFilename } from '@sniptale/platform/data/zip-profile/entry-filenames';
import {
  assertAssetWriteAdmission,
  createSeekableAssetObjectWriter,
  readAssetFile,
  releaseAssetReadyProtection,
} from '../../composition/persistence/assets';
import type { VideoWorkspaceSnapshot } from '../../composition/persistence/review-workspaces/contracts';
import {
  replayReviewHistory,
  reviewAdvancedContentBaseline,
} from '../../features/video/review/document';
import { createReviewFragment } from '../../features/video/review/fragment';
import { buildReviewTimeMap } from '../../features/video/review/timeline';
import type { ReviewAnchor } from '../../features/video/review/types';
import type { QuickEditAdvancedState } from '../../features/video/review/advanced/types';
import { buildQuickEditAudioPlan } from '../../features/video/review/advanced/audio-plan';
import type { ReviewExportClipPlan } from './audio-render';
import { resolveOverlayComments } from '../../features/video/review/comments';
import {
  resolveQuickEditEffectiveFeatures,
  resolveQuickEditEffectiveState,
} from '../../features/video/review/advanced/effective';
import { saveRecordingsBatchSafely } from '../media-hub/store';
import { resolveReviewAssetBytes } from './asset-bytes';
import { loadVideoReviewSource } from './source';
import { writeReviewPackets, type ReviewPacketReceipt } from './packet-export';
import { writeReviewFrames } from './render-export';
import type { ReviewMediaIndex } from './media-index';
import { encodeReviewProvenance } from '../../features/video/review/provenance';
import { QuickEditExportUnavailable } from './export-unavailable';

export { QuickEditExportUnavailable };

export type { ReviewExportClipPlan } from './audio-render';

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
  writeReviewFrames,
  readProjectAsset: resolveReviewAssetBytes,
};

/** Output time of a source position inside the full edit map. */
function reviewOutputTimeAt(
  map: ReturnType<typeof buildReviewTimeMap>,
  sourceTime: number
): number {
  for (const segment of map) {
    if (segment.kind === 'cut') continue;
    if (sourceTime < segment.sourceStart) return segment.resultStart;
    if (sourceTime < segment.sourceEnd)
      return segment.resultStart + (sourceTime - segment.sourceStart) / segment.rate;
  }
  return map.at(-1)?.resultEnd ?? 0;
}

/**
 * Builds the applied external-audio mix plan and decodes every referenced asset
 * once; a missing asset blocks the export with a user-visible reason instead of
 * silently dropping the lane.
 */
async function buildReviewExportClipPlan(args: {
  advanced: QuickEditAdvancedState;
  fragmentOffset: number;
  signal: AbortSignal;
  readProjectAsset: (assetId: string) => Promise<Blob | null>;
}): Promise<ReviewExportClipPlan> {
  const effective = resolveQuickEditEffectiveState(args.advanced);
  const entries = buildQuickEditAudioPlan(effective).map((entry) => ({
    ...entry,
    timelineStart: entry.timelineStart - args.fragmentOffset,
  }));
  const buffers = new Map<string, AudioBuffer>();
  const decoder = new OfflineAudioContext(2, 1, 48_000);
  for (const assetId of new Set(entries.map((entry) => entry.assetId))) {
    const blob = await args.readProjectAsset(assetId);
    args.signal.throwIfAborted();
    if (!blob) throw new QuickEditExportUnavailable(['asset-missing']);
    try {
      buffers.set(assetId, await decoder.decodeAudioData(await blob.arrayBuffer()));
    } catch {
      throw new QuickEditExportUnavailable(['asset-missing']);
    }
  }
  return {
    entries,
    buffers,
    originalVolume: args.advanced.audio.original.volume,
    ...(args.advanced.audio.original.ranges
      ? { originalRanges: args.advanced.audio.original.ranges }
      : {}),
    originalMuted: args.advanced.audio.original.muted,
  };
}

/** Owns staging cancellation until journal publication becomes the final non-cancellable step. */
export async function exportReviewedVideo(
  args: {
    snapshot: VideoWorkspaceSnapshot;
    renderSettings?: ReviewRenderSettings;
    index: ReviewMediaIndex;
    signal: AbortSignal;
    destination?: 'gallery' | 'download';
    selection?: Extract<ReviewAnchor, { kind: 'range' }>;
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
  const document = replayReviewHistory(
    workspace.history,
    workspace.cursor,
    workspace.source,
    reviewAdvancedContentBaseline(workspace.advanced)
  );
  // Content flows through history ops; ui chrome stays with the whole-state record.
  const advanced = {
    ui: workspace.advanced.ui,
    ...document.advancedContent,
  };
  const fragment = args.selection
    ? createReviewFragment({
        selection: args.selection,
        duration: index.duration,
        boundaries: index.boundaries,
        snapToKeyframes: advanced.ui.mode !== 'advanced',
        edits: document.edits,
      })
    : null;
  if (args.selection && (!fragment || args.destination !== 'download'))
    throw new Error('A nonempty fragment requires a temporary download.');
  const edits = fragment?.edits ?? document.edits;
  const renderSettings = advanced.ui.mode === 'advanced' ? args.renderSettings : undefined;
  const outputProfile = resolveReviewOutputProfile(
    {
      ...index,
      width: index.width ?? workspace.source.width,
      height: index.height ?? workspace.source.height,
    },
    advanced,
    renderSettings
  );
  const plan = configuredReviewExportPlan({
    index,
    renderSettings,
    document: { ...document, edits },
    advanced,
    videoCopyBoundaries: index.boundaries,
  });
  if (plan.kind === 'unavailable') throw new QuickEditExportUnavailable(plan.reasons);
  const fragmentOffset = fragment
    ? reviewOutputTimeAt(buildReviewTimeMap(index.duration, document.edits), fragment.start)
    : 0;
  let exportAudio: ReviewExportClipPlan | undefined;
  if (plan.audio === 'process') {
    exportAudio = await buildReviewExportClipPlan({
      advanced,
      fragmentOffset,
      signal,
      readProjectAsset: deps.readProjectAsset,
    });
  }
  const speedAudio = !!index.audioCodec && edits.some((edit) => edit.kind === 'speed');
  if (speedAudio && !(index.outputAudioCodecs?.[outputProfile.format] ?? index.processedAudioCodec))
    throw new QuickEditExportUnavailable(['audio-encoder']);
  const audioReencoded = speedAudio || !!exportAudio;
  const createdAt = Date.now();
  const provenance = encodeReviewProvenance({
    format: 'sniptale.video-edit.v1',
    timeUnit: 'seconds',
    source: { ...workspace.source, filename: original.filename },
    revision: workspace.revision,
    exportedAt: createdAt,
    edits,
    audioReencoded,
  });
  const id = crypto.randomUUID();
  const suffix = fragment
    ? `fragment-${fragment.start.toFixed(3)}-${fragment.end.toFixed(3)}`
    : 'edited';
  const candidate = `${original.filename.replace(/\.[^.]+$/, '')}-${suffix}.${outputProfile.format}`;
  const filename = isSafeArchiveEntryLeafFilename(candidate)
    ? candidate
    : `video-edited.${outputProfile.format}`;
  await deps.assertAssetWriteAdmission(original.file.size + 1024 * 1024);
  signal.throwIfAborted();
  const writer = await deps.createSeekableAssetObjectWriter({
    mimeType: `video/${outputProfile.format}`,
  });
  let publishing = false;
  try {
    const packetReceipt =
      plan.video === 'render'
        ? await deps.writeReviewFrames({
            renderSettings,
            file: original.file,
            index,
            edits,
            advanced,
            comments: resolveQuickEditEffectiveFeatures(advanced).overlaysVisible
              ? resolveOverlayComments(document)
              : [],
            fragmentOffset,
            writer,
            signal,
            provenance,
            readProjectAsset: deps.readProjectAsset,
            ...(exportAudio ? { exportAudio } : {}),
            ...(args.onProgress ? { onProgress: args.onProgress } : {}),
          })
        : await deps.writeReviewPackets({
            file: original.file,
            index,
            edits,
            writer,
            signal,
            provenance,
            ...(exportAudio ? { exportAudio } : {}),
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
    const outputSize = plan.video === 'render' ? outputProfile : workspace.source;
    await deps.saveRecordingsBatchSafely([
      {
        id,
        filename,
        preparedAsset: prepared,
        mediaMetadata: {
          kind: 'video',
          width: outputSize.width,
          height: outputSize.height,
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

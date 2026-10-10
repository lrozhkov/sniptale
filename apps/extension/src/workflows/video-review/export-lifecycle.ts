import { openReviewAudioClipSource, type ReviewAudioClipInput } from './audio-clip-source';
import { scheduleReviewKeys } from '../../features/video/review/key-animation';
import { projectReviewTelemetry } from '../../features/video/review/telemetry';
import { scheduleReviewClicks } from '../../features/video/review/click-animation';
import { createExportTimeHistory } from '../../composition/persistence/export-time-history';
import {
  createExportTimeCalibration,
  createExportTimeProfile,
} from '../../features/video/project/export/time-calibration';
import type { VideoProjectExportTimeEstimate } from '../../features/video/project/types/export';
import { summarizeRecordingMetadata } from '../../features/media-hub/recording-metadata';
import { createOutputFilename } from '../file-naming/index';
import { configuredReviewExportPlan } from './export-configuration';
import { resolveReviewOutputProfile } from './render-settings';
import type { ReviewRenderSettings } from './media-index';
import {
  assertAssetWriteAdmission,
  createSeekableAssetObjectWriter,
  readAssetFile,
  releaseAssetReadyProtection,
} from '../../composition/persistence/assets';
import { initDB } from '../../composition/persistence/infrastructure/indexed-db/core';
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
  resolveQuickEditEffectiveState,
  resolveQuickEditEffectiveFeatures,
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
  initDB,
  readAssetFile,
  releaseAssetReadyProtection,
  saveRecordingsBatchSafely,
  loadVideoReviewSource,
  writeReviewPackets,
  writeReviewFrames,
  readProjectAsset: resolveReviewAssetBytes,
  openAudioSource: openReviewAudioClipSource,
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
 * Builds the applied external-audio mix plan and opens bounded native PCM readers
 * once per asset; a missing asset blocks the export with a user-visible reason instead of
 * silently dropping the lane.
 */
export async function buildReviewExportClipPlan(
  args: {
    advanced: QuickEditAdvancedState;
    fragmentOffset: number;
    signal: AbortSignal;
    readProjectAsset: (assetId: string) => Promise<Blob | null>;
    /** Main-output interval required by an unpublished preview; null excludes all main clips. */
    window?: { start: number; end: number } | null;
  },
  deps = { openAudioSource: openReviewAudioClipSource }
): Promise<ReviewExportClipPlan> {
  const effective = resolveQuickEditEffectiveState(args.advanced);
  const entries = buildQuickEditAudioPlan(effective)
    .map((entry) => ({
      ...entry,
      timelineStart: entry.timelineStart - args.fragmentOffset,
    }))
    .filter(
      (entry) =>
        args.window === undefined ||
        (args.window !== null &&
          entry.volume > 0 &&
          entry.timelineStart < args.window.end &&
          entry.timelineStart + entry.duration > args.window.start)
    );
  const buffers = new Map<string, ReviewAudioClipInput>();
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const source of buffers.values()) if ('dispose' in source) source.dispose();
  };
  try {
    for (const assetId of new Set(entries.map((entry) => entry.assetId))) {
      const blob = await args.readProjectAsset(assetId);
      args.signal.throwIfAborted();
      if (!blob) throw new QuickEditExportUnavailable(['asset-missing']);
      try {
        buffers.set(assetId, await deps.openAudioSource(blob, args.signal));
      } catch {
        throw new QuickEditExportUnavailable(['asset-missing']);
      }
    }
    args.signal.throwIfAborted();
    return {
      dispose,
      entries,
      buffers,
      originalVolume: args.advanced.audio.original.volume,
      ...(effective.originalAudio.ranges ? { originalRanges: effective.originalAudio.ranges } : {}),
      originalMuted: args.advanced.audio.original.muted,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}

/** Timing history observes renderer success, independently of the publication transaction. */
function createReviewExportTiming(
  outputProfile: ReturnType<typeof resolveReviewOutputProfile>,
  index: ReviewMediaIndex,
  advanced: QuickEditAdvancedState,
  renderSettings: ReviewRenderSettings | undefined,
  rendering: boolean,
  signal: AbortSignal,
  report: ((estimate: VideoProjectExportTimeEstimate | null) => void) | undefined
) {
  const calibration = createExportTimeCalibration();
  const history = createExportTimeHistory();
  const effective = resolveQuickEditEffectiveState(advanced);
  const profile = createExportTimeProfile({
    editor: 'review',
    route: rendering ? 'render' : 'copy',
    container: outputProfile.format,
    codec: rendering ? (outputProfile.codec ?? index.videoCodec) : index.videoCodec,
    width: outputProfile.width,
    height: outputProfile.height,
    fps: outputProfile.fps,
    quality: renderSettings?.quality ?? 'HIGH',
    complexity:
      1 +
      (effective.zoomRegions.some((region) => region.spotlight?.effect === 'blur') ? 1 : 0) +
      (effective.webcam ? 1 : 0),
  });
  void history
    .read(profile, signal)
    .then((ratios) => {
      if (!signal.aborted) calibration.setHistory(ratios);
    })
    .catch(() => undefined);
  return {
    onTimeEstimate: (raw: VideoProjectExportTimeEstimate | null) =>
      report?.(calibration.estimate(raw)),
    finish: () => {
      void history.record(profile, calibration.finish(), signal).catch(() => undefined);
    },
  };
}

type ReviewExportInput = {
  snapshot: VideoWorkspaceSnapshot;
  renderSettings?: ReviewRenderSettings;
  index: ReviewMediaIndex;
  signal: AbortSignal;
  destination?: 'gallery' | 'download';
  selection?: Extract<ReviewAnchor, { kind: 'range' }>;
  onProgress?(fraction: number): void;
  onTimeEstimate?(estimate: VideoProjectExportTimeEstimate | null): void;
  onPublishing?(): void;
};

async function prepareReviewExport(args: ReviewExportInput, deps: typeof persistence) {
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
  const includeBookends = !fragment;
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
    includeBookends,
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
  return {
    workspace,
    original,
    document,
    advanced,
    fragment,
    includeBookends,
    edits,
    renderSettings,
    outputProfile,
    plan,
    fragmentOffset,
  };
}

type PreparedReviewExport = Awaited<ReturnType<typeof prepareReviewExport>>;

/** Owns acquired external audio through preparation, staging and final publication. */
export async function exportReviewedVideo(args: ReviewExportInput, deps = persistence) {
  const prepared = await prepareReviewExport(args, deps);
  const { plan, advanced, fragmentOffset } = prepared;
  const { signal } = args;
  let exportAudio: ReviewExportClipPlan | undefined;
  try {
    if (plan.audio === 'process') {
      exportAudio = await buildReviewExportClipPlan(
        {
          advanced,
          fragmentOffset,
          signal,
          readProjectAsset: deps.readProjectAsset,
        },
        { openAudioSource: deps.openAudioSource }
      );
    }
    return await writePreparedReviewExport(args, prepared, exportAudio, deps);
  } finally {
    exportAudio?.dispose?.();
  }
}

async function writePreparedReviewExport(
  args: ReviewExportInput,
  prepared: PreparedReviewExport,
  exportAudio: ReviewExportClipPlan | undefined,
  deps: typeof persistence
) {
  const { signal, index } = args;
  const { workspace, original, advanced, fragment, edits, renderSettings, outputProfile, plan } =
    prepared;
  const speedAudio =
    !!index.audioCodec &&
    buildReviewTimeMap(index.duration, edits).some((part) => part.kind === 'speed');
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
  const filename = await createOutputFilename({
    category: 'recordings',
    type: 'video-review',
    title: original.filename.replace(/\.[^.]+$/, ''),
    extension: outputProfile.format,
    suffix,
  });
  await deps.assertAssetWriteAdmission(original.file.size + 1024 * 1024);
  signal.throwIfAborted();
  // Cold database admission reserves the exclusive transition gate; it must settle
  // before the export writer holds a shared transition lease through publication.
  await deps.initDB();
  const writer = await deps.createSeekableAssetObjectWriter({
    mimeType: `video/${outputProfile.format}`,
  });
  const timing = createReviewExportTiming(
    outputProfile,
    index,
    advanced,
    renderSettings,
    plan.video === 'render',
    signal,
    args.onTimeEstimate
  );
  let publishing = false;
  try {
    const packetReceipt = await renderPreparedReviewExport(
      args,
      prepared,
      { writer, timing, provenance, exportAudio },
      deps
    );
    signal.throwIfAborted();
    timing.finish();
    args.onTimeEstimate?.(null);
    const stagedAsset = await writer.finalize();
    const file = await deps.readAssetFile(stagedAsset.ref, filename);
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
        preparedAsset: stagedAsset,
        ...reviewRecordingMetadata(original),
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
  } finally {
    args.onTimeEstimate?.(null);
  }
}

async function renderPreparedReviewExport(
  args: ReviewExportInput,
  prepared: PreparedReviewExport,
  output: {
    writer: Awaited<ReturnType<typeof persistence.createSeekableAssetObjectWriter>>;
    timing: ReturnType<typeof createReviewExportTiming>;
    provenance: ReturnType<typeof encodeReviewProvenance>;
    exportAudio: ReviewExportClipPlan | undefined;
  },
  deps: typeof persistence
) {
  const { signal, index } = args;
  const {
    original,
    document,
    advanced,
    includeBookends,
    edits,
    renderSettings,
    plan,
    fragmentOffset,
  } = prepared;
  const { writer, timing, provenance, exportAudio } = output;
  return plan.video === 'render'
    ? await deps.writeReviewFrames({
        includeBookends,
        renderSettings,
        file: original.file,
        index,
        edits,
        advanced,
        ...reviewExportPresentations(original.telemetry, advanced, index.duration, document.edits),
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
        ...(args.onTimeEstimate ? { onTimeEstimate: timing.onTimeEstimate } : {}),
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
        ...(args.onTimeEstimate ? { onTimeEstimate: timing.onTimeEstimate } : {}),
      });
}

/** Join fresh source facts once before slicing; all authored animation clocks remain global. */
function reviewExportPresentations(
  telemetry: Awaited<ReturnType<typeof loadVideoReviewSource>>['telemetry'],
  advanced: QuickEditAdvancedState,
  duration: number,
  edits: Parameters<typeof buildReviewTimeMap>[1]
) {
  const markers =
    resolveQuickEditEffectiveFeatures(advanced).actionsApplied && telemetry
      ? projectReviewTelemetry(telemetry, duration).markers
      : [];
  const segments = buildReviewTimeMap(duration, edits);
  return {
    keyCues: scheduleReviewKeys(markers, advanced.keyAnimations ?? [], segments),
    clickCues: scheduleReviewClicks(markers, advanced.clickAnimations ?? [], segments),
  };
}

/** Preserve source summary when present, otherwise derive it from admitted telemetry. */
function reviewRecordingMetadata(original: Awaited<ReturnType<typeof loadVideoReviewSource>>) {
  const recordingMetadata =
    original.recordingMetadata ??
    (original.telemetry ? summarizeRecordingMetadata(original.telemetry) : undefined);
  return recordingMetadata ? { recordingMetadata } : {};
}

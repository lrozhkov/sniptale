import { ALL_FORMATS, BlobSource, Input } from 'mediabunny';
import { getMediaLibraryEntry } from '../../composition/persistence/media-library';
import { getRecording } from '../../composition/persistence/recordings';
import { getRecordingTelemetry } from '../../composition/persistence/recordings/telemetry';
import { getProjectAsset } from '../../composition/persistence/projects';
import { getProjectExport } from '../../composition/persistence/projects/index.exports';
import type { VideoWorkspaceDiagnostic } from '../../composition/persistence/review-workspaces/parser';
import {
  openVideoWorkspace,
  VideoWorkspaceError,
} from '../../composition/persistence/review-workspaces/store';
import { parseReviewSource } from '../../features/video/review/validation';
import type { MediaAssetSource } from '../../composition/persistence/media-library/contracts';
import { parseReviewProvenance } from '../../features/video/review/provenance';

type ReviewLoadStage = 'library' | 'source' | 'metadata' | 'telemetry' | 'workspace' | 'session';
type ReviewLoadReason =
  | 'unavailable'
  | 'invalid-metadata'
  | 'missing-track'
  | 'invalid'
  | 'conflict'
  | 'missing-media'
  | 'changed-source'
  | 'quota'
  | 'storage'
  | 'unknown';

/** Fixed diagnostic vocabulary; never retains source identifiers, content or raw exceptions. */
export class VideoReviewLoadError extends Error {
  constructor(
    public readonly stage: ReviewLoadStage,
    public readonly reason: ReviewLoadReason,
    public readonly diagnostic?: VideoWorkspaceDiagnostic
  ) {
    super(`video-review-open:${stage}:${reason}`);
  }
}

function loadFailureReason(error: unknown): ReviewLoadReason {
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error.code === 'invalid' ||
      error.code === 'conflict' ||
      error.code === 'missing-media' ||
      error.code === 'changed-source')
  )
    return error.code;
  if (error instanceof DOMException) {
    if (error.name === 'QuotaExceededError') return 'quota';
    if (
      ['NotFoundError', 'InvalidStateError', 'NotReadableError', 'UnknownError'].includes(
        error.name
      )
    )
      return 'storage';
  }
  return 'unknown';
}

async function readOriginal(source: MediaAssetSource) {
  if (source.kind === 'recording') return getRecording(source.recordingId);
  if (source.kind === 'project-export') return getProjectExport(source.exportId);
  if (source.kind === 'project-asset') {
    const result = await getProjectAsset(source.projectAssetId);
    return result.status === 'ready' ? result.entry : undefined;
  }
  return undefined;
}

async function inspectVideo(file: File, signal: AbortSignal) {
  signal.throwIfAborted();
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const dispose = () => input.dispose();
  signal.addEventListener('abort', dispose, { once: true });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new VideoReviewLoadError('metadata', 'missing-track');
    const declaredDuration = await input.getDurationFromMetadata();
    const [duration, width, height, mimeType] = await Promise.all([
      declaredDuration !== null && Number.isFinite(declaredDuration) && declaredDuration > 0
        ? Promise.resolve(declaredDuration)
        : input.computeDuration(),
      track.getDisplayWidth(),
      track.getDisplayHeight(),
      input.getMimeType(),
    ]);
    signal.throwIfAborted();
    const source = parseReviewSource({
      duration,
      width: Math.round(width),
      height: Math.round(height),
      mimeType,
      size: file.size,
    });
    if (!source) throw new VideoReviewLoadError('metadata', 'invalid-metadata');
    const metadata = await input.getMetadataTags();
    return { source, provenance: parseReviewProvenance(metadata.comment) };
  } finally {
    signal.removeEventListener('abort', dispose);
    input.dispose();
  }
}

/** Loads immutable original bytes and opens the session only for that same source object. */
export async function loadVideoReviewSource(aggregateId: string, signal: AbortSignal) {
  let stage: ReviewLoadStage = 'library';
  try {
    signal.throwIfAborted();
    const media = await getMediaLibraryEntry(aggregateId);
    if (!media?.mimeType.startsWith('video/'))
      throw new VideoReviewLoadError('library', 'unavailable');
    stage = 'source';
    const original = await readOriginal(media.source);
    if (!original) throw new VideoReviewLoadError('source', 'unavailable');
    stage = 'metadata';
    const { source, provenance } = await inspectVideo(original.file, signal);
    stage = 'telemetry';
    const telemetry =
      media.source.kind === 'recording' && !media.recordingMetadata
        ? await getRecordingTelemetry(media.source.recordingId)
        : undefined;
    signal.throwIfAborted();
    stage = 'workspace';
    const snapshot = await openVideoWorkspace(aggregateId, source, original.assetId);
    signal.throwIfAborted();
    return {
      file: original.file,
      filename: media.filename,
      source,
      ...(provenance ? { provenance } : {}),
      snapshot,
      telemetry: telemetry ?? null,
      ...(media.recordingMetadata ? { recordingMetadata: media.recordingMetadata } : {}),
    };
  } catch (error) {
    signal.throwIfAborted();
    throw error instanceof VideoReviewLoadError
      ? error
      : new VideoReviewLoadError(
          stage,
          loadFailureReason(error),
          error instanceof VideoWorkspaceError ? error.diagnostic : undefined
        );
  }
}

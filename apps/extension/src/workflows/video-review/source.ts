import { ALL_FORMATS, BlobSource, Input } from 'mediabunny';
import { getMediaLibraryEntry } from '../../composition/persistence/media-library';
import { getRecording } from '../../composition/persistence/recordings';
import { getRecordingTelemetry } from '../../composition/persistence/recordings/telemetry';
import { getProjectAsset } from '../../composition/persistence/projects';
import { getProjectExport } from '../../composition/persistence/projects/index.exports';
import { openVideoWorkspace } from '../../composition/persistence/review-workspaces/store';
import { parseReviewSource } from '../../features/video/review/validation';
import type { MediaAssetSource } from '../../composition/persistence/media-library/contracts';

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
    if (!track) throw new Error('Video track is unavailable.');
    const [duration, width, height, mimeType] = await Promise.all([
      input.computeDuration(),
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
    if (!source) throw new Error('Video metadata is invalid.');
    return source;
  } finally {
    signal.removeEventListener('abort', dispose);
    input.dispose();
  }
}

/** Loads immutable original bytes and opens the session only for that same source object. */
export async function loadVideoReviewSource(aggregateId: string, signal: AbortSignal) {
  signal.throwIfAborted();
  const media = await getMediaLibraryEntry(aggregateId);
  if (!media?.mimeType.startsWith('video/')) throw new Error('Video media is unavailable.');
  const original = await readOriginal(media.source);
  if (!original) throw new Error('Video source is unavailable.');
  const source = await inspectVideo(original.file, signal);
  const telemetry =
    media.source.kind === 'recording'
      ? await getRecordingTelemetry(media.source.recordingId)
      : undefined;
  signal.throwIfAborted();
  const snapshot = await openVideoWorkspace(aggregateId, source, original.assetId);
  signal.throwIfAborted();
  return {
    file: original.file,
    filename: media.filename,
    source,
    snapshot,
    telemetry: telemetry ?? null,
  };
}

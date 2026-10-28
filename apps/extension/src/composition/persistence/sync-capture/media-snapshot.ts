import { parseRecordingEntry } from '../recordings/index.guards';
import { parseRecordingTelemetryEntry } from '../recordings/telemetry.guards';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { parseAssetRef } from '../assets/guards';
import { parseMediaLibraryEntry } from '../media-library/read-guards';
import { parseProjectAssetEntry } from '../projects/read-guards';
import type { MediaLibraryEntry } from '../media-library/contracts';
import { MAX_CAPTURE_METADATA_BYTES, type CapturedMediaRows } from './contracts';

/** Reject binary, cyclic, or excessive metadata before any JSON size calculation. */
function boundedMetadata(value: unknown): boolean {
  const active = new WeakSet<object>();
  let nodes = 0;
  let characters = 0;
  function visit(item: unknown, depth: number): boolean {
    if (++nodes > 100_000 || depth > 64) return false;
    if (typeof item === 'string') {
      characters += item.length;
      return characters <= MAX_CAPTURE_METADATA_BYTES;
    }
    if (item === undefined || item === null || typeof item === 'boolean') return true;
    if (typeof item === 'number') return Number.isFinite(item);
    if (typeof item !== 'object' || active.has(item)) return false;
    if (
      !Array.isArray(item) &&
      Object.getPrototypeOf(item) !== Object.prototype &&
      Object.getPrototypeOf(item) !== null
    )
      return false;
    active.add(item);
    const valid = Object.entries(item).every(([key, child]) => {
      characters += key.length;
      return characters <= MAX_CAPTURE_METADATA_BYTES && visit(child, depth + 1);
    });
    active.delete(item);
    return valid;
  }
  return (
    visit(value, 0) &&
    new TextEncoder().encode(JSON.stringify(value)).byteLength <= MAX_CAPTURE_METADATA_BYTES
  );
}

/** Admit the original-only Library mirror that the native project asset publisher owns. */
export function parseCapturedMediaRows(value: unknown): CapturedMediaRows | null {
  if (!isRecord(value) || !boundedMetadata(value)) return null;
  const media = parseMediaLibraryEntry(value['media']);
  if ('recording' in value) {
    if ('projectAsset' in value) return null;
    const recording = parseRecordingEntry(value['recording']);
    const ref = parseAssetRef(value['ref']);
    const telemetry =
      value['telemetry'] === null ? null : parseRecordingTelemetryEntry(value['telemetry']);
    if (!media || !recording || !ref || (value['telemetry'] !== null && !telemetry)) return null;
    if (
      media.blob !== undefined ||
      media.workspaceRevision !== 0 ||
      media.imageContentState === 'edited' ||
      (media.kind !== 'recording' && media.kind !== 'video' && media.kind !== 'audio') ||
      media.source.kind !== 'recording' ||
      media.source.recordingId !== recording.id ||
      media.id !== `recording:${recording.id}` ||
      recording.assetId !== ref.assetId ||
      recording.size !== ref.size ||
      media.size !== ref.size ||
      recording.mimeType !== ref.mimeType ||
      media.mimeType !== ref.mimeType ||
      JSON.stringify(media.recordingGroup) !== JSON.stringify(recording.recordingGroup) ||
      JSON.stringify(media.recordingMetadata) !== JSON.stringify(recording.recordingMetadata) ||
      (telemetry !== null && telemetry.recordingId !== recording.id)
    )
      return null;
    return { media, recording, ref, telemetry };
  }
  if ('telemetry' in value) return null;
  const projectAsset = parseProjectAssetEntry(value['projectAsset']);
  const ref = parseAssetRef(value['ref']);
  if (!media || !projectAsset || !ref) return null;
  const rows = { media, projectAsset, ref };
  return isOriginalOnlyCapturedMedia(media) && hasExactMediaSourceBinding(rows) ? rows : null;
}

/** The bounded source revision does not describe editable workspaces or inline bytes. */
function isOriginalOnlyCapturedMedia(media: MediaLibraryEntry): boolean {
  return (
    media.blob === undefined &&
    media.recordingMetadata === undefined &&
    media.recordingGroup === undefined &&
    media.workspaceRevision === 0 &&
    media.imageContentState !== 'edited'
  );
}

/** A Library mirror, its native child, and its immutable ref must describe one source. */
function hasExactMediaSourceBinding({
  media,
  projectAsset,
  ref,
}: Extract<CapturedMediaRows, { projectAsset: unknown }>): boolean {
  return (
    projectAsset.originMediaId === undefined &&
    media.source.kind === 'project-asset' &&
    media.source.projectAssetId === projectAsset.id &&
    media.id === `project-asset:${projectAsset.id}` &&
    projectAsset.assetId === ref.assetId &&
    media.size === ref.size &&
    projectAsset.size === ref.size &&
    media.mimeType === ref.mimeType &&
    projectAsset.mimeType === ref.mimeType
  );
}

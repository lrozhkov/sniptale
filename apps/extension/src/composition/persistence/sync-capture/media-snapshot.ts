import { isBoundedCaptureMetadata } from './image-snapshot';
import { parseRecordingEntry } from '../recordings/index.guards';
import { parseRecordingTelemetryEntry } from '../recordings/telemetry.guards';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { parseAssetRef } from '../assets/guards';
import { parseMediaLibraryEntry } from '../media-library/read-guards';
import { parseProjectAssetEntry, parseProjectExportEntry } from '../projects/read-guards';
import { parseStoredWebSnapshotRecord } from '../web-snapshots/guards';
import { PAGE_PACKAGE_ARCHIVE_MIME_TYPE } from '@sniptale/runtime-contracts/page-package';
import type { MediaLibraryEntry } from '../media-library/contracts';
import { type CapturedMediaRows } from './contracts';

/** Reject binary, cyclic, or excessive metadata before any JSON size calculation. */
function boundedMetadata(value: unknown): boolean {
  return isBoundedCaptureMetadata(value, { allowBlobs: false, allowNullPrototype: true });
}

/** Admit the original-only Library mirror that the native project asset publisher owns. */
export function parseCapturedMediaRows(value: unknown): CapturedMediaRows | null {
  if (!isRecord(value) || !boundedMetadata(value)) return null;
  const media = parseMediaLibraryEntry(value['media']);
  const ref = parseAssetRef(value['ref']);
  if (!media || !ref) return null;
  if ('screenshotRef' in value && !('webSnapshot' in value)) return null;
  const sourceFields = ['projectAsset', 'projectExport', 'recording', 'webSnapshot'];
  if (sourceFields.filter((field) => field in value).length > 1) return null;
  if (media.source.kind === 'stored-asset') {
    if (
      sourceFields.some((field) => field in value) ||
      'telemetry' in value ||
      'screenshotRef' in value
    )
      return null;
    return isOriginalOnlyCapturedMedia(media) &&
      media.source.assetId === ref.assetId &&
      media.size === ref.size &&
      media.mimeType === ref.mimeType
      ? { media, ref }
      : null;
  }
  if ('projectExport' in value) {
    const projectExport = parseProjectExportEntry(value['projectExport']);
    if (
      !projectExport ||
      media.source.kind !== 'project-export' ||
      media.source.exportId !== projectExport.id ||
      media.source.projectId !== projectExport.projectId ||
      media.id !== `export:${projectExport.id}` ||
      projectExport.assetId !== ref.assetId ||
      projectExport.size !== ref.size ||
      media.size !== ref.size ||
      (projectExport.mimeType ?? 'video/webm') !== ref.mimeType ||
      media.mimeType !== ref.mimeType ||
      media.blob !== undefined ||
      media.workspaceRevision !== 0 ||
      media.imageContentState === 'edited' ||
      media.recordingGroup !== undefined ||
      JSON.stringify(media.recordingMetadata) !== JSON.stringify(projectExport.recordingMetadata) ||
      'telemetry' in value ||
      'screenshotRef' in value
    )
      return null;
    return { media, projectExport, ref };
  }
  if ('webSnapshot' in value) {
    const webSnapshot = parseStoredWebSnapshotRecord(value['webSnapshot']);
    const screenshotRef = parseAssetRef(value['screenshotRef']);
    if (
      !webSnapshot ||
      !screenshotRef ||
      !isOriginalOnlyCapturedMedia(media) ||
      media.kind !== 'web-archive' ||
      media.source.kind !== 'web-snapshot' ||
      media.id !== webSnapshot.id ||
      media.source.snapshotId !== webSnapshot.id ||
      webSnapshot.packageAssetId !== ref.assetId ||
      webSnapshot.size !== ref.size ||
      media.size !== ref.size ||
      media.mimeType !== PAGE_PACKAGE_ARCHIVE_MIME_TYPE ||
      ref.mimeType !== PAGE_PACKAGE_ARCHIVE_MIME_TYPE ||
      webSnapshot.screenshotAssetId !== screenshotRef.assetId ||
      webSnapshot.screenshotSize !== screenshotRef.size ||
      webSnapshot.screenshotMimeType !== screenshotRef.mimeType ||
      'telemetry' in value
    )
      return null;
    return { media, webSnapshot, ref, screenshotRef };
  }
  if ('recording' in value) {
    if ('projectAsset' in value) return null;
    const recording = parseRecordingEntry(value['recording']);
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

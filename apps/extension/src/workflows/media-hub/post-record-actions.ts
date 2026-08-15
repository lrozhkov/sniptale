import type { VideoPostRecordResult } from '@sniptale/runtime-contracts/video/types/types';
import {
  deleteSavedRecordingTracks,
  loadSavedRecordingTrackBlobs,
} from '../../composition/persistence/recordings/tracks';
import { getRecording } from '../../composition/persistence/recordings';
import { openGalleryPage, openVideoEditorPage } from '../../platform/navigation/extension-pages';
import { deletePersistedVideoProject } from './video-projects';

export async function downloadSavedRecordingTracks(recordingId: string): Promise<void> {
  const tracks = await loadSavedRecordingTrackBlobs(recordingId);
  for (const track of tracks) {
    downloadBlob(track.blob, track.filename);
  }
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function openLatestRecordingInGallery(primaryRecordingId: string): Promise<void> {
  const recording = await getRecording(primaryRecordingId);
  const scope = recording?.lifecycle?.storageClass;
  await openGalleryPage({
    recordingId: primaryRecordingId,
    ...(scope ? { scope } : {}),
  });
}

export async function openSavedRecordingInVideoEditor(
  result: VideoPostRecordResult
): Promise<void> {
  await openVideoEditorPage(
    result.projectId,
    result.projectId === null ? result.primaryRecordingId : null
  );
}

export async function deleteVideoPostRecordResult(result: VideoPostRecordResult): Promise<void> {
  if (result.projectId !== null) {
    await deletePersistedVideoProject(result.projectId);
  }
  await deleteSavedRecordingTracks(result.recordingId);
}

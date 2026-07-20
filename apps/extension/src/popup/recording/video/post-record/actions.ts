import {
  openGalleryPage,
  openVideoEditorPage,
} from '../../../../platform/navigation/extension-pages';
import {
  deleteSavedRecordingTracks,
  loadSavedRecordingTrackBlobs,
} from '../../../../composition/persistence/recordings/tracks';

export { deleteSavedRecordingTracks };

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

export async function openLatestRecordingInGallery(recordingId: string): Promise<void> {
  await openGalleryPage({ recordingId });
  window.close();
}

export async function openSavedRecordingInVideoEditor(recordingId: string): Promise<void> {
  await openVideoEditorPage(null, recordingId);
  window.close();
}

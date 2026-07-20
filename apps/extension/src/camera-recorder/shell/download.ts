import { loadSavedRecordingTrackBlobs } from '../../composition/persistence/recordings/tracks';

export async function downloadSavedRecordingTracks(recordingId: string): Promise<void> {
  const tracks = await loadSavedRecordingTrackBlobs(recordingId);
  for (const track of tracks) {
    const url = URL.createObjectURL(track.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = track.filename;
    link.rel = 'noopener';
    link.style.display = 'none';
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

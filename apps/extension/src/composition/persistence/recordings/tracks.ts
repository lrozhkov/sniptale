import { deleteRecording, getRecording, listRecordings } from './index';

type SavedRecordingSummary = Awaited<ReturnType<typeof listRecordings>>[number];
type SavedRecordingTrackBlob = {
  blob: Blob;
  filename: string;
  id: string;
};

function isRecordingTrackForBase(baseRecordingId: string, recordingId: string): boolean {
  return recordingId === baseRecordingId || recordingId.startsWith(`${baseRecordingId}-`);
}

async function listSavedRecordingTracks(recordingId: string): Promise<SavedRecordingSummary[]> {
  const recordings = await listRecordings();
  return recordings
    .filter((recording) => isRecordingTrackForBase(recordingId, recording.id))
    .sort((left, right) => {
      if (left.id === recordingId) {
        return -1;
      }
      if (right.id === recordingId) {
        return 1;
      }
      return left.id.localeCompare(right.id);
    });
}

export async function loadSavedRecordingTrackBlobs(
  recordingId: string
): Promise<SavedRecordingTrackBlob[]> {
  const tracks = await listSavedRecordingTracks(recordingId);
  return Promise.all(tracks.map(loadSavedRecordingTrackBlob));
}

export async function deleteSavedRecordingTracks(recordingId: string): Promise<void> {
  const tracks = await listSavedRecordingTracks(recordingId);
  await Promise.all(tracks.map((track) => deleteRecording(track.id)));
}

async function loadSavedRecordingTrackBlob(
  track: SavedRecordingSummary
): Promise<SavedRecordingTrackBlob> {
  const recording = await getRecording(track.id);
  if (!recording) {
    throw new Error(`Recording ${track.id} is not available for download`);
  }

  return {
    blob: recording.blob,
    filename: recording.filename || track.filename,
    id: track.id,
  };
}

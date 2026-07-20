import { createVideoProjectFromRecording } from '../../../features/video/project/factories/creation';

export function createPersistedLegacyRecordingProject() {
  return createVideoProjectFromRecording({
    recordingId: 'recording-1',
    filename: 'recording.webm',
    width: 1280,
    height: 720,
    duration: 5,
    mimeType: 'video/webm',
    size: 5,
    hasAudio: false,
  });
}

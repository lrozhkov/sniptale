export const WEBCAM_RECORDING_FILENAME_SUFFIX = 'webcam';
const WEBCAM_RECORDING_ID_SUFFIX = 'webcam';

export function buildWebcamRecordingId(baseRecordingId: string): string {
  return `${baseRecordingId}-${WEBCAM_RECORDING_ID_SUFFIX}`;
}

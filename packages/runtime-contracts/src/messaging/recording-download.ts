export const MAX_RECORDING_DOWNLOAD_STAGE_CHUNK_BYTES = 512 * 1024;
export const MAX_RECORDING_DOWNLOAD_STAGE_CHUNKS = 1024;
const MAX_RECORDING_DOWNLOAD_STAGE_ID_LENGTH = 128;

const RECORDING_DOWNLOAD_STAGE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export type RecordingDownloadStagePayload = {
  base64: string;
  chunkIndex: number;
  recordingSessionId: string;
  stagedRecordingId: string;
  totalBytes: number;
  totalChunks: number;
};

export type RecordingDownloadStagedRef = {
  recordingSessionId: string;
  stagedRecordingId: string;
};

export function isRecordingDownloadStageId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_RECORDING_DOWNLOAD_STAGE_ID_LENGTH &&
    RECORDING_DOWNLOAD_STAGE_ID_PATTERN.test(value)
  );
}

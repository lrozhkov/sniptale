import { TAB_CAPTURE_FILENAME_PREFIX } from '@sniptale/ui/branding';
import { createLogger } from '@sniptale/platform/observability/logger';
import { createContentRecordingSaveArtifacts } from '../../selection/recording-download/workflow';

const logger = createLogger({ namespace: 'ContentTabCaptureFallbackRecording' });

const artifacts = createContentRecordingSaveArtifacts({
  filenamePrefix: TAB_CAPTURE_FILENAME_PREFIX,
  logger,
  loggerOptions: {
    chunkCountMessage: 'Recorded chunks',
    cleanupMessage: 'Temporary recording resources cleaned',
    method: 'debug',
    preparedPayloadMessage: 'Prepared recording blob',
  },
  stopMessageFailure: 'Failed to broadcast tab-capture stop notification',
});

/**
 * Формирует имя файла записи tab capture в стабильном формате.
 */
export const buildTabCaptureFilename = artifacts.buildFilename;

export const saveTabCaptureRecording = artifacts.saveRecording;

type StreamWithStoppableTracks = {
  getTracks: () => Array<Pick<MediaStreamTrack, 'stop'>>;
};

export function cleanupTabCaptureResources(props: {
  audioContext?: AudioContext | null;
  currentStream: StreamWithStoppableTracks | null;
  micStream: StreamWithStoppableTracks | null;
}): void {
  props.currentStream?.getTracks().forEach((track) => track.stop());
  props.micStream?.getTracks().forEach((track) => track.stop());
  void props.audioContext?.close().catch(() => undefined);
}

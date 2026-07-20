import { createLogger } from '@sniptale/platform/observability/logger';
import { detachCachedPreview } from '../setup/desktop-media';
import { logOffscreenDebugError } from '../../runtime-messaging/best-effort';
import { recordingContext } from '../context';
import { cleanupActiveSidecarRecorders } from '../sidecar';

const logger = createLogger({ namespace: 'OffscreenRecordingStart' });

export function cleanupResources(): void {
  logger.debug('Cleaning up recording resources');

  detachCachedPreview();
  cleanupActiveSidecarRecorders();

  if (recordingContext.audioMixer) {
    recordingContext.audioMixer.cleanup().catch((error) => {
      logger.warn('Audio mixer cleanup failed', error);
    });
    recordingContext.audioMixer = null;
  }

  if (recordingContext.sourceStream) {
    const sourceTrackCount = recordingContext.sourceStream.getTracks().length;
    recordingContext.sourceStream.getTracks().forEach((track) => {
      track.stop();
    });
    logger.debug('Stopped source stream tracks', { count: sourceTrackCount });
    recordingContext.sourceStream = null;
  }

  if (recordingContext.videoStream) {
    const videoTrackCount = recordingContext.videoStream.getTracks().length;
    recordingContext.videoStream.getTracks().forEach((track) => {
      track.stop();
    });
    logger.debug('Stopped recording stream tracks', { count: videoTrackCount });
    recordingContext.videoStream = null;
  }

  if (recordingContext.mediaRecorder && recordingContext.mediaRecorder.state !== 'inactive') {
    try {
      recordingContext.mediaRecorder.stop();
    } catch (error) {
      logOffscreenDebugError(logger, 'Failed to stop MediaRecorder during cleanup', error);
    }
  }
  recordingContext.mediaRecorder = null;
  recordingContext.resetRecordingSession();
}

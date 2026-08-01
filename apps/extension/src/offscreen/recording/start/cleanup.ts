import { createLogger } from '@sniptale/platform/observability/logger';
import { detachCachedPreview } from '../setup/desktop-media';
import { logOffscreenDebugError } from '../../runtime-messaging/best-effort';
import { recordingContext } from '../context';
import { cleanupActiveSidecarRecorders } from '../sidecar';
import { cancelRecordingBegin } from './gate';

const logger = createLogger({ namespace: 'OffscreenRecordingStart' });

export function cleanupResources(): void {
  logger.debug('Cleaning up recording resources');
  cancelRecordingBegin();

  detachCachedPreview();
  cleanupActiveSidecarRecorders();

  const mediaRecorder = recordingContext.mediaRecorder;
  recordingContext.mediaRecorder = null;
  if (mediaRecorder) {
    mediaRecorder.ondataavailable = null;
    mediaRecorder.onerror = null;
    mediaRecorder.onstart = null;
    mediaRecorder.onstop = null;
  }

  if (recordingContext.audioMixer) {
    recordingContext.audioMixer.cleanup().catch((error) => {
      logger.warn('Audio mixer cleanup failed', error);
    });
    recordingContext.audioMixer = null;
  }

  const ownedTracks = new Set<MediaStreamTrack>();
  recordingContext.sourceStream?.getTracks().forEach((track) => ownedTracks.add(track));
  recordingContext.videoStream?.getTracks().forEach((track) => ownedTracks.add(track));
  recordingContext.sourceStream = null;
  recordingContext.videoStream = null;
  ownedTracks.forEach((track) => track.stop());
  logger.debug('Stopped recording session tracks', { count: ownedTracks.size });

  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    try {
      mediaRecorder.stop();
    } catch (error) {
      logOffscreenDebugError(logger, 'Failed to stop MediaRecorder during cleanup', error);
    }
  }
  recordingContext.resetRecordingSession();
}

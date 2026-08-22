import { createLogger } from '@sniptale/platform/observability/logger';
import { detachCachedPreview } from '../setup/desktop-media';
import { recordingContext } from '../context';
import { cleanupActiveSidecarRecorders } from '../sidecar';
import { cancelRecordingBegin } from './gate';
import { releaseVideoRecordingMediaActivityLease } from '../../media-activity/video-recording-lease';

const logger = createLogger({ namespace: 'OffscreenRecordingStart' });

export function cleanupResources(): void {
  try {
    cleanupOwnedRecordingResources();
  } finally {
    releaseVideoRecordingMediaActivityLease();
  }
}

function cleanupOwnedRecordingResources(): void {
  logger.debug('Cleaning up recording resources');
  cancelRecordingBegin();

  detachCachedPreview();
  cleanupActiveSidecarRecorders();

  const artifactSession = recordingContext.artifactSession;
  const stagingCoordinator = recordingContext.stagingCoordinator;
  void (artifactSession?.abort() ?? stagingCoordinator?.abort() ?? Promise.resolve()).catch(
    (error) => {
      logger.warn('Recording staging cleanup failed', error);
    }
  );

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

  recordingContext.resetRecordingSession();
}

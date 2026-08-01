import { createLogger } from '@sniptale/platform/observability/logger';
import { sendRuntimeMessage } from '../../../platform/runtime-messaging';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { MultiSourceSession } from './state';

const logger = createLogger({ namespace: 'OffscreenMultiSourceDuration' });
const DURATION_PUBLISH_INTERVAL_MS = 1000;

export function initializeDurationPublishing(session: MultiSourceSession): void {
  session.durationTimer = setInterval(() => {
    const duration = Math.max(0, Math.floor((Date.now() - session.startedAt) / 1000));
    void sendRuntimeMessage({
      type: VideoMessageType.RECORDING_DURATION_UPDATED,
      duration,
      recordingId: session.recordingId,
    }).catch((error) => logger.debug('Failed to publish multi-source duration', error));
  }, DURATION_PUBLISH_INTERVAL_MS);
}

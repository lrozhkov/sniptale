import { createLogger } from '@sniptale/platform/observability/logger';
import { attachOffscreenCommandCapability } from '@sniptale/platform/security/offscreen-command-capability';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import {
  updateVideoRecordingLiveMediaState,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { getBackgroundRuntimeMessaging } from '../../../../routing-contracts/runtime-messaging/services';
import { hasActiveVideoRecordingSession } from '../../session-state';
import { getVideoRecordingRuntimeState, setVideoRecordingRuntimeState } from '../session-state';

const logger = createLogger({ namespace: 'BackgroundVideoRuntimeControls' });

type RecordingSettingsResult =
  | { result: 'accepted' }
  | { result: 'no-active-recording' }
  | { error: string; result: 'failed' };

export async function updateRecordingSettings(
  settings: Partial<VideoRecordingSettings>
): Promise<RecordingSettingsResult> {
  if (!hasActiveVideoRecordingSession()) {
    logger.warn('Cannot update recording settings because no recording is active');
    return { result: 'no-active-recording' };
  }

  try {
    await getBackgroundRuntimeMessaging().sendRuntimeMessage(
      attachOffscreenCommandCapability({
        type: VideoMessageType.OFFSCREEN_UPDATE_SETTINGS,
        settings,
      })
    );
    const currentState = getVideoRecordingRuntimeState();
    setVideoRecordingRuntimeState({
      liveMedia: updateVideoRecordingLiveMediaState(currentState.liveMedia, settings),
    });
    return { result: 'accepted' };
  } catch (error) {
    logger.error('Failed to update recording settings', error);
    return { error: error instanceof Error ? error.message : String(error), result: 'failed' };
  }
}

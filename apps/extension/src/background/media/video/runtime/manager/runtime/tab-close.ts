import { createLogger } from '@sniptale/platform/observability/logger';
import { getVideoRecordingId, getVideoRecordingTabId } from '../../../session-state';
import {
  markVideoCaptureSurfaceTabClosed,
  waitForVideoCaptureSurfaceRecovery,
} from '../../../capture-surface';
import { stopRecording } from '../controls.stop';

const logger = createLogger({ namespace: 'BackgroundVideoRuntime' });

export async function handleTabClose(tabId: number): Promise<void> {
  await waitForVideoCaptureSurfaceRecovery();
  if (getVideoRecordingTabId() !== tabId) return;
  const recordingId = getVideoRecordingId();
  if (!recordingId) return;
  logger.log('Recording tab closed, stopping recording');
  markVideoCaptureSurfaceTabClosed(recordingId, tabId);
  const result = await stopRecording(false);
  if (result.result !== 'accepted') {
    throw new Error(
      result.result === 'failed'
        ? result.error
        : `Recording stop was not accepted: ${result.result}`
    );
  }
}

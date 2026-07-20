import { createLogger } from '@sniptale/platform/observability/logger';
import { getVideoRecordingTabId } from '../../../session-state';
import { stopRecording } from '../controls.stop';

const logger = createLogger({ namespace: 'BackgroundVideoRuntime' });

export function handleTabClose(tabId: number): void {
  if (getVideoRecordingTabId() === tabId) {
    logger.log('Recording tab closed, stopping recording');
    void stopRecording();
  }
}

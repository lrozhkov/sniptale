import { useCallback } from 'react';
import { createLogger } from '@sniptale/platform/observability/logger';
import type { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import {
  getPopupResponseErrorMessage,
  getPopupRuntimeErrorMessage,
} from '../../../diagnostics/runtime-errors';
import { getPauseResumeMessageType } from './message';
import type { RecordingControlCapability } from '../recording-control-capability';
import { getPopupRuntimeServices } from '../services';

const logger = createLogger({ namespace: 'PopupRuntime' });

export function usePauseResumeHandler(
  recordingControlCapability: RecordingControlCapability | null,
  recordingStatus: VideoRecordingStatus,
  setRecordingError: (error: string | null) => void
) {
  return useCallback(async () => {
    setRecordingError(null);

    try {
      if (!recordingControlCapability) {
        setRecordingError(getPopupRuntimeErrorMessage(null, 'popup.video.changePauseStateError'));
        return;
      }

      const response = await getPopupRuntimeServices().messaging.sendRuntimeMessage({
        type: getPauseResumeMessageType(recordingStatus),
        ...recordingControlCapability,
      });

      if (response?.success === false) {
        setRecordingError(
          getPopupResponseErrorMessage(response, 'popup.video.changePauseStateError')
        );
      }
    } catch (error) {
      logger.error('Failed to change pause state', error);
      setRecordingError(getPopupRuntimeErrorMessage(error, 'popup.video.changePauseStateError'));
    }
  }, [recordingControlCapability, recordingStatus, setRecordingError]);
}

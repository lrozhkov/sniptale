import { useCallback } from 'react';
import { createLogger } from '@sniptale/platform/observability/logger';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { VideoRecordingSettings } from '@sniptale/runtime-contracts/video/types/types';
import {
  getPopupResponseErrorMessage,
  getPopupRuntimeErrorMessage,
} from '../../../diagnostics/runtime-errors';
import type { RecordingControlCapability } from '../recording-control-capability';
import { getPopupRuntimeServices } from '../services';

const logger = createLogger({ namespace: 'PopupRuntime' });

export function useUpdateRecordingSettingsHandler(
  recordingControlCapability: RecordingControlCapability | null,
  setRecordingError: (error: string | null) => void
) {
  return useCallback(
    async (settings: Partial<VideoRecordingSettings>) => {
      setRecordingError(null);

      try {
        if (!recordingControlCapability) {
          const error = new Error(
            getPopupRuntimeErrorMessage(null, 'popup.video.updateRecordingError')
          );
          setRecordingError(error.message);
          throw error;
        }

        const response = await getPopupRuntimeServices().messaging.sendRuntimeMessage({
          type: VideoMessageType.UPDATE_SETTINGS,
          settings,
          ...recordingControlCapability,
        });

        if (response?.success === false) {
          const error = new Error(
            getPopupResponseErrorMessage(response, 'popup.video.updateRecordingError')
          );
          setRecordingError(error.message);
          throw error;
        }
      } catch (error) {
        logger.error('Failed to update recording settings', error);
        setRecordingError(getPopupRuntimeErrorMessage(error, 'popup.video.updateRecordingError'));
        throw error;
      }
    },
    [recordingControlCapability, setRecordingError]
  );
}

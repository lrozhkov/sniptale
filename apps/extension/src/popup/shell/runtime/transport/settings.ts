import { useCallback } from 'react';
import { createLogger } from '@sniptale/platform/observability/logger';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { VideoRecordingSettings } from '@sniptale/runtime-contracts/video/types/types';
import {
  getPopupResponseErrorMessage,
  getPopupRuntimeErrorMessage,
} from '../../../diagnostics/runtime-errors';
import type { RecordingControlCapability } from '../recording-control-capability';
import { getPopupRuntimeServices } from '../../../runtime-services';

const logger = createLogger({ namespace: 'PopupRuntime' });

export function useUpdateRecordingSettingsHandler(
  recordingControlCapability: RecordingControlCapability | null,
  setRecordingError: (error: string | null) => void
) {
  return useCallback(
    async (settings: Partial<VideoRecordingSettings>) => {
      setRecordingError(null);

      if (!recordingControlCapability) {
        const message = getPopupRuntimeErrorMessage(null, 'popup.video.updateRecordingError');
        setRecordingError(message);
        throw new Error(message);
      }

      let response: Awaited<
        ReturnType<ReturnType<typeof getPopupRuntimeServices>['messaging']['sendRuntimeMessage']>
      >;
      try {
        response = await getPopupRuntimeServices().messaging.sendRuntimeMessage({
          type: VideoMessageType.UPDATE_SETTINGS,
          settings,
          ...recordingControlCapability,
        });
      } catch (error) {
        logger.error('Failed to update recording settings', error);
        const message = getPopupRuntimeErrorMessage(error, 'popup.video.updateRecordingError');
        setRecordingError(message);
        throw new Error(message, { cause: error });
      }

      if (response?.success === false) {
        const message = getPopupResponseErrorMessage(response, 'popup.video.updateRecordingError');
        const error = new Error(message, { cause: response.error });
        logger.error('Failed to update recording settings', error);
        setRecordingError(message);
        throw error;
      }
    },
    [recordingControlCapability, setRecordingError]
  );
}

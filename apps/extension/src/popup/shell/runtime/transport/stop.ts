import { useCallback } from 'react';
import { createLogger } from '@sniptale/platform/observability/logger';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import {
  getPopupResponseErrorMessage,
  getPopupRuntimeErrorMessage,
} from '../../../diagnostics/runtime-errors';
import type { RecordingControlCapability } from '../recording-control-capability';
import { getPopupRuntimeServices } from '../services';

const logger = createLogger({ namespace: 'PopupRuntime' });

export function useStopHandler(
  recordingControlCapability: RecordingControlCapability | null,
  setRecordingError: (error: string | null) => void
) {
  return useCallback(
    async (options?: { cancelStart?: boolean; discard?: boolean }) => {
      setRecordingError(null);

      try {
        if (options?.cancelStart) {
          await sendCancelRecordingStartMessage(recordingControlCapability, setRecordingError);
          return;
        }

        if (!recordingControlCapability) {
          setRecordingError(getPopupRuntimeErrorMessage(null, 'popup.video.stopRecordingError'));
          return;
        }

        const response = await getPopupRuntimeServices().messaging.sendRuntimeMessage(
          options?.discard === undefined
            ? {
                type: VideoMessageType.STOP_RECORDING,
                ...recordingControlCapability,
              }
            : {
                type: VideoMessageType.STOP_RECORDING,
                discard: options.discard,
                ...recordingControlCapability,
              }
        );

        if (response?.success === false) {
          setRecordingError(
            getPopupResponseErrorMessage(response, 'popup.video.stopRecordingError')
          );
        }
      } catch (error) {
        logger.error('Failed to stop recording', error);
        setRecordingError(getPopupRuntimeErrorMessage(error, 'popup.video.stopRecordingError'));
      }
    },
    [recordingControlCapability, setRecordingError]
  );
}

async function sendCancelRecordingStartMessage(
  recordingControlCapability: RecordingControlCapability | null,
  setRecordingError: (error: string | null) => void
): Promise<void> {
  if (!recordingControlCapability) {
    setRecordingError(getPopupRuntimeErrorMessage(null, 'popup.video.stopRecordingError'));
    return;
  }

  const response = await getPopupRuntimeServices().messaging.sendRuntimeMessage({
    type: VideoMessageType.CANCEL_RECORDING_START,
    ...recordingControlCapability,
  });

  if (response?.success === false) {
    setRecordingError(getPopupResponseErrorMessage(response, 'popup.video.stopRecordingError'));
  }
}

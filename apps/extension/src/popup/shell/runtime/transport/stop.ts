import { useCallback } from 'react';
import { createLogger } from '@sniptale/platform/observability/logger';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import {
  getPopupResponseErrorMessage,
  getPopupRuntimeErrorMessage,
} from '../../../diagnostics/runtime-errors';
import type { RecordingControlCapability } from '../recording-control-capability';
import { getPopupRuntimeServices } from '../../../runtime-services';

const logger = createLogger({ namespace: 'PopupRuntime' });

export function useStopHandler(
  recordingControlCapability: RecordingControlCapability | null,
  setRecordingError: (error: string | null) => void,
  refreshState?: () => Promise<void>
) {
  return useCallback(
    async (options?: {
      cancelStart?: boolean;
      discard?: boolean;
    }): Promise<'accepted' | 'failed' | 'unknown'> => {
      setRecordingError(null);

      try {
        if (options?.cancelStart) {
          const result = await sendCancelRecordingStartMessage(
            recordingControlCapability,
            setRecordingError
          );
          await refreshState?.();
          return result;
        }

        if (!recordingControlCapability) {
          setRecordingError(getPopupRuntimeErrorMessage(null, 'popup.video.stopRecordingError'));
          return 'failed';
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
          await refreshState?.();
          return 'failed';
        }
        await refreshState?.();
        return response?.success === true ? 'accepted' : 'unknown';
      } catch (error) {
        logger.error('Failed to stop recording', error);
        setRecordingError(getPopupRuntimeErrorMessage(error, 'popup.video.stopRecordingError'));
        await refreshState?.();
        return 'unknown';
      }
    },
    [recordingControlCapability, setRecordingError, refreshState]
  );
}

async function sendCancelRecordingStartMessage(
  recordingControlCapability: RecordingControlCapability | null,
  setRecordingError: (error: string | null) => void
): Promise<'accepted' | 'failed' | 'unknown'> {
  if (!recordingControlCapability) {
    setRecordingError(getPopupRuntimeErrorMessage(null, 'popup.video.stopRecordingError'));
    return 'failed';
  }

  const response = await getPopupRuntimeServices().messaging.sendRuntimeMessage({
    type: VideoMessageType.CANCEL_RECORDING_START,
    ...recordingControlCapability,
  });

  if (response?.success === false) {
    setRecordingError(getPopupResponseErrorMessage(response, 'popup.video.stopRecordingError'));
    return 'failed';
  }
  return response?.success === true ? 'accepted' : 'unknown';
}

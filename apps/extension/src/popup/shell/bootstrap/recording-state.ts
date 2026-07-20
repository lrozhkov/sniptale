import {
  recordingStateHealthValues,
  type RecordingStateHealth,
  type RecordingStateResponse,
} from '../../../contracts/messaging/contracts/response-types';
import { translate } from '../../../platform/i18n';
import type { RuntimeMessagingTransport } from '../../../platform/runtime-messaging';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { VideoRecordingRuntimeState } from '@sniptale/runtime-contracts/video/types/types';
import { IDLE_RECORDING_STATE } from '../navigation/actions';

const recordingHealthSet = new Set<RecordingStateHealth>(recordingStateHealthValues);

type PopupBootstrapRecordingState = {
  recordingState: VideoRecordingRuntimeState;
  recordingStatusError: string | null;
};

function loadRecordingStateResponse(transport: RuntimeMessagingTransport) {
  return transport.sendRuntimeMessage({
    type: VideoMessageType.GET_RECORDING_STATE,
  }) as Promise<RecordingStateResponse>;
}

export async function loadRecordingStateResponseWithFallback(
  transport: RuntimeMessagingTransport,
  onFailure: (error: unknown) => void
) {
  try {
    return await loadRecordingStateResponse(transport);
  } catch (error) {
    onFailure(error);
    return {
      error: translate('background.runtime.recordingUnavailable'),
      recordingHealth: 'failed',
      success: false,
    } satisfies RecordingStateResponse;
  }
}

function resolveRecordingResponseHealth(
  recordingResponse: RecordingStateResponse
): RecordingStateHealth {
  if (
    recordingResponse.recordingHealth &&
    recordingHealthSet.has(recordingResponse.recordingHealth)
  ) {
    return recordingResponse.recordingHealth;
  }

  return recordingResponse.success && recordingResponse.state ? 'healthy' : 'failed';
}

function resolveRecordingStatusError(recordingResponse: RecordingStateResponse): string {
  return (
    recordingResponse.error ??
    recordingResponse.state?.error ??
    translate('background.runtime.recordingUnavailable')
  );
}

export function resolvePopupBootstrapRecordingState(
  recordingResponse: RecordingStateResponse
): PopupBootstrapRecordingState {
  const recordingHealth = resolveRecordingResponseHealth(recordingResponse);

  if (recordingHealth === 'healthy' && recordingResponse.success && recordingResponse.state) {
    return {
      recordingState: recordingResponse.state,
      recordingStatusError: null,
    };
  }

  if (recordingHealth === 'degraded' && recordingResponse.state) {
    return {
      recordingState: recordingResponse.state,
      recordingStatusError: resolveRecordingStatusError(recordingResponse),
    };
  }

  return {
    recordingState: IDLE_RECORDING_STATE,
    recordingStatusError: resolveRecordingStatusError(recordingResponse),
  };
}

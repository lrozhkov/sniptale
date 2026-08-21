import { useCallback, useEffect, useRef, useState } from 'react';
import { browserRuntime } from '@sniptale/platform/browser/runtime';
import { parseRuntimeRequestMessage } from '../../contracts/messaging/parsers/boundary';
import { translate } from '../../platform/i18n';
import type { RuntimeMessagingTransport } from '../../platform/runtime-messaging';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import {
  VideoRecordingStatus,
  type VideoPostRecordResult,
  type VideoRecordingRuntimeState,
} from '@sniptale/runtime-contracts/video/types/types';
import { getResponseError } from './format';
import type { CameraRecorderRouteState, ControlCapability } from './types';
import type { RuntimeVideoSessionResponseByType } from '../../contracts/messaging/video/session-responses';
import { resolveVideoRecordingFailureMessage } from '../../features/video/recording-failure';

type CameraRegistrationResponse =
  RuntimeVideoSessionResponseByType[typeof VideoMessageType.REGISTER_CAMERA_RECORDER_CONTROL];

const IDLE_STATE: VideoRecordingRuntimeState = {
  status: VideoRecordingStatus.IDLE,
  duration: 0,
  countdownEndsAt: null,
  captureMode: null,
  captureSource: null,
  viewportPresetId: null,
  liveMedia: null,
  error: null,
};

export function useRecordingState(
  routeState: CameraRecorderRouteState,
  messaging: RuntimeMessagingTransport
) {
  const [state, setState] = useState(IDLE_STATE);
  const [capability, setCapability] = useState<ControlCapability | null>(null);
  const [postRecordResult, setPostRecordResult] = useState<VideoPostRecordResult | null>(null);
  const [registrationError, setRegistrationError] = useState<string | null>(null);
  const refreshGenerationRef = useRef(0);
  const authorizedRecordingIdRef = useRef<string | null>(routeState.recordingId);

  const refreshState = useCallback(async () => {
    const generation = ++refreshGenerationRef.current;
    const response = await messaging.sendRuntimeMessage({
      type: VideoMessageType.GET_RECORDING_STATE,
    });
    if (generation !== refreshGenerationRef.current) {
      return;
    }
    if (response?.success !== true) {
      throw new Error(getResponseError(response, translate('common.states.error')));
    }
    if (response?.state) {
      setState(response.state);
    }
    setCapability(
      typeof response?.controlToken === 'string' && typeof response.recordingId === 'string'
        ? { controlToken: response.controlToken, recordingId: response.recordingId }
        : null
    );
    const availableResult = resolveAuthorizedPostRecordResult(
      response?.postRecordResult,
      authorizedRecordingIdRef.current
    );
    if (generation === refreshGenerationRef.current) {
      setPostRecordResult(availableResult);
    }
  }, [messaging]);

  const acknowledgePostRecord = useCallback(async () => {
    if (!postRecordResult) {
      return;
    }
    refreshGenerationRef.current += 1;
    const response = await messaging.sendRuntimeMessage({
      type: VideoMessageType.ACKNOWLEDGE_POST_RECORD_RESULT,
      recordingId: postRecordResult.recordingId,
    });
    if (response?.success !== true) {
      throw new Error(getResponseError(response, translate('common.states.error')));
    }
    if (response.result !== 'acknowledged' && response.result !== 'stale') {
      throw new Error(translate('common.states.error'));
    }
    setPostRecordResult(null);
  }, [messaging, postRecordResult]);

  useEffect(
    () =>
      registerCameraRecorder(
        routeState,
        messaging,
        setCapability,
        setRegistrationError,
        (recordingId) => {
          authorizedRecordingIdRef.current = recordingId;
        },
        refreshState
      ),
    [messaging, refreshState, routeState]
  );
  useEffect(
    () => subscribeToRecordingUpdates(setState, refreshState, setRegistrationError),
    [refreshState]
  );

  return {
    acknowledgePostRecord,
    capability,
    postRecordResult,
    refreshState,
    registrationError,
    state,
  };
}

function resolveAuthorizedPostRecordResult(
  result: VideoPostRecordResult | undefined,
  authorizedRecordingId: string | null
): VideoPostRecordResult | null {
  if (!authorizedRecordingId || result?.recordingId !== authorizedRecordingId) {
    return null;
  }
  return result;
}

function registerCameraRecorder(
  routeState: CameraRecorderRouteState,
  messaging: RuntimeMessagingTransport,
  setCapability: (capability: ControlCapability) => void,
  setRegistrationError: (error: string | null) => void,
  setAuthorizedRecordingId: (recordingId: string) => void,
  refreshState: () => Promise<void>
): () => void {
  let disposed = false;

  async function registerAndLoadState(): Promise<void> {
    try {
      const registration = await messaging.sendRuntimeMessage(
        createCameraRegistrationMessage(routeState)
      );
      if (!disposed) {
        const recordingId = applyCameraRegistrationResponse({
          registration,
          setCapability,
          setRegistrationError,
        });
        if (!recordingId) {
          return;
        }
        setAuthorizedRecordingId(recordingId);
      }
      if (!disposed) {
        await refreshState();
      }
    } catch (error) {
      if (!disposed) {
        setRegistrationError(
          error instanceof Error ? error.message : translate('common.states.error')
        );
      }
    }
  }

  if (!routeState.routeError) {
    void registerAndLoadState();
  }
  return () => {
    disposed = true;
  };
}

function createCameraRegistrationMessage(routeState: CameraRecorderRouteState) {
  return routeState.registrationToken && routeState.recordingId
    ? {
        type: VideoMessageType.REGISTER_CAMERA_RECORDER_CONTROL,
        cameraRegistrationToken: routeState.registrationToken,
        recordingId: routeState.recordingId,
      }
    : { type: VideoMessageType.REGISTER_CAMERA_RECORDER_CONTROL };
}

function applyCameraRegistrationResponse(args: {
  registration: CameraRegistrationResponse;
  setCapability: (capability: ControlCapability) => void;
  setRegistrationError: (error: string | null) => void;
}): string | null {
  if (args.registration.success === false) {
    args.setRegistrationError(
      getResponseError(args.registration, translate('common.states.error'))
    );
    return null;
  }
  if (
    !args.registration.recordingId ||
    (args.registration.result !== 'active' && args.registration.result !== 'post-record-only')
  ) {
    args.setRegistrationError(translate('common.states.error'));
    return null;
  }
  args.setRegistrationError(null);
  if (args.registration.result === 'active' && args.registration.controlToken) {
    args.setCapability({
      controlToken: args.registration.controlToken,
      recordingId: args.registration.recordingId,
    });
  }
  return args.registration.recordingId;
}

function subscribeToRecordingUpdates(
  setState: (state: VideoRecordingRuntimeState) => void,
  refreshState: () => Promise<void>,
  setRegistrationError: (error: string | null) => void
): () => void {
  return browserRuntime.subscribeToMessages((message: unknown) => {
    const parsed = parseCameraRecorderRuntimeMessage(message);
    if (!parsed) return;
    if (parsed.type === VideoMessageType.RECORDING_START_FAILED) {
      setRegistrationError(
        resolveVideoRecordingFailureMessage(parsed.error) ??
          translate('background.runtime.recordingError')
      );
      return;
    }
    setState(parsed.state);
    if (parsed.state.status === VideoRecordingStatus.IDLE) {
      void refreshState().catch((error) => {
        setRegistrationError(
          error instanceof Error ? error.message : translate('common.states.error')
        );
      });
    }
  });
}

function parseCameraRecorderRuntimeMessage(message: unknown):
  | {
      type: typeof VideoMessageType.RECORDING_STATE_SYNC;
      state: VideoRecordingRuntimeState;
    }
  | {
      error?: string;
      type: typeof VideoMessageType.RECORDING_START_FAILED;
    }
  | null {
  try {
    const parsed = parseRuntimeRequestMessage(message);
    if (
      parsed.type === VideoMessageType.RECORDING_STATE_SYNC ||
      parsed.type === VideoMessageType.RECORDING_START_FAILED
    ) {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

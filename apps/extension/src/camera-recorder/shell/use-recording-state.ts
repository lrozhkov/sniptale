import { useCallback, useEffect, useState } from 'react';
import { browserRuntime } from '@sniptale/platform/browser/runtime';
import { parseRuntimeRequestMessage } from '../../contracts/messaging/parsers/boundary';
import { getRecording } from '../../composition/persistence/recordings/index';
import { translate } from '../../platform/i18n';
import type { RuntimeMessagingTransport } from '../../platform/runtime-messaging';
import { resolveExtensionDocumentSenderUrl } from '../../platform/runtime-messaging/document-sender';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import {
  VideoRecordingStatus,
  type VideoRecordingRuntimeState,
} from '@sniptale/runtime-contracts/video/types/types';
import { getResponseError } from './format';
import type { CameraRecorderRouteState, ControlCapability } from './types';

const IDLE_STATE: VideoRecordingRuntimeState = {
  status: VideoRecordingStatus.IDLE,
  duration: 0,
  countdownEndsAt: null,
  captureMode: null,
  captureSource: null,
  viewportPreset: null,
  liveMedia: null,
  error: null,
};

export function useRecordingState(
  routeState: CameraRecorderRouteState,
  messaging: RuntimeMessagingTransport
) {
  const [state, setState] = useState(IDLE_STATE);
  const [capability, setCapability] = useState<ControlCapability | null>(null);
  const [postRecordRecordingId, setPostRecordRecordingId] = useState<string | null>(null);
  const [registrationError, setRegistrationError] = useState<string | null>(null);

  const refreshState = useCallback(async () => {
    const response = await messaging.sendRuntimeMessage({
      type: VideoMessageType.GET_RECORDING_STATE,
    });
    if (response?.state) {
      setState(response.state);
    }
    if (typeof response?.controlToken === 'string' && typeof response.recordingId === 'string') {
      setCapability({ controlToken: response.controlToken, recordingId: response.recordingId });
    }
  }, [messaging]);

  useEffect(
    () =>
      registerCameraRecorder(
        routeState,
        messaging,
        setCapability,
        setRegistrationError,
        refreshState
      ),
    [messaging, refreshState, routeState]
  );
  useEffect(
    () => subscribeToRecordingUpdates(routeState.recordingId, setState, setPostRecordRecordingId),
    [routeState.recordingId]
  );

  return { capability, postRecordRecordingId, refreshState, registrationError, state };
}

function registerCameraRecorder(
  routeState: CameraRecorderRouteState,
  messaging: RuntimeMessagingTransport,
  setCapability: (capability: ControlCapability) => void,
  setRegistrationError: (error: string | null) => void,
  refreshState: () => Promise<void>
): () => void {
  let disposed = false;

  async function registerAndLoadState(): Promise<void> {
    try {
      const registration = await messaging.sendRuntimeMessage({
        type: VideoMessageType.REGISTER_CAMERA_RECORDER_CONTROL,
        cameraLaunchToken: routeState.launchToken,
        recordingId: routeState.recordingId,
      });
      if (registration.success === false) {
        setRegistrationError(getResponseError(registration, translate('common.states.error')));
        return;
      }
      if (!disposed && registration.controlToken && registration.recordingId) {
        setCapability({
          controlToken: registration.controlToken,
          recordingId: registration.recordingId,
        });
      }
    } catch (error) {
      if (!disposed) {
        setRegistrationError(
          error instanceof Error ? error.message : translate('common.states.error')
        );
      }
    }
    if (!disposed) {
      await refreshState();
    }
  }

  if (!routeState.routeError) {
    void registerAndLoadState();
  }
  return () => {
    disposed = true;
  };
}

function subscribeToRecordingUpdates(
  expectedRecordingId: string,
  setState: (state: VideoRecordingRuntimeState) => void,
  setPostRecordRecordingId: (recordingId: string) => void
): () => void {
  let disposed = false;
  const unsubscribe = browserRuntime.subscribeToMessages((message: unknown, sender) => {
    const parsed = parseCameraRecorderRuntimeMessage(message);
    if (!parsed) {
      return;
    }
    if (parsed.type === VideoMessageType.RECORDING_STATE_SYNC) {
      setState(parsed.state);
      return;
    }
    if (isTrustedSavedRecordingEvent(parsed, sender, expectedRecordingId)) {
      void verifyAndShowSavedRecording({
        disposed: () => disposed,
        expectedRecordingId,
        recordingId: parsed.recordingId,
        setPostRecordRecordingId,
      });
    }
  });
  return () => {
    disposed = true;
    unsubscribe();
  };
}

function parseCameraRecorderRuntimeMessage(
  message: unknown
):
  | { type: typeof VideoMessageType.RECORDING_STATE_SYNC; state: VideoRecordingRuntimeState }
  | { type: typeof VideoMessageType.VIDEO_SAVED_TO_IDB; recordingId: string }
  | null {
  try {
    const parsed = parseRuntimeRequestMessage(message);
    if (parsed.type === VideoMessageType.RECORDING_STATE_SYNC) {
      return parsed;
    }
    if (parsed.type === VideoMessageType.VIDEO_SAVED_TO_IDB) {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

function isTrustedSavedRecordingEvent(
  parsed: { type: typeof VideoMessageType.VIDEO_SAVED_TO_IDB; recordingId: string },
  sender: chrome.runtime.MessageSender | undefined,
  expectedRecordingId: string
): boolean {
  return parsed.recordingId === expectedRecordingId && isTrustedOffscreenSender(sender);
}

async function verifyAndShowSavedRecording({
  disposed,
  expectedRecordingId,
  recordingId,
  setPostRecordRecordingId,
}: {
  disposed: () => boolean;
  expectedRecordingId: string;
  recordingId: string;
  setPostRecordRecordingId: (recordingId: string) => void;
}): Promise<void> {
  if (recordingId !== expectedRecordingId || !(await getRecording(recordingId)) || disposed()) {
    return;
  }

  setPostRecordRecordingId(recordingId);
}

function isTrustedOffscreenSender(sender: chrome.runtime.MessageSender | undefined): boolean {
  return (
    resolveExtensionDocumentSenderUrl(sender, 'apps/extension/src/offscreen/offscreen.html') !==
    null
  );
}

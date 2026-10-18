import { useCallback, useMemo, useState } from 'react';
import { CommandPressScope } from '@sniptale/ui/control-language/press';
import type { RuntimeMessagingTransport } from '../../platform/runtime-messaging';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import { CameraControlBar } from './control-bar';
import { getResponseError } from './format';
import { createUserFacingErrorMessage } from '../../platform/i18n/user-facing-error';
import { CameraLivePanel } from './live-panel';
import { CameraPostRecordPanel } from './post-record-panel';
import { consumeCameraRecorderRouteState } from './route-state';
import type { RuntimeControlMessage } from './types';
import { useDeviceLabels } from './use-device-labels';
import { useRecordingState } from './use-recording-state';

export function CameraRecorderApp({ messaging }: { messaging: RuntimeMessagingTransport }) {
  const routeState = useMemo(consumeCameraRecorderRouteState, []);
  const {
    acknowledgePostRecord,
    capability,
    postRecordResult,
    refreshState,
    registrationError,
    state,
  } = useRecordingState(routeState, messaging);
  const [error, setError] = useState<string | null>(routeState.routeError);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);

  const runControl = useCallback(
    async (message: RuntimeControlMessage, onAccepted?: () => void) => {
      try {
        setError(null);
        const response = await messaging.sendRuntimeMessage(message);
        if (response?.success === false) {
          setError(getResponseError(response, 'common.errors.actionFailed'));
          return;
        }
        await refreshState();
        onAccepted?.();
      } catch (controlError) {
        setError(
          createUserFacingErrorMessage({
            cause: controlError,
            detail: 'browserCommunication',
            summaryKey: 'common.errors.actionFailed',
          })
        );
      }
    },
    [messaging, refreshState]
  );

  if (postRecordResult) {
    return (
      <CommandPressScope value={true}>
        <CameraPostRecordPanel result={postRecordResult} onAcknowledge={acknowledgePostRecord} />
      </CommandPressScope>
    );
  }

  return (
    <CommandPressScope value={true}>
      <CameraRecorderLiveScreen
        capability={capability}
        cancelConfirmOpen={cancelConfirmOpen}
        error={error}
        onCancel={() => setCancelConfirmOpen(true)}
        onContinue={() => setCancelConfirmOpen(false)}
        onControl={runControl}
        recordingId={routeState.recordingId ?? ''}
        registrationError={registrationError}
        state={state}
      />
    </CommandPressScope>
  );
}

function CameraRecorderLiveScreen(props: {
  capability: ReturnType<typeof useRecordingState>['capability'];
  cancelConfirmOpen: boolean;
  error: string | null;
  onCancel: () => void;
  onContinue: () => void;
  onControl: (message: RuntimeControlMessage, onAccepted?: () => void) => Promise<void>;
  recordingId: string;
  registrationError: string | null;
  state: ReturnType<typeof useRecordingState>['state'];
}) {
  const deviceLabels = useDeviceLabels();

  return (
    <main
      data-ui="camera-recorder.live"
      className={[
        'sniptale-compact-workspace overflow-y-auto',
        'flex h-screen flex-col bg-[var(--sniptale-color-surface-canvas)]',
        'p-3 text-[var(--sniptale-color-text-primary)]',
      ].join(' ')}
    >
      <CameraLivePanel
        capability={props.capability}
        deviceLabels={deviceLabels}
        error={props.error}
        onControl={(message) => void props.onControl(message)}
        registrationError={props.registrationError}
        state={props.state}
      />
      <CameraControlBar
        capability={props.capability}
        cancelConfirmOpen={props.cancelConfirmOpen}
        isPaused={props.state.status === VideoRecordingStatus.PAUSED}
        onCancel={props.onCancel}
        onContinue={() => {
          props.onContinue();
          handleContinue(props.capability, props.onControl, props.recordingId);
        }}
        onDelete={() => handleDelete(props.capability, props.onControl, props.recordingId)}
        onPauseResume={() =>
          handlePauseResume(props.capability, props.onControl, props.state.status)
        }
        onStop={() => handleStop(props.capability, props.onControl, props.recordingId)}
      />
    </main>
  );
}

function handleContinue(
  capability: { controlToken: string; recordingId: string } | null,
  runControl: (message: RuntimeControlMessage) => Promise<void>,
  fallbackRecordingId: string
): void {
  void runControl({
    type: VideoMessageType.RESUME_RECORDING,
    controlToken: capability?.controlToken ?? '',
    recordingId: capability?.recordingId ?? fallbackRecordingId,
  });
}

function handleDelete(
  capability: { controlToken: string; recordingId: string } | null,
  runControl: (message: RuntimeControlMessage, onAccepted?: () => void) => Promise<void>,
  fallbackRecordingId: string
): void {
  void runControl(
    {
      type: VideoMessageType.STOP_RECORDING,
      controlToken: capability?.controlToken ?? '',
      discard: true,
      recordingId: capability?.recordingId ?? fallbackRecordingId,
    },
    () => window.close()
  );
}

function handlePauseResume(
  capability: { controlToken: string; recordingId: string } | null,
  runControl: (message: RuntimeControlMessage) => Promise<void>,
  status: VideoRecordingStatus
): void {
  if (!capability) {
    return;
  }
  void runControl({
    type:
      status === VideoRecordingStatus.PAUSED
        ? VideoMessageType.RESUME_RECORDING
        : VideoMessageType.PAUSE_RECORDING,
    controlToken: capability.controlToken,
    recordingId: capability.recordingId,
  });
}

function handleStop(
  capability: { controlToken: string; recordingId: string } | null,
  runControl: (message: RuntimeControlMessage) => Promise<void>,
  fallbackRecordingId: string
): void {
  void runControl({
    type: VideoMessageType.STOP_RECORDING,
    controlToken: capability?.controlToken ?? '',
    recordingId: capability?.recordingId ?? fallbackRecordingId,
  });
}

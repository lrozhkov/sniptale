import { useCallback, useMemo, useState } from 'react';
import { translate } from '../../platform/i18n';
import type { RuntimeMessagingTransport } from '../../platform/runtime-messaging';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import { CameraControlBar } from './control-bar';
import { getResponseError } from './format';
import { CameraLivePanel } from './live-panel';
import { CameraPostRecordPanel } from './post-record-panel';
import { consumeCameraRecorderRouteState } from './route-state';
import type { RuntimeControlMessage } from './types';
import { useDeviceLabels } from './use-device-labels';
import { useRecordingState } from './use-recording-state';

export function CameraRecorderApp({ messaging }: { messaging: RuntimeMessagingTransport }) {
  const routeState = useMemo(consumeCameraRecorderRouteState, []);
  const { capability, postRecordRecordingId, refreshState, registrationError, state } =
    useRecordingState(routeState, messaging);
  const [error, setError] = useState<string | null>(routeState.routeError);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);

  const runControl = useCallback(
    async (message: RuntimeControlMessage) => {
      try {
        setError(null);
        const response = await messaging.sendRuntimeMessage(message);
        if (response?.success === false) {
          setError(getResponseError(response, translate('common.states.error')));
          return;
        }
        await refreshState();
      } catch (controlError) {
        setError(
          controlError instanceof Error ? controlError.message : translate('common.states.error')
        );
      }
    },
    [messaging, refreshState]
  );

  if (postRecordRecordingId) {
    return <CameraPostRecordPanel recordingId={postRecordRecordingId} />;
  }

  return (
    <CameraRecorderLiveScreen
      capability={capability}
      cancelConfirmOpen={cancelConfirmOpen}
      error={error}
      onCancel={() => setCancelConfirmOpen(true)}
      onControl={runControl}
      recordingId={routeState.recordingId}
      registrationError={registrationError}
      state={state}
    />
  );
}

function CameraRecorderLiveScreen(props: {
  capability: ReturnType<typeof useRecordingState>['capability'];
  cancelConfirmOpen: boolean;
  error: string | null;
  onCancel: () => void;
  onControl: (message: RuntimeControlMessage) => Promise<void>;
  recordingId: string;
  registrationError: string | null;
  state: ReturnType<typeof useRecordingState>['state'];
}) {
  const deviceLabels = useDeviceLabels();

  return (
    <main
      className={[
        'flex h-screen flex-col bg-[var(--sniptale-color-surface-canvas)]',
        'p-5 text-[var(--sniptale-color-text-primary)]',
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
        onContinue={() => handleContinue(props.capability, props.onControl, props.recordingId)}
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
  runControl: (message: RuntimeControlMessage) => Promise<void>,
  fallbackRecordingId: string
): void {
  void runControl({
    type: VideoMessageType.STOP_RECORDING,
    controlToken: capability?.controlToken ?? '',
    discard: true,
    recordingId: capability?.recordingId ?? fallbackRecordingId,
  }).then(() => window.close());
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

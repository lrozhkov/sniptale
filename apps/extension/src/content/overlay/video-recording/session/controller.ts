import { useCallback, useEffect, useMemo, useReducer, useRef, type MutableRefObject } from 'react';
import type { VideoRecordingSurfaceSnapshot } from '@sniptale/runtime-contracts/video/types/messages.surface';
import {
  INITIAL_VIDEO_RECORDING_TOOLBAR_STATE,
  reduceVideoRecordingToolbarState,
  type VideoRecordingToolbarInteraction,
  type VideoRecordingToolbarState,
} from './state';
import {
  activateVideoRecordingSurface,
  releaseVideoRecordingSurface,
  sendVideoRecordingSurfaceCommand,
  startSavedTabVideoRecording,
  subscribeToVideoRecordingSurfaceSnapshots,
  subscribeToVideoRecordingRuntimeState,
  type SurfaceIdentity,
  requestVideoRecordingCameraAnswer,
  closeVideoRecordingCameraPeer,
} from '../transport/client';
import { createRecordingDrawingOwner } from '../../toolbar/video-recording/drawing-session';
import type { EmbeddedCameraGeometry } from '../camera/geometry';
import { projectVideoRecordingSurfaceSnapshot } from './snapshot-projection';

type ApplySurfaceSnapshot = (snapshot: VideoRecordingSurfaceSnapshot, token?: string) => void;

function useRecordingDrawingLifecycle(
  drawingOwner: ReturnType<typeof createRecordingDrawingOwner>,
  phase: VideoRecordingToolbarState['phase']
) {
  useEffect(() => () => drawingOwner.dispose(), [drawingOwner]);
  useEffect(() => {
    drawingOwner.setClockRunning(phase === 'recording');
    if (phase === 'idle' || phase === 'error') drawingOwner.controller.session.clear();
  }, [drawingOwner, phase]);
}

function useSurfaceRuntimeSubscriptions(
  identityRef: MutableRefObject<SurfaceIdentity | null>,
  toolbarRequestedRef: MutableRefObject<boolean>,
  state: VideoRecordingToolbarState,
  drawingOwner: ReturnType<typeof createRecordingDrawingOwner>,
  applySnapshot: ApplySurfaceSnapshot
) {
  useEffect(
    () =>
      subscribeToVideoRecordingSurfaceSnapshots((snapshot, token) =>
        applySnapshot(snapshot, token)
      ),
    [applySnapshot]
  );
  useEffect(
    () =>
      subscribeToVideoRecordingRuntimeState((runtimeState) => {
        const identity = identityRef.current;
        if (!identity) return;
        applySnapshot({
          autoFadeDelay: drawingOwner.getAutoHideDelay(),
          capabilityEpoch: identity.capabilityEpoch,
          cursorSpotlightEnabled: state.spotlightEnabled,
          documentGeneration: identity.documentGeneration,
          duration: runtimeState.duration,
          entry: 'manual',
          errorCode: runtimeState.error,
          lifecycle: 'ready',
          microphoneEnabled: runtimeState.liveMedia?.microphoneEnabled ?? state.microphoneEnabled,
          microphoneDeviceId:
            runtimeState.liveMedia?.microphoneDeviceId ?? state.microphoneDeviceId,
          peerGeneration: identity.peerGeneration,
          recordingId: identity.recordingId,
          status: runtimeState.status,
          surfaceSessionId: identity.surfaceSessionId,
          toolbarRequested: toolbarRequestedRef.current,
          webcamEnabled: runtimeState.liveMedia?.webcamEnabled ?? state.cameraEnabled,
          webcamDeviceId: runtimeState.liveMedia?.webcamDeviceId ?? state.webcamDeviceId,
          webcamPresentation: state.webcamPresentation,
        });
      }),
    [
      applySnapshot,
      drawingOwner,
      identityRef,
      state.microphoneDeviceId,
      state.microphoneEnabled,
      state.spotlightEnabled,
      state.cameraEnabled,
      state.webcamDeviceId,
      state.webcamPresentation,
      toolbarRequestedRef,
    ]
  );
}

function useCameraPeerActions(identityRef: MutableRefObject<SurfaceIdentity | null>) {
  const cameraOffer = useCallback(
    (sdp: string) => {
      const identity = identityRef.current;
      if (!identity) throw new Error('Camera surface is unavailable');
      return requestVideoRecordingCameraAnswer(identity, sdp);
    },
    [identityRef]
  );
  const cameraPeerClose = useCallback(() => {
    const identity = identityRef.current;
    return identity ? closeVideoRecordingCameraPeer(identity) : undefined;
  }, [identityRef]);
  return { cameraOffer, cameraPeerClose };
}

function useSurfaceActivation(applySnapshot: ApplySurfaceSnapshot) {
  return useCallback(
    async (event?: Event) => {
      if (!event) return false;
      const response = await activateVideoRecordingSurface(event);
      if (!response?.success || !response.snapshot) return false;
      applySnapshot(response.snapshot, response.surfaceToken);
      return true;
    },
    [applySnapshot]
  );
}

export function useVideoRecordingSurfaceController(args: {
  onModeRequested: (enabled: boolean) => void;
  onToolbarRequested: () => void;
}) {
  const { onModeRequested, onToolbarRequested } = args;
  const [state, dispatch] = useReducer(
    reduceVideoRecordingToolbarState,
    INITIAL_VIDEO_RECORDING_TOOLBAR_STATE
  );
  const identityRef = useRef<SurfaceIdentity | null>(null);
  const toolbarRequestedRef = useRef(false);
  const drawingOwner = useMemo(() => createRecordingDrawingOwner(), []);

  useRecordingDrawingLifecycle(drawingOwner, state.phase);

  const applySnapshot = useCallback(
    (snapshot: VideoRecordingSurfaceSnapshot, token?: string) => {
      const current = identityRef.current;
      identityRef.current = {
        capabilityEpoch: snapshot.capabilityEpoch,
        documentGeneration: snapshot.documentGeneration,
        peerGeneration: snapshot.peerGeneration,
        recordingId: snapshot.recordingId,
        surfaceSessionId: snapshot.surfaceSessionId,
        surfaceToken: token ?? current?.surfaceToken ?? '',
      };
      toolbarRequestedRef.current = snapshot.toolbarRequested;
      drawingOwner.setAutoHideDelay(snapshot.autoFadeDelay);
      projectVideoRecordingSurfaceSnapshot(snapshot, identityRef.current.surfaceToken, dispatch);
      if (snapshot.toolbarRequested) {
        onModeRequested(true);
        onToolbarRequested();
      }
    },
    [drawingOwner, onModeRequested, onToolbarRequested]
  );

  useSurfaceRuntimeSubscriptions(
    identityRef,
    toolbarRequestedRef,
    state,
    drawingOwner,
    applySnapshot
  );

  const activate = useSurfaceActivation(applySnapshot);

  const deactivate = useCallback(async () => {
    const identity = identityRef.current;
    if (!identity || state.phase !== 'idle') return false;
    await releaseVideoRecordingSurface(identity);
    identityRef.current = null;
    dispatch({ type: 'idle' });
    onModeRequested(false);
    return true;
  }, [onModeRequested, state.phase]);

  const start = useCallback(
    async (event?: Event) => {
      if (!event) return;
      dispatch({ type: 'starting' });
      const response = await startSavedTabVideoRecording(event);
      if (!response?.snapshot) {
        dispatch({ type: 'failed', error: response?.error ?? 'Recording failed' });
        return;
      }
      applySnapshot(response.snapshot, response.surfaceToken);
    },
    [applySnapshot]
  );

  const command = useCallback(
    async (value: Parameters<typeof sendVideoRecordingSurfaceCommand>[1]) => {
      const identity = identityRef.current;
      if (!identity) throw new Error('Recording surface is unavailable');
      const response = (await sendVideoRecordingSurfaceCommand(identity, value)) as {
        snapshot?: VideoRecordingSurfaceSnapshot;
      };
      if (response.snapshot) applySnapshot(response.snapshot);
    },
    [applySnapshot]
  );
  const setMediaEnabled = useCallback(
    async (kind: 'camera' | 'microphone', enabled: boolean) => {
      const previous = kind === 'camera' ? state.cameraEnabled : state.microphoneEnabled;
      dispatch({ type: kind, enabled });
      try {
        await command({
          kind: kind === 'camera' ? 'set-webcam-enabled' : 'set-microphone-enabled',
          enabled,
        });
      } catch (error) {
        dispatch({ type: kind, enabled: previous });
        throw error;
      }
    },
    [command, state.cameraEnabled, state.microphoneEnabled]
  );
  const { cameraOffer, cameraPeerClose } = useCameraPeerActions(identityRef);

  return useMemo(
    () => ({
      drawingOwner,
      state,
      onActivate: activate,
      onCancelStart: () => command({ kind: 'cancel-start' }),
      onCameraEnabledChange: (enabled: boolean) => setMediaEnabled('camera', enabled),
      onCameraOffer: cameraOffer,
      onCameraPeerClose: cameraPeerClose,
      onCameraDeviceChange: (deviceId: string) =>
        command({ kind: 'select-webcam-device', deviceId }),
      onCameraGeometryChange: (appearance: EmbeddedCameraGeometry) =>
        command({ kind: 'update-embedded-camera', appearance }),
      onDeactivate: deactivate,
      onInteractionChange: (interaction: VideoRecordingToolbarInteraction) =>
        dispatch({ type: 'interaction', interaction }),
      onMicrophoneEnabledChange: (enabled: boolean) => setMediaEnabled('microphone', enabled),
      onMicrophoneDeviceChange: (deviceId: string) =>
        command({ kind: 'select-microphone-device', deviceId }),
      onPause: () => command({ kind: 'pause' }),
      onResume: () => command({ kind: 'resume' }),
      onSpotlightEnabledChange: (enabled: boolean) => dispatch({ type: 'spotlight', enabled }),
      onStart: start,
      onStop: () => command({ kind: 'stop' }),
    }),
    [
      activate,
      cameraOffer,
      cameraPeerClose,
      command,
      deactivate,
      drawingOwner,
      setMediaEnabled,
      start,
      state,
    ]
  );
}

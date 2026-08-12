import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type Dispatch,
  type MutableRefObject,
} from 'react';
import type {
  VideoRecordingMediaDevice,
  VideoRecordingSurfaceSnapshot,
} from '@sniptale/runtime-contracts/video/types/messages.surface';
import {
  INITIAL_VIDEO_RECORDING_TOOLBAR_STATE,
  reduceVideoRecordingToolbarState,
  type VideoRecordingToolbarInteraction,
  type VideoRecordingToolbarState,
  type VideoRecordingToolbarStateAction,
} from './state';
import { pickEmbeddedCameraGeometry } from '../camera/geometry';
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
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import { createLogger } from '@sniptale/platform/observability/logger';
import { translate } from '../../../../platform/i18n';

const logger = createLogger({ namespace: 'VideoRecordingSurfaceController' });

function recordingActionError(): string {
  return translate('content.toolbar.videoRecordingActionFailed');
}

type ApplySurfaceSnapshot = (snapshot: VideoRecordingSurfaceSnapshot, token?: string) => void;

function parseMediaDevicesResult(value: unknown): VideoRecordingMediaDevice[] {
  if (typeof value !== 'object' || value === null || !('mediaDevices' in value)) {
    throw new Error('Recording media device list is unavailable');
  }
  const devices: unknown = Reflect.get(value, 'mediaDevices');
  const isDevice = (device: unknown): device is VideoRecordingMediaDevice =>
    typeof device === 'object' &&
    device !== null &&
    typeof Reflect.get(device, 'deviceId') === 'string' &&
    (Reflect.get(device, 'kind') === 'audioinput' ||
      Reflect.get(device, 'kind') === 'videoinput') &&
    typeof Reflect.get(device, 'label') === 'string';
  if (!Array.isArray(devices) || !devices.every(isDevice)) {
    throw new Error('Recording media device list is invalid');
  }
  return devices;
}

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
  stateRef: MutableRefObject<VideoRecordingToolbarState>,
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
        const state = stateRef.current;
        const recordingId =
          runtimeState.status === VideoRecordingStatus.IDLE ? null : identity.recordingId;
        applySnapshot({
          autoFadeDelay: drawingOwner.getAutoHideDelay(),
          capabilityEpoch: identity.capabilityEpoch,
          cursorSpotlightEnabled: state.spotlightEnabled,
          cursorDimmingEnabled: state.spotlightDimmingEnabled,
          cursorClickAnimationEnabled: state.spotlightClickAnimationEnabled,
          documentGeneration: identity.documentGeneration,
          duration: runtimeState.duration,
          entry: 'manual',
          errorCode: runtimeState.error,
          lifecycle: 'ready',
          microphoneEnabled: runtimeState.liveMedia?.microphoneEnabled ?? state.microphoneEnabled,
          microphoneDeviceId:
            runtimeState.liveMedia?.microphoneDeviceId ?? state.microphoneDeviceId,
          peerGeneration: identity.peerGeneration,
          recordingId,
          status: runtimeState.status,
          surfaceSessionId: identity.surfaceSessionId,
          toolbarRequested: toolbarRequestedRef.current,
          webcamEnabled: runtimeState.liveMedia?.webcamEnabled ?? state.cameraEnabled,
          webcamDeviceId: runtimeState.liveMedia?.webcamDeviceId ?? state.webcamDeviceId,
          webcamPresentation: state.webcamPresentation,
        });
      }),
    [applySnapshot, drawingOwner, identityRef, stateRef, toolbarRequestedRef]
  );
}

function useCameraPeerActions(
  identityRef: MutableRefObject<SurfaceIdentity | null>,
  peerGeneration: number,
  surfaceSessionId: string | null
) {
  const currentPeerIdentity = (() => {
    const identity = identityRef.current;
    if (
      !identity ||
      identity.peerGeneration !== peerGeneration ||
      identity.surfaceSessionId !== surfaceSessionId
    ) {
      return null;
    }
    return { ...identity };
  })();
  const peerKey = surfaceSessionId === null ? null : `${surfaceSessionId}:${peerGeneration}`;
  const peerBindingRef = useRef({ key: peerKey, value: { current: currentPeerIdentity } });
  if (peerBindingRef.current.key !== peerKey) {
    // A new binding intentionally gives the old effect cleanup an immutable
    // identity holder while same-peer token/epoch rotations refresh in place.
    peerBindingRef.current = { key: peerKey, value: { current: currentPeerIdentity } };
  }
  const peerBinding = peerBindingRef.current.value;
  peerBinding.current = currentPeerIdentity;
  const cameraOffer = useCallback(
    (sdp: string) => {
      const identity = peerBinding.current;
      if (!identity) throw new Error('Camera surface is unavailable');
      return requestVideoRecordingCameraAnswer(identity, sdp);
    },
    [peerBinding]
  );
  const cameraPeerClose = useCallback(() => {
    const identity = peerBinding.current;
    return identity ? closeVideoRecordingCameraPeer(identity) : undefined;
  }, [peerBinding]);
  return { cameraOffer, cameraPeerClose };
}

function useSurfaceActivation(applySnapshot: ApplySurfaceSnapshot) {
  return useCallback(
    async (event?: Event) => {
      if (!event) return false;
      const response = await activateVideoRecordingSurface(event);
      if (!response?.success || !response.snapshot) {
        throw new Error(response?.error ?? 'Video recording toolbar is unavailable');
      }
      applySnapshot(response.snapshot, response.surfaceToken);
      return true;
    },
    [applySnapshot]
  );
}

function useSurfaceStart(
  applySnapshot: ApplySurfaceSnapshot,
  dispatch: Dispatch<VideoRecordingToolbarStateAction>
) {
  const startAttemptRef = useRef(0);
  const start = useCallback(
    async (event?: Event) => {
      if (!event) return;
      const attempt = ++startAttemptRef.current;
      dispatch({ type: 'starting' });
      try {
        const response = await startSavedTabVideoRecording(event);
        if (attempt !== startAttemptRef.current) return;
        if (!response?.success || !response.snapshot) {
          logger.warn('Saved tab recording start was rejected', response?.error);
          dispatch({ type: 'failed', error: recordingActionError() });
          return;
        }
        applySnapshot(response.snapshot, response.surfaceToken);
      } catch (error) {
        if (attempt !== startAttemptRef.current) return;
        logger.warn('Saved tab recording start failed', error);
        dispatch({ type: 'failed', error: recordingActionError() });
      }
    },
    [applySnapshot, dispatch]
  );
  return { start, startAttemptRef };
}

function useSurfaceCommandController(args: {
  applySnapshot: ApplySurfaceSnapshot;
  dispatch: Dispatch<VideoRecordingToolbarStateAction>;
  identityRef: MutableRefObject<SurfaceIdentity | null>;
  stateRef: MutableRefObject<VideoRecordingToolbarState>;
}) {
  const commandWithResult = useCallback(
    async (value: Parameters<typeof sendVideoRecordingSurfaceCommand>[1], projectError = true) => {
      const identity = args.identityRef.current;
      if (!identity) throw new Error('Recording surface is unavailable');
      args.dispatch({ type: 'clear-error' });
      try {
        const response = (await sendVideoRecordingSurfaceCommand(identity, value)) as {
          result?: unknown;
          snapshot?: VideoRecordingSurfaceSnapshot;
        };
        if (!response.snapshot) throw new Error('Recording command returned no surface state');
        args.applySnapshot(response.snapshot);
        return response.result;
      } catch (error) {
        logger.warn('Video recording surface command failed', error);
        const errorMessage = recordingActionError();
        if (projectError) {
          args.dispatch(
            value.kind === 'cancel-start' && args.stateRef.current.phase === 'starting'
              ? { type: 'failed', error: errorMessage }
              : { type: 'command-failed', error: errorMessage }
          );
        }
        throw error;
      }
    },
    [args]
  );
  const command = useCallback(
    async (
      value: Parameters<typeof sendVideoRecordingSurfaceCommand>[1],
      projectError = true
    ): Promise<void> => {
      await commandWithResult(value, projectError);
    },
    [commandWithResult]
  );
  const setMediaEnabled = useCallback(
    async (kind: 'camera' | 'microphone', enabled: boolean) => {
      const state = args.stateRef.current;
      const previous = kind === 'camera' ? state.cameraEnabled : state.microphoneEnabled;
      if (kind === 'microphone') args.dispatch({ type: kind, enabled });
      try {
        await command(
          {
            kind: kind === 'camera' ? 'set-webcam-enabled' : 'set-microphone-enabled',
            enabled,
          },
          false
        );
      } catch (error) {
        if (kind === 'microphone') args.dispatch({ type: kind, enabled: previous });
        throw error;
      }
    },
    [args, command]
  );
  return { command, commandWithResult, setMediaEnabled };
}

type VideoRecordingSurfaceControllerArgs = {
  onModeRequested: (enabled: boolean) => void;
  onToolbarRequested: () => void;
};

function useVideoRecordingSurfaceState(args: VideoRecordingSurfaceControllerArgs) {
  const modeRequestedRef = useRef(args.onModeRequested);
  const toolbarRequestedCallbackRef = useRef(args.onToolbarRequested);
  modeRequestedRef.current = args.onModeRequested;
  toolbarRequestedCallbackRef.current = args.onToolbarRequested;
  const [state, dispatch] = useReducer(
    reduceVideoRecordingToolbarState,
    INITIAL_VIDEO_RECORDING_TOOLBAR_STATE
  );
  const identityRef = useRef<SurfaceIdentity | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const toolbarRequestedRef = useRef(false);
  const releasedSurfaceSessionIdRef = useRef<string | null>(null);
  const drawingOwner = useMemo(() => createRecordingDrawingOwner(), []);

  useRecordingDrawingLifecycle(drawingOwner, state.phase);

  const applySnapshot = useCallback(
    (snapshot: VideoRecordingSurfaceSnapshot, token?: string) => {
      if (snapshot.surfaceSessionId === releasedSurfaceSessionIdRef.current) return;
      const current = identityRef.current;
      const shouldOpenToolbar = snapshot.toolbarRequested && !toolbarRequestedRef.current;
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
      if (shouldOpenToolbar || (snapshot.toolbarRequested && current === null)) {
        modeRequestedRef.current(true);
        toolbarRequestedCallbackRef.current();
      }
    },
    [drawingOwner]
  );

  return {
    applySnapshot,
    dispatch,
    drawingOwner,
    identityRef,
    modeRequestedRef,
    state,
    stateRef,
    toolbarRequestedRef,
    releasedSurfaceSessionIdRef,
  };
}

function useVideoRecordingSurfaceDeactivation(args: {
  command: (
    value: Parameters<typeof sendVideoRecordingSurfaceCommand>[1],
    projectError?: boolean
  ) => Promise<void>;
  dispatch: Dispatch<VideoRecordingToolbarStateAction>;
  identityRef: MutableRefObject<SurfaceIdentity | null>;
  modeRequestedRef: MutableRefObject<(enabled: boolean) => void>;
  phase: VideoRecordingToolbarState['phase'];
  cameraEnabled: boolean;
  releasedSurfaceSessionIdRef: MutableRefObject<string | null>;
}) {
  return useCallback(async () => {
    const identity = args.identityRef.current;
    if (!identity) {
      args.modeRequestedRef.current(false);
      return true;
    }
    if (args.phase === 'idle' || args.phase === 'error') {
      args.dispatch({ type: 'camera', enabled: false });
      args.releasedSurfaceSessionIdRef.current = identity.surfaceSessionId;
      try {
        await releaseVideoRecordingSurface(identity);
      } catch (error) {
        args.releasedSurfaceSessionIdRef.current = null;
        args.dispatch({ type: 'camera', enabled: args.cameraEnabled });
        throw error;
      }
      args.identityRef.current = null;
      args.dispatch({ type: 'idle' });
    } else {
      await args.command({ kind: 'set-toolbar-requested', enabled: false });
    }
    args.modeRequestedRef.current(false);
    return true;
  }, [args]);
}

type SurfaceControllerProjectionArgs = {
  activate: ReturnType<typeof useSurfaceActivation>;
  cameraOffer: ReturnType<typeof useCameraPeerActions>['cameraOffer'];
  cameraPeerClose: ReturnType<typeof useCameraPeerActions>['cameraPeerClose'];
  command: ReturnType<typeof useSurfaceCommandController>['command'];
  deactivate: () => Promise<boolean>;
  dispatch: Dispatch<VideoRecordingToolbarStateAction>;
  drawingOwner: ReturnType<typeof createRecordingDrawingOwner>;
  loadMediaDevices: (
    deviceKind: 'audioinput' | 'videoinput'
  ) => Promise<VideoRecordingMediaDevice[]>;
  setMediaEnabled: ReturnType<typeof useSurfaceCommandController>['setMediaEnabled'];
  start: ReturnType<typeof useSurfaceStart>['start'];
  startAttemptRef: MutableRefObject<number>;
  state: VideoRecordingToolbarState;
};

function createSurfaceMediaActions(args: SurfaceControllerProjectionArgs) {
  return {
    onCameraEnabledChange: (enabled: boolean) => args.setMediaEnabled('camera', enabled),
    onCameraOffer: args.cameraOffer,
    onCameraPeerClose: args.cameraPeerClose,
    onCameraDeviceChange: (deviceId: string) =>
      args.command({ kind: 'select-webcam-device', deviceId }, false),
    onCameraGeometryChange: (appearance: EmbeddedCameraGeometry) =>
      args.command({
        kind: 'update-embedded-camera',
        appearance: pickEmbeddedCameraGeometry(appearance),
      }),
    onMicrophoneEnabledChange: (enabled: boolean) => args.setMediaEnabled('microphone', enabled),
    onMicrophoneDeviceChange: (deviceId: string) =>
      args.command({ kind: 'select-microphone-device', deviceId }, false),
    onLoadMediaDevices: args.loadMediaDevices,
  };
}

function createSurfaceDrawingActions(args: SurfaceControllerProjectionArgs) {
  return {
    onAutoHideDelayChange: (
      delay: Parameters<SurfaceControllerProjectionArgs['drawingOwner']['setAutoHideDelay']>[0]
    ) => args.command({ kind: 'set-auto-fade-delay', delay }),
    onInteractionChange: (interaction: VideoRecordingToolbarInteraction) =>
      args.dispatch({ type: 'interaction', interaction }),
    onSpotlightEnabledChange: (enabled: boolean) => args.dispatch({ type: 'spotlight', enabled }),
    onSpotlightSettingsChange: (settings: {
      cursorHaloEnabled: boolean;
      cursorDimmingEnabled: boolean;
      clickAnimationEnabled: boolean;
    }) => args.command({ kind: 'set-spotlight-settings', ...settings }),
  };
}

function useSurfaceControllerProjection(args: SurfaceControllerProjectionArgs) {
  return useMemo(
    () => ({
      drawingOwner: args.drawingOwner,
      state: args.state,
      ...createSurfaceDrawingActions(args),
      ...createSurfaceMediaActions(args),
      onActivate: args.activate,
      onCancelStart: async () => {
        await args.command({ kind: 'cancel-start' });
        args.startAttemptRef.current += 1;
      },
      onDeactivate: args.deactivate,
      onPause: () => args.command({ kind: 'pause' }),
      onResume: () => args.command({ kind: 'resume' }),
      onStart: args.start,
      onStop: () => args.command({ kind: 'stop' }),
    }),
    [args]
  );
}

export function useVideoRecordingSurfaceController(args: VideoRecordingSurfaceControllerArgs) {
  const {
    applySnapshot,
    dispatch,
    drawingOwner,
    identityRef,
    modeRequestedRef,
    state,
    stateRef,
    toolbarRequestedRef,
    releasedSurfaceSessionIdRef,
  } = useVideoRecordingSurfaceState(args);

  useSurfaceRuntimeSubscriptions(
    identityRef,
    toolbarRequestedRef,
    stateRef,
    drawingOwner,
    applySnapshot
  );

  const activate = useSurfaceActivation(applySnapshot);
  const { start, startAttemptRef } = useSurfaceStart(applySnapshot, dispatch);

  const commandControllerArgs = useMemo(
    () => ({ applySnapshot, dispatch, identityRef, stateRef }),
    [applySnapshot, dispatch, identityRef, stateRef]
  );
  const { command, commandWithResult, setMediaEnabled } =
    useSurfaceCommandController(commandControllerArgs);
  const loadMediaDevices = useCallback(
    async (deviceKind: 'audioinput' | 'videoinput'): Promise<VideoRecordingMediaDevice[]> => {
      const result = await commandWithResult({ kind: 'list-media-devices', deviceKind }, false);
      return parseMediaDevicesResult(result);
    },
    [commandWithResult]
  );
  const deactivationArgs = useMemo(
    () => ({
      command,
      cameraEnabled: state.cameraEnabled,
      dispatch,
      identityRef,
      modeRequestedRef,
      phase: state.phase,
      releasedSurfaceSessionIdRef,
    }),
    [
      command,
      dispatch,
      identityRef,
      modeRequestedRef,
      releasedSurfaceSessionIdRef,
      state.cameraEnabled,
      state.phase,
    ]
  );
  const deactivate = useVideoRecordingSurfaceDeactivation(deactivationArgs);
  const { cameraOffer, cameraPeerClose } = useCameraPeerActions(
    identityRef,
    state.peerGeneration,
    state.surfaceSessionId
  );
  const projectionArgs = useMemo(
    () => ({
      activate,
      cameraOffer,
      cameraPeerClose,
      command,
      deactivate,
      dispatch,
      drawingOwner,
      loadMediaDevices,
      setMediaEnabled,
      start,
      startAttemptRef,
      state,
    }),
    [
      activate,
      cameraOffer,
      cameraPeerClose,
      command,
      deactivate,
      dispatch,
      drawingOwner,
      loadMediaDevices,
      setMediaEnabled,
      start,
      startAttemptRef,
      state,
    ]
  );
  return useSurfaceControllerProjection(projectionArgs);
}

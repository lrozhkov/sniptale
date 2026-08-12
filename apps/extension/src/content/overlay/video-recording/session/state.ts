import type { WebcamPresentationSettings } from '@sniptale/runtime-contracts/video/types/types';
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import type { VideoRecordingSurfaceSnapshot } from '@sniptale/runtime-contracts/video/types/messages.surface';

type VideoRecordingToolbarPhase =
  | 'idle'
  | 'starting'
  | 'recording'
  | 'paused'
  | 'stopping'
  | 'error';

export type VideoRecordingToolbarInteraction = 'navigation' | 'drawing';

export type VideoRecordingToolbarState = {
  cameraEnabled: boolean;
  cameraPreviewSuppressed: boolean;
  durationSeconds: number;
  error: string | null;
  interaction: VideoRecordingToolbarInteraction;
  microphoneEnabled: boolean;
  microphoneDeviceId: string | null;
  peerGeneration: number;
  phase: VideoRecordingToolbarPhase;
  recordingId: string | null;
  spotlightEnabled: boolean;
  spotlightDimmingEnabled: boolean;
  spotlightClickAnimationEnabled: boolean;
  surfaceSessionId: string | null;
  surfaceToken: string | null;
  webcamPresentation: WebcamPresentationSettings;
  webcamDeviceId: string | null;
};

export const INITIAL_VIDEO_RECORDING_TOOLBAR_STATE: VideoRecordingToolbarState = {
  cameraEnabled: false,
  cameraPreviewSuppressed: false,
  durationSeconds: 0,
  error: null,
  interaction: 'navigation',
  microphoneEnabled: false,
  microphoneDeviceId: null,
  peerGeneration: 0,
  phase: 'idle',
  recordingId: null,
  spotlightEnabled: false,
  spotlightDimmingEnabled: false,
  spotlightClickAnimationEnabled: false,
  surfaceSessionId: null,
  surfaceToken: null,
  webcamPresentation: DEFAULT_VIDEO_SETTINGS.webcamPresentation!,
  webcamDeviceId: null,
};

export type VideoRecordingToolbarStateAction =
  | {
      type: 'snapshot';
      snapshot: VideoRecordingSurfaceSnapshot;
      surfaceToken: string;
      error: string | null;
    }
  | {
      type: 'surface-ready';
      peerGeneration: number;
      surfaceSessionId: string;
      surfaceToken: string;
    }
  | { type: 'starting'; recordingId?: string }
  | { type: 'recording'; recordingId: string }
  | { type: 'paused' }
  | { type: 'resumed' }
  | { type: 'stopping' }
  | { type: 'idle' }
  | { type: 'failed'; error: string }
  | { type: 'clear-error' }
  | { type: 'command-failed'; error: string }
  | { type: 'duration'; durationSeconds: number }
  | { type: 'interaction'; interaction: VideoRecordingToolbarInteraction }
  | { type: 'spotlight'; enabled: boolean }
  | {
      type: 'spotlight-settings';
      cursorHaloEnabled: boolean;
      cursorDimmingEnabled: boolean;
      clickAnimationEnabled: boolean;
    }
  | { type: 'microphone'; enabled: boolean }
  | { type: 'microphone-device'; deviceId: string | null }
  | { type: 'camera'; enabled: boolean }
  | { type: 'camera-configured'; enabled: boolean }
  | { type: 'camera-device'; deviceId: string | null }
  | { type: 'camera-presentation'; presentation: WebcamPresentationSettings };

function isPreviewClosingPhase(phase: VideoRecordingToolbarPhase): boolean {
  return (
    phase === 'starting' || phase === 'recording' || phase === 'paused' || phase === 'stopping'
  );
}

function projectSurfaceSnapshot(
  state: VideoRecordingToolbarState,
  action: Extract<VideoRecordingToolbarStateAction, { type: 'snapshot' }>
): VideoRecordingToolbarState {
  const snapshot = action.snapshot;
  const sameSession = state.surfaceSessionId === snapshot.surfaceSessionId;
  const next = {
    ...state,
    cameraEnabled: snapshot.webcamEnabled,
    cameraPreviewSuppressed: sameSession ? state.cameraPreviewSuppressed : false,
    durationSeconds: Math.max(0, snapshot.duration),
    error: action.error,
    microphoneEnabled: snapshot.microphoneEnabled,
    microphoneDeviceId: snapshot.microphoneDeviceId,
    peerGeneration: snapshot.peerGeneration,
    spotlightEnabled: snapshot.cursorSpotlightEnabled,
    spotlightDimmingEnabled: snapshot.cursorDimmingEnabled ?? false,
    spotlightClickAnimationEnabled: snapshot.cursorClickAnimationEnabled ?? false,
    surfaceSessionId: snapshot.surfaceSessionId,
    surfaceToken: action.surfaceToken,
    webcamDeviceId: snapshot.webcamDeviceId,
    webcamPresentation: snapshot.webcamPresentation,
  };
  switch (snapshot.status) {
    case VideoRecordingStatus.IDLE:
      return {
        ...next,
        cameraPreviewSuppressed:
          sameSession && isPreviewClosingPhase(state.phase) ? true : next.cameraPreviewSuppressed,
        durationSeconds: 0,
        interaction: 'navigation',
        phase: snapshot.errorCode ? 'error' : 'idle',
        recordingId: null,
      };
    case VideoRecordingStatus.PREPARING:
    case VideoRecordingStatus.COUNTDOWN:
      return {
        ...next,
        cameraPreviewSuppressed: false,
        interaction: 'navigation',
        phase: 'starting',
        recordingId: snapshot.recordingId ?? state.recordingId,
      };
    case VideoRecordingStatus.RECORDING:
      return snapshot.recordingId
        ? { ...next, phase: 'recording', recordingId: snapshot.recordingId }
        : next;
    case VideoRecordingStatus.PAUSED:
      return snapshot.recordingId
        ? { ...next, phase: 'paused', recordingId: snapshot.recordingId }
        : next;
    case VideoRecordingStatus.STOPPING:
      return state.recordingId || snapshot.recordingId
        ? {
            ...next,
            phase: 'stopping',
            recordingId: snapshot.recordingId ?? state.recordingId,
          }
        : next;
  }
}

export function reduceVideoRecordingToolbarState(
  state: VideoRecordingToolbarState,
  action: VideoRecordingToolbarStateAction
): VideoRecordingToolbarState {
  switch (action.type) {
    case 'snapshot':
      return projectSurfaceSnapshot(state, action);
    case 'surface-ready':
      return {
        ...state,
        cameraPreviewSuppressed:
          state.surfaceSessionId === action.surfaceSessionId
            ? state.cameraPreviewSuppressed
            : false,
        peerGeneration: action.peerGeneration,
        surfaceSessionId: action.surfaceSessionId,
        surfaceToken: action.surfaceToken,
      };
    case 'starting':
      return {
        ...state,
        cameraPreviewSuppressed: false,
        error: null,
        interaction: 'navigation',
        phase: 'starting',
        recordingId: action.recordingId ?? state.recordingId,
      };
    case 'recording':
      return { ...state, error: null, phase: 'recording', recordingId: action.recordingId };
    case 'paused':
      return state.phase === 'recording' ? { ...state, phase: 'paused' } : state;
    case 'resumed':
      return state.phase === 'paused' ? { ...state, phase: 'recording' } : state;
    case 'stopping':
      return state.recordingId ? { ...state, phase: 'stopping' } : state;
    case 'idle':
      return {
        ...state,
        cameraPreviewSuppressed: isPreviewClosingPhase(state.phase)
          ? true
          : state.cameraPreviewSuppressed,
        durationSeconds: 0,
        error: null,
        interaction: 'navigation',
        phase: 'idle',
        recordingId: null,
      };
    case 'failed':
      return { ...state, error: action.error, phase: 'error', recordingId: null };
    case 'clear-error':
      return state.error === null ? state : { ...state, error: null };
    case 'command-failed':
      return { ...state, error: action.error };
    case 'duration':
      return {
        ...state,
        durationSeconds: Math.max(state.durationSeconds, action.durationSeconds),
      };
    case 'interaction':
      return { ...state, interaction: action.interaction };
    case 'spotlight':
      return { ...state, spotlightEnabled: action.enabled };
    case 'spotlight-settings':
      return {
        ...state,
        spotlightEnabled: action.cursorHaloEnabled,
        spotlightDimmingEnabled: action.cursorDimmingEnabled,
        spotlightClickAnimationEnabled: action.clickAnimationEnabled,
      };
    case 'microphone':
      return { ...state, microphoneEnabled: action.enabled };
    case 'microphone-device':
      return { ...state, microphoneDeviceId: action.deviceId };
    case 'camera':
      return {
        ...state,
        cameraEnabled: action.enabled,
        cameraPreviewSuppressed: action.enabled ? false : state.cameraPreviewSuppressed,
      };
    case 'camera-configured':
      return { ...state, cameraEnabled: action.enabled };
    case 'camera-device':
      return { ...state, webcamDeviceId: action.deviceId };
    case 'camera-presentation':
      return { ...state, webcamPresentation: action.presentation };
  }
}

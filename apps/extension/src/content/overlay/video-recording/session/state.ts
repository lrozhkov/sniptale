import type { WebcamPresentationSettings } from '@sniptale/runtime-contracts/video/types/types';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';

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
  durationSeconds: number;
  error: string | null;
  interaction: VideoRecordingToolbarInteraction;
  microphoneEnabled: boolean;
  microphoneDeviceId: string | null;
  phase: VideoRecordingToolbarPhase;
  recordingId: string | null;
  spotlightEnabled: boolean;
  surfaceSessionId: string | null;
  surfaceToken: string | null;
  webcamPresentation: WebcamPresentationSettings;
  webcamDeviceId: string | null;
};

export const INITIAL_VIDEO_RECORDING_TOOLBAR_STATE: VideoRecordingToolbarState = {
  cameraEnabled: false,
  durationSeconds: 0,
  error: null,
  interaction: 'navigation',
  microphoneEnabled: false,
  microphoneDeviceId: null,
  phase: 'idle',
  recordingId: null,
  spotlightEnabled: false,
  surfaceSessionId: null,
  surfaceToken: null,
  webcamPresentation: DEFAULT_VIDEO_SETTINGS.webcamPresentation!,
  webcamDeviceId: null,
};

export type VideoRecordingToolbarStateAction =
  | { type: 'surface-ready'; surfaceSessionId: string; surfaceToken: string }
  | { type: 'starting'; recordingId?: string }
  | { type: 'recording'; recordingId: string }
  | { type: 'paused' }
  | { type: 'resumed' }
  | { type: 'stopping' }
  | { type: 'idle' }
  | { type: 'failed'; error: string }
  | { type: 'duration'; durationSeconds: number }
  | { type: 'interaction'; interaction: VideoRecordingToolbarInteraction }
  | { type: 'spotlight'; enabled: boolean }
  | { type: 'microphone'; enabled: boolean }
  | { type: 'microphone-device'; deviceId: string | null }
  | { type: 'camera'; enabled: boolean }
  | { type: 'camera-device'; deviceId: string | null }
  | { type: 'camera-presentation'; presentation: WebcamPresentationSettings };

export function reduceVideoRecordingToolbarState(
  state: VideoRecordingToolbarState,
  action: VideoRecordingToolbarStateAction
): VideoRecordingToolbarState {
  switch (action.type) {
    case 'surface-ready':
      return {
        ...state,
        surfaceSessionId: action.surfaceSessionId,
        surfaceToken: action.surfaceToken,
      };
    case 'starting':
      return {
        ...state,
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
        durationSeconds: 0,
        error: null,
        interaction: 'navigation',
        phase: 'idle',
        recordingId: null,
      };
    case 'failed':
      return { ...state, error: action.error, phase: 'error', recordingId: null };
    case 'duration':
      return {
        ...state,
        durationSeconds: Math.max(state.durationSeconds, action.durationSeconds),
      };
    case 'interaction':
      return { ...state, interaction: action.interaction };
    case 'spotlight':
      return { ...state, spotlightEnabled: action.enabled };
    case 'microphone':
      return { ...state, microphoneEnabled: action.enabled };
    case 'microphone-device':
      return { ...state, microphoneDeviceId: action.deviceId };
    case 'camera':
      return { ...state, cameraEnabled: action.enabled };
    case 'camera-device':
      return { ...state, webcamDeviceId: action.deviceId };
    case 'camera-presentation':
      return { ...state, webcamPresentation: action.presentation };
  }
}

export function isVideoRecordingToolbarModeLocked(phase: VideoRecordingToolbarPhase): boolean {
  return (
    phase === 'starting' || phase === 'recording' || phase === 'paused' || phase === 'stopping'
  );
}

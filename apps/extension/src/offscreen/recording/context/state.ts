import type { AudioMixer } from '../stream/audio-mixer';
import { sendRuntimeMessageBestEffort } from '../../runtime-messaging/best-effort';
import { createDurationTracker } from '../duration';
import type { ViewportCropUpdater, ViewportDrawStateUpdater } from '../stream';
import { createLogger } from '@sniptale/platform/observability/logger';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';

const logger = createLogger({ namespace: 'OffscreenRecordingContext' });

type RecordingLifecycleState = 'idle' | 'starting' | 'recording' | 'stopping';

interface StopRequestHandlers {
  discard?: boolean;
  resolve: () => void;
  reject: (reason?: unknown) => void;
}

interface OffscreenRecordingContextState {
  mediaRecorder: MediaRecorder | null;
  videoStream: MediaStream | null;
  sourceStream: MediaStream | null;
  audioMixer: AudioMixer | null;
  recordedChunks: Blob[];
  updateViewportPresetCrop: ViewportCropUpdater | null;
  updateViewportPresetDrawState: ViewportDrawStateUpdater | null;
  viewportDrawFrozen: boolean;
  viewportNavigationEpoch: number;
  currentRecordingId: string | null;
  stopRecordingResolve: (() => void) | null;
  stopRecordingReject: ((reason?: unknown) => void) | null;
  durationTracker: ReturnType<typeof createDurationTracker>;
  discardOnStop: boolean;
  lifecycleState: RecordingLifecycleState;
}

export type OffscreenRecordingContextFacade = Omit<
  OffscreenRecordingContextState,
  'lifecycleState'
> & {
  readonly lifecycleState: RecordingLifecycleState;
  beginRecordingSession: (recordingId: string) => void;
  activateRecorder: (mediaRecorder: MediaRecorder) => void;
  beginStopRequest: (handlers: StopRequestHandlers) => void;
  clearStopRequest: () => {
    reject: ((reason?: unknown) => void) | null;
    resolve: (() => void) | null;
  };
  hasActiveRecordingSession: () => boolean;
  resetRecordingSession: () => void;
};

type ContextField = keyof Omit<OffscreenRecordingContextState, 'lifecycleState'>;

export const OFFSCREEN_RECORDING_CONTEXT_FIELDS = [
  'mediaRecorder',
  'videoStream',
  'sourceStream',
  'audioMixer',
  'recordedChunks',
  'updateViewportPresetCrop',
  'updateViewportPresetDrawState',
  'viewportDrawFrozen',
  'viewportNavigationEpoch',
  'currentRecordingId',
  'stopRecordingResolve',
  'stopRecordingReject',
  'durationTracker',
  'discardOnStop',
] as const satisfies readonly ContextField[];

export function createOffscreenRecordingContextState(): OffscreenRecordingContextState {
  const stateRef: { value: OffscreenRecordingContextState | null } = { value: null };
  const state: OffscreenRecordingContextState = {
    mediaRecorder: null,
    videoStream: null,
    sourceStream: null,
    audioMixer: null,
    recordedChunks: [],
    updateViewportPresetCrop: null,
    updateViewportPresetDrawState: null,
    viewportDrawFrozen: false,
    viewportNavigationEpoch: 0,
    currentRecordingId: null,
    stopRecordingResolve: null,
    stopRecordingReject: null,
    discardOnStop: false,
    lifecycleState: 'idle',
    durationTracker: createDurationTracker((duration) => {
      const recordingId = stateRef.value?.currentRecordingId;
      if (!recordingId) {
        return;
      }

      sendRuntimeMessageBestEffort({
        context: { duration, recordingId },
        logger,
        logMessage: 'Failed to publish recording duration update',
        payload: {
          type: VideoMessageType.RECORDING_DURATION_UPDATED,
          duration,
          recordingId,
        },
      });
    }),
  };
  stateRef.value = state;
  return state;
}

export function createContextFieldDescriptor<Key extends ContextField>(
  state: OffscreenRecordingContextState,
  key: Key
): TypedPropertyDescriptor<OffscreenRecordingContextState[Key]> {
  return {
    enumerable: true,
    configurable: false,
    get() {
      return state[key];
    },
    set(value) {
      state[key] = value;
    },
  };
}

export function createLifecycleFieldDescriptor(
  state: OffscreenRecordingContextState
): TypedPropertyDescriptor<RecordingLifecycleState> {
  return {
    enumerable: true,
    configurable: false,
    get() {
      return state.lifecycleState;
    },
  };
}

function assertLifecycleTransition(
  state: OffscreenRecordingContextState,
  nextState: RecordingLifecycleState,
  owner: string
): void {
  const allowedTransitions: Record<RecordingLifecycleState, readonly RecordingLifecycleState[]> = {
    idle: ['idle', 'starting'],
    starting: ['idle', 'recording'],
    recording: ['idle', 'stopping'],
    stopping: ['idle'],
  };

  if (allowedTransitions[state.lifecycleState].includes(nextState)) {
    return;
  }

  throw new Error(
    `Illegal recording lifecycle transition: ${state.lifecycleState} -> ${nextState} (${owner})`
  );
}

function setLifecycleState(
  state: OffscreenRecordingContextState,
  nextState: RecordingLifecycleState,
  owner: string
): void {
  assertLifecycleTransition(state, nextState, owner);
  state.lifecycleState = nextState;
}

export function beginRecordingSession(
  state: OffscreenRecordingContextState,
  recordingId: string
): void {
  setLifecycleState(state, 'starting', 'beginRecordingSession');
  state.currentRecordingId = recordingId;
}

export function activateRecorder(
  state: OffscreenRecordingContextState,
  mediaRecorder: MediaRecorder
): void {
  setLifecycleState(state, 'recording', 'activateRecorder');
  state.mediaRecorder = mediaRecorder;
}

export function beginStopRequest(
  state: OffscreenRecordingContextState,
  handlers: StopRequestHandlers
): void {
  setLifecycleState(state, 'stopping', 'beginStopRequest');
  state.stopRecordingResolve = handlers.resolve;
  state.stopRecordingReject = handlers.reject;
  state.discardOnStop = handlers.discard ?? false;
}

export function clearStopRequest(state: OffscreenRecordingContextState): {
  reject: ((reason?: unknown) => void) | null;
  resolve: (() => void) | null;
} {
  const resolve = state.stopRecordingResolve;
  const reject = state.stopRecordingReject;
  state.stopRecordingResolve = null;
  state.stopRecordingReject = null;
  return { resolve, reject };
}

export function hasActiveRecordingSession(state: OffscreenRecordingContextState): boolean {
  return (
    state.lifecycleState !== 'idle' ||
    state.currentRecordingId !== null ||
    state.mediaRecorder !== null ||
    state.sourceStream !== null ||
    state.videoStream !== null
  );
}

export function resetRecordingSession(state: OffscreenRecordingContextState): void {
  state.updateViewportPresetCrop = null;
  state.updateViewportPresetDrawState = null;
  state.viewportDrawFrozen = false;
  state.viewportNavigationEpoch = 0;
  state.currentRecordingId = null;
  state.recordedChunks.length = 0;
  state.discardOnStop = false;
  state.stopRecordingResolve = null;
  state.stopRecordingReject = null;
  setLifecycleState(state, 'idle', 'resetRecordingSession');
}

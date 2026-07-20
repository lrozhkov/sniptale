import type { VideoCursorCaptureMode } from '../../../../features/video/project/types';
import type {
  CaptureMode,
  VideoDisplaySurface,
} from '@sniptale/runtime-contracts/video/types/types';
import type { RecordingTelemetrySnapshot } from '../../../../contracts/messaging/contracts/response-types';

interface VideoManagerSessionState {
  recordingTabId: number | null;
  currentRecordingId: string | null;
  openEditorAfterRecording: boolean;
  isStarting: boolean;
  offscreenStartDispatched: boolean;
  isStopping: boolean;
  currentCaptureMode: CaptureMode | null;
  currentCountdownSessionId: string | null;
  viewportNavigationEpoch: number;
  viewportNavigationPending: boolean;
  controlledCursorCaptureEnabled: boolean;
  controlledCursorAutoPaused: boolean;
  controlledCursorNavigationEpoch: number;
  controlledCursorNavigationPending: boolean;
  controlledCursorOffsetSeconds: number;
  controlledCursorVerifiedMode: VideoCursorCaptureMode | null;
  controlledCursorDisplaySurface: VideoDisplaySurface | null;
  controlledCursorTelemetry: RecordingTelemetrySnapshot | null;
}

export type VideoManagerSessionFacade = VideoManagerSessionState;

const VIDEO_MANAGER_SESSION_FIELDS = [
  'recordingTabId',
  'currentRecordingId',
  'openEditorAfterRecording',
  'isStarting',
  'offscreenStartDispatched',
  'isStopping',
  'currentCaptureMode',
  'currentCountdownSessionId',
  'viewportNavigationEpoch',
  'viewportNavigationPending',
  'controlledCursorCaptureEnabled',
  'controlledCursorAutoPaused',
  'controlledCursorNavigationEpoch',
  'controlledCursorNavigationPending',
  'controlledCursorOffsetSeconds',
  'controlledCursorVerifiedMode',
  'controlledCursorDisplaySurface',
  'controlledCursorTelemetry',
] as const satisfies readonly (keyof VideoManagerSessionState)[];

type VideoManagerSessionField = (typeof VIDEO_MANAGER_SESSION_FIELDS)[number];

function createVideoManagerSessionState(): VideoManagerSessionState {
  return {
    recordingTabId: null,
    currentRecordingId: null,
    openEditorAfterRecording: false,
    isStarting: false,
    offscreenStartDispatched: false,
    isStopping: false,
    currentCaptureMode: null,
    currentCountdownSessionId: null,
    viewportNavigationEpoch: 0,
    viewportNavigationPending: false,
    controlledCursorCaptureEnabled: false,
    controlledCursorAutoPaused: false,
    controlledCursorNavigationEpoch: 0,
    controlledCursorNavigationPending: false,
    controlledCursorOffsetSeconds: 0,
    controlledCursorVerifiedMode: null,
    controlledCursorDisplaySurface: null,
    controlledCursorTelemetry: null,
  };
}

function createSessionFieldDescriptor<Key extends VideoManagerSessionField>(
  state: VideoManagerSessionState,
  key: Key
): TypedPropertyDescriptor<VideoManagerSessionState[Key]> {
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

function createVideoManagerSessionFacade(): VideoManagerSessionFacade {
  const state = createVideoManagerSessionState();
  const facade = {} as VideoManagerSessionFacade;

  for (const field of VIDEO_MANAGER_SESSION_FIELDS) {
    Object.defineProperty(facade, field, createSessionFieldDescriptor(state, field));
  }

  return facade;
}

function setVideoManagerSessionField<Key extends VideoManagerSessionField>(
  session: VideoManagerSessionFacade,
  field: Key,
  value: VideoManagerSessionState[Key]
): void {
  session[field] = value;
}

function defineLazyField(
  facade: VideoManagerSessionFacade,
  field: VideoManagerSessionField,
  getSession: () => VideoManagerSessionFacade
): void {
  Object.defineProperty(facade, field, {
    enumerable: true,
    configurable: false,
    get() {
      return getSession()[field];
    },
    set(value: VideoManagerSessionState[typeof field]) {
      setVideoManagerSessionField(getSession(), field, value);
    },
  });
}

export function createLazyVideoManagerSessionFacade(
  getSession: () => VideoManagerSessionFacade
): VideoManagerSessionFacade {
  const facade = {} as VideoManagerSessionFacade;

  for (const field of VIDEO_MANAGER_SESSION_FIELDS) {
    defineLazyField(facade, field, getSession);
  }

  return facade;
}

export function createVideoManagerSession(): VideoManagerSessionFacade {
  return createVideoManagerSessionFacade();
}

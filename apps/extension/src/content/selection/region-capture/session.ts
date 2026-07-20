import type {
  applyVideoTrackHints,
  applyViewportCrop,
  getRegionCaptureDisplayStream,
  resolveRegionCaptureStream,
} from './helpers';
import { type RegionCaptureRecorderConfig, type ViewportCropTarget } from './helpers';
import type { saveRegionCaptureRecording } from './recording';
import type { CaptureProgress, RegionCaptureSettings } from './types';
import { createLogger } from '@sniptale/platform/observability/logger';

export interface RegionCaptureSessionDeps {
  applyTrackHints?: typeof applyVideoTrackHints;
  applyViewportCrop?: typeof applyViewportCrop;
  configureRecorder?: (props: RegionCaptureRecorderConfig) => MediaRecorder;
  createCropTarget?: () => Promise<ViewportCropTarget>;
  getDisplayStream?: typeof getRegionCaptureDisplayStream;
  removeMarker?: () => void;
  resolveCaptureStream?: typeof resolveRegionCaptureStream;
  saveRecording?: typeof saveRegionCaptureRecording;
  scheduleTimeout?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
}

type RegionCaptureSessionState = {
  cleanupTimeoutId: ReturnType<typeof setTimeout> | null;
  currentStream: MediaStream | null;
  isRecording: boolean;
  mediaRecorder: MediaRecorder | null;
  micStream: MediaStream | null;
  mixingAudioContext: AudioContext | null;
  onProgressCallback: ((progress: CaptureProgress) => void) | null;
  recordedChunks: Blob[];
};

const logger = createLogger({ namespace: 'ContentRegionCaptureSession' });

export interface RegionCaptureSession {
  start: (
    settings: RegionCaptureSettings,
    onProgress: (progress: CaptureProgress) => void
  ) => Promise<void>;
  stop: () => void;
  dispose: () => void;
}

function createRegionCaptureSessionState(): RegionCaptureSessionState {
  return {
    cleanupTimeoutId: null,
    currentStream: null,
    isRecording: false,
    mediaRecorder: null,
    micStream: null,
    mixingAudioContext: null,
    onProgressCallback: null,
    recordedChunks: [],
  };
}

function clearPendingCleanup(state: RegionCaptureSessionState): void {
  if (state.cleanupTimeoutId === null) {
    return;
  }

  globalThis.clearTimeout(state.cleanupTimeoutId);
  state.cleanupTimeoutId = null;
}

function createRegionCaptureCleanup(state: RegionCaptureSessionState, removeMarker: () => void) {
  return () => {
    clearPendingCleanup(state);
    state.currentStream?.getTracks().forEach((track) => track.stop());
    state.currentStream = null;
    state.micStream?.getTracks().forEach((track) => track.stop());
    state.micStream = null;
    void state.mixingAudioContext?.close().catch((error) => {
      logger.warn('Failed to close region-capture audio context', error);
    });
    state.mixingAudioContext = null;
    state.mediaRecorder = null;
    state.isRecording = false;
    state.onProgressCallback = null;
    removeMarker();
  };
}

function createSaveRecordingHandler(
  state: RegionCaptureSessionState,
  saveRecording: typeof saveRegionCaptureRecording
) {
  return () => {
    saveRecording({
      recordedChunks: state.recordedChunks,
      onChunksReset: () => {
        state.recordedChunks = [];
      },
    });
  };
}

async function prepareRegionCaptureRecorder(args: {
  deps: Required<RegionCaptureSessionDeps>;
  onSaveRecording: ReturnType<typeof createSaveRecordingHandler>;
  settings: RegionCaptureSettings;
  state: RegionCaptureSessionState;
}): Promise<MediaRecorder> {
  const cropTarget = await args.deps.createCropTarget();
  const displayStream = await args.deps.getDisplayStream(args.settings.systemAudioEnabled);
  const videoTrack = displayStream.getVideoTracks()[0];

  if (!videoTrack) {
    throw new Error('No video track in display stream');
  }

  args.deps.applyTrackHints(videoTrack);
  await args.deps.applyViewportCrop(videoTrack, cropTarget);

  const captureStream = await args.deps.resolveCaptureStream(args.settings, displayStream);
  args.state.mixingAudioContext = captureStream.audioContext;
  args.state.micStream = captureStream.micStream;
  args.state.currentStream = captureStream.finalStream;
  return args.deps.configureRecorder({
    finalStream: captureStream.finalStream,
    onProgress: args.state.onProgressCallback,
    onSaveRecording: args.onSaveRecording,
    quality: args.settings.quality,
    recordedChunks: args.state.recordedChunks,
  });
}

function createStartRegionCapture(
  state: RegionCaptureSessionState,
  deps: Required<RegionCaptureSessionDeps>,
  cleanup: () => void
) {
  const saveRecording = createSaveRecordingHandler(state, deps.saveRecording);

  return async (
    settings: RegionCaptureSettings,
    onProgress: (progress: CaptureProgress) => void
  ): Promise<void> => {
    try {
      logger.log('Starting capture with native crop API');
      clearPendingCleanup(state);
      state.onProgressCallback = onProgress;
      state.recordedChunks = [];

      state.mediaRecorder = await prepareRegionCaptureRecorder({
        deps,
        onSaveRecording: saveRecording,
        settings,
        state,
      });

      state.mediaRecorder.start(1000);
      state.isRecording = true;
      logger.log('Recording started successfully');
      state.onProgressCallback?.({ type: 'STARTED' });
    } catch (error) {
      logger.error('Fatal capture startup error', error);
      const progressCallback = state.onProgressCallback;
      cleanup();
      progressCallback?.({
        type: 'ERROR',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };
}

function createStopRegionCapture(
  state: RegionCaptureSessionState,
  scheduleTimeout: Required<RegionCaptureSessionDeps>['scheduleTimeout'],
  cleanup: () => void
) {
  return () => {
    logger.log('Stopping recording');

    if (!state.mediaRecorder || !state.isRecording) {
      logger.warn('Stop requested without active recording');
      return;
    }

    state.isRecording = false;

    try {
      state.mediaRecorder.stop();
    } catch (error) {
      logger.error('Failed to stop recorder', error);
    }

    clearPendingCleanup(state);
    state.cleanupTimeoutId = scheduleTimeout(cleanup, 500);
  };
}

export function createRegionCaptureSession(
  deps: Required<RegionCaptureSessionDeps>
): RegionCaptureSession {
  const state = createRegionCaptureSessionState();
  const cleanup = createRegionCaptureCleanup(state, deps.removeMarker);

  return {
    start: createStartRegionCapture(state, deps, cleanup),
    stop: createStopRegionCapture(state, deps.scheduleTimeout, cleanup),
    dispose: cleanup,
  };
}

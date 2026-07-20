import { cleanupTabCaptureResources, saveTabCaptureRecording } from './recording';
import { configureTabCaptureRecorder, resolveFinalCaptureStream } from './stream';
import { createLogger } from '@sniptale/platform/observability/logger';
import type { CaptureProgress, TabCaptureSettings } from './types';

interface TabCaptureSessionDeps {
  cleanupResources?: typeof cleanupTabCaptureResources;
  configureRecorder?: typeof configureTabCaptureRecorder;
  resolveCaptureStream?: typeof resolveFinalCaptureStream;
  saveRecording?: typeof saveTabCaptureRecording;
  scheduleTimeout?: (
    callback: () => void,
    delay: number
  ) => ReturnType<typeof globalThis.setTimeout>;
  clearScheduledTimeout?: (timeoutId: ReturnType<typeof globalThis.setTimeout>) => void;
}

type ScheduledTimeout = ReturnType<typeof globalThis.setTimeout>;

type TabCaptureSessionState = {
  cleanupTimeoutId: ScheduledTimeout | null;
  currentStream: MediaStream | null;
  isRecording: boolean;
  mediaRecorder: MediaRecorder | null;
  micStream: MediaStream | null;
  mixingAudioContext: AudioContext | null;
  onProgressCallback: ((progress: CaptureProgress) => void) | null;
  recordedChunks: Blob[];
};

type TabCaptureRuntimeDeps = Required<
  Pick<
    TabCaptureSessionDeps,
    | 'cleanupResources'
    | 'clearScheduledTimeout'
    | 'configureRecorder'
    | 'resolveCaptureStream'
    | 'saveRecording'
    | 'scheduleTimeout'
  >
>;

const logger = createLogger({ namespace: 'ContentTabCaptureFallback' });

interface TabCaptureSession {
  start: (
    settings: TabCaptureSettings,
    onProgress: (progress: CaptureProgress) => void
  ) => Promise<void>;
  stop: () => void;
  dispose: () => void;
}

function createTabCaptureSessionState(): TabCaptureSessionState {
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

function clearPendingCleanup(
  state: Pick<TabCaptureSessionState, 'cleanupTimeoutId'>,
  clearScheduledTimeout: TabCaptureRuntimeDeps['clearScheduledTimeout']
) {
  if (state.cleanupTimeoutId === null) {
    return;
  }

  clearScheduledTimeout(state.cleanupTimeoutId);
  state.cleanupTimeoutId = null;
}

function createTabCaptureCleanup(state: TabCaptureSessionState, deps: TabCaptureRuntimeDeps) {
  return () => {
    clearPendingCleanup(state, deps.clearScheduledTimeout);
    deps.cleanupResources({
      audioContext: state.mixingAudioContext,
      currentStream: state.currentStream,
      micStream: state.micStream,
    });
    state.currentStream = null;
    state.micStream = null;
    state.mixingAudioContext = null;
    state.mediaRecorder = null;
    state.isRecording = false;
    state.onProgressCallback = null;
  };
}

function createHandleSaveRecording(
  state: TabCaptureSessionState,
  saveRecording: typeof saveTabCaptureRecording
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

function createStartTabCapture(state: TabCaptureSessionState, deps: TabCaptureRuntimeDeps) {
  const cleanup = createTabCaptureCleanup(state, deps);
  const handleSaveRecording = createHandleSaveRecording(state, deps.saveRecording);

  return async (settings: TabCaptureSettings, onProgress: (progress: CaptureProgress) => void) => {
    try {
      logger.log('Starting fallback capture');
      logger.log('Region Capture API not available, using tabCapture');
      clearPendingCleanup(state, deps.clearScheduledTimeout);
      state.onProgressCallback = onProgress;
      state.recordedChunks = [];

      const resolvedStream = await deps.resolveCaptureStream(settings);
      state.mixingAudioContext = resolvedStream.audioContext ?? null;
      state.currentStream = resolvedStream.stream;
      state.micStream = resolvedStream.micStream;
      state.mediaRecorder = deps.configureRecorder({
        settings,
        stream: state.currentStream,
        onProgress: state.onProgressCallback,
        onSaveRecording: handleSaveRecording,
        recordedChunks: state.recordedChunks,
      });
      state.mediaRecorder.start(1000);
      state.isRecording = true;
      logger.log('Recording started (full tab)');
      logger.warn('Recording full tab, not just viewport');
      state.onProgressCallback?.({ type: 'STARTED' });
    } catch (error) {
      logger.error('Fatal fallback capture error', error);
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

function createStopTabCapture(state: TabCaptureSessionState, deps: TabCaptureRuntimeDeps) {
  const cleanup = createTabCaptureCleanup(state, deps);

  return () => {
    logger.log('Stopping recording');
    if (!state.mediaRecorder || !state.isRecording) {
      logger.warn('No active recording');
      return;
    }

    state.isRecording = false;

    try {
      state.mediaRecorder.stop();
    } catch (error) {
      logger.error('Error stopping recorder', error);
    }

    clearPendingCleanup(state, deps.clearScheduledTimeout);
    state.cleanupTimeoutId = deps.scheduleTimeout(cleanup, 500);
  };
}

/**
 * Creates a tab-capture fallback session with private recording state and explicit cleanup.
 */
export function createTabCaptureSession(deps: TabCaptureSessionDeps = {}): TabCaptureSession {
  const runtimeDeps: TabCaptureRuntimeDeps = {
    cleanupResources: deps.cleanupResources ?? cleanupTabCaptureResources,
    clearScheduledTimeout: deps.clearScheduledTimeout ?? globalThis.clearTimeout.bind(globalThis),
    configureRecorder: deps.configureRecorder ?? configureTabCaptureRecorder,
    resolveCaptureStream: deps.resolveCaptureStream ?? resolveFinalCaptureStream,
    saveRecording: deps.saveRecording ?? saveTabCaptureRecording,
    scheduleTimeout: deps.scheduleTimeout ?? globalThis.setTimeout.bind(globalThis),
  };
  const state = createTabCaptureSessionState();
  const cleanup = createTabCaptureCleanup(state, runtimeDeps);

  return {
    start: createStartTabCapture(state, runtimeDeps),
    stop: createStopTabCapture(state, runtimeDeps),
    dispose: cleanup,
  };
}

export type { CaptureProgress, TabCaptureSettings } from './types';

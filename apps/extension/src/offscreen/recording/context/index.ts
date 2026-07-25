import type { AudioMixer } from '../stream/audio-mixer';
import { sendRuntimeMessageBestEffort } from '../../runtime-messaging/best-effort';
import { createDurationTracker } from '../duration';
import type { ViewportCropUpdater, ViewportDrawStateUpdater } from '../stream/viewport';
import { createLogger } from '@sniptale/platform/observability/logger';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';

const logger = createLogger({ namespace: 'OffscreenRecordingContext' });

type RecordingLifecycleState = 'idle' | 'starting' | 'recording' | 'stopping';

interface StopRequestHandlers {
  discard?: boolean;
  resolve: () => void;
  reject: (reason?: unknown) => void;
}

class OffscreenRecordingContext {
  mediaRecorder: MediaRecorder | null = null;
  videoStream: MediaStream | null = null;
  sourceStream: MediaStream | null = null;
  audioMixer: AudioMixer | null = null;
  recordedChunks: Blob[] = [];
  updateViewportPresetCrop: ViewportCropUpdater | null = null;
  updateViewportPresetDrawState: ViewportDrawStateUpdater | null = null;
  viewportDrawFrozen = false;
  viewportNavigationEpoch = 0;
  currentRecordingId: string | null = null;
  stopRecordingResolve: (() => void) | null = null;
  stopRecordingReject: ((reason?: unknown) => void) | null = null;
  discardOnStop = false;

  durationTracker = createDurationTracker((duration) => {
    const recordingId = this.currentRecordingId;
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
  });

  #lifecycleState: RecordingLifecycleState = 'idle';

  get lifecycleState(): RecordingLifecycleState {
    return this.#lifecycleState;
  }

  beginRecordingSession(recordingId: string): void {
    this.#setLifecycleState('starting', 'beginRecordingSession');
    this.currentRecordingId = recordingId;
  }

  activateRecorder(mediaRecorder: MediaRecorder): void {
    this.#setLifecycleState('recording', 'activateRecorder');
    this.mediaRecorder = mediaRecorder;
  }

  beginStopRequest(handlers: StopRequestHandlers): void {
    this.#setLifecycleState('stopping', 'beginStopRequest');
    this.stopRecordingResolve = handlers.resolve;
    this.stopRecordingReject = handlers.reject;
    this.discardOnStop = handlers.discard ?? false;
  }

  clearStopRequest(): {
    reject: ((reason?: unknown) => void) | null;
    resolve: (() => void) | null;
  } {
    const resolve = this.stopRecordingResolve;
    const reject = this.stopRecordingReject;
    this.stopRecordingResolve = null;
    this.stopRecordingReject = null;
    return { resolve, reject };
  }

  hasActiveRecordingSession(): boolean {
    return (
      this.#lifecycleState !== 'idle' ||
      this.currentRecordingId !== null ||
      this.mediaRecorder !== null ||
      this.sourceStream !== null ||
      this.videoStream !== null
    );
  }

  resetRecordingSession(): void {
    this.updateViewportPresetCrop = null;
    this.updateViewportPresetDrawState = null;
    this.viewportDrawFrozen = false;
    this.viewportNavigationEpoch = 0;
    this.currentRecordingId = null;
    this.recordedChunks.length = 0;
    this.discardOnStop = false;
    this.stopRecordingResolve = null;
    this.stopRecordingReject = null;
    this.#setLifecycleState('idle', 'resetRecordingSession');
  }

  #setLifecycleState(nextState: RecordingLifecycleState, owner: string): void {
    const allowedTransitions: Record<RecordingLifecycleState, readonly RecordingLifecycleState[]> =
      {
        idle: ['idle', 'starting'],
        starting: ['idle', 'recording'],
        recording: ['idle', 'stopping'],
        stopping: ['idle'],
      };

    if (!allowedTransitions[this.#lifecycleState].includes(nextState)) {
      throw new Error(
        `Illegal recording lifecycle transition: ${this.#lifecycleState} -> ${nextState} (${owner})`
      );
    }

    this.#lifecycleState = nextState;
  }
}

export const recordingContext = new OffscreenRecordingContext();

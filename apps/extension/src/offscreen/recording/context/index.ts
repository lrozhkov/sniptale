import type { AudioMixer } from '../stream/audio-mixer';
import { sendRuntimeMessageBestEffort } from '../../runtime-messaging/best-effort';
import { createDurationTracker } from '../duration';
import { createLogger } from '@sniptale/platform/observability/logger';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { TabOutputGeometry } from '../stream/tab-output';
import type { CropStreamControls } from '../stream/crop-stream';
import type { RecordingStagingCoordinator } from '../../../composition/persistence/recordings/staging';
import type { RecordingArtifactSession } from '../encoding/artifact-session';

const logger = createLogger({ namespace: 'OffscreenRecordingContext' });

type RecordingLifecycleState = 'idle' | 'starting' | 'recording' | 'stopping';

export type RecordingStopOutcome =
  | { result: 'stopped' }
  | { error: string; result: 'terminal-failure' };

interface StopRequestHandlers {
  discard?: boolean;
  resolve: (outcome?: RecordingStopOutcome) => void;
  reject: (reason?: unknown) => void;
}

class OffscreenRecordingContext {
  mediaRecorder: MediaRecorder | null = null;
  videoStream: MediaStream | null = null;
  sourceStream: MediaStream | null = null;
  audioMixer: AudioMixer | null = null;
  artifactSession: RecordingArtifactSession | null = null;
  stagingCoordinator: RecordingStagingCoordinator | null = null;
  currentRecordingId: string | null = null;
  generation: number | null = null;
  streamInstanceId: string | null = null;
  sourceVideoHeight: number | null = null;
  sourceVideoWidth: number | null = null;
  tabOutputControls: CropStreamControls | null = null;
  tabOutputGeometry: TabOutputGeometry | null = null;
  stopRecordingResolve: ((outcome?: RecordingStopOutcome) => void) | null = null;
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
  #startingRecorderCancellation: (() => void) | null = null;

  get lifecycleState(): RecordingLifecycleState {
    return this.#lifecycleState;
  }

  beginRecordingSession(recordingId: string, generation = 0): void {
    this.#setLifecycleState('starting', 'beginRecordingSession');
    this.currentRecordingId = recordingId;
    this.generation = generation;
    this.streamInstanceId = null;
    this.sourceVideoHeight = null;
    this.sourceVideoWidth = null;
    this.tabOutputControls = null;
    this.tabOutputGeometry = null;
  }

  bindStreamInstance(binding: {
    recordingId: string;
    generation: number;
    streamInstanceId: string;
  }): void {
    if (
      this.currentRecordingId !== binding.recordingId ||
      this.generation !== binding.generation ||
      this.lifecycleState !== 'starting'
    ) {
      throw new Error('Stale recording source binding');
    }
    this.streamInstanceId = binding.streamInstanceId;
  }

  matchesSourceBinding(binding: {
    recordingId: string;
    generation: number;
    streamInstanceId: string;
  }): boolean {
    return (
      this.currentRecordingId === binding.recordingId &&
      this.generation === binding.generation &&
      this.streamInstanceId === binding.streamInstanceId
    );
  }

  bindStagingCoordinator(coordinator: RecordingStagingCoordinator): void {
    if (this.lifecycleState !== 'starting' || this.stagingCoordinator !== null) {
      throw new Error('Recording session cannot bind stale staging');
    }
    this.stagingCoordinator = coordinator;
  }

  bindStartingArtifactSession(artifactSession: RecordingArtifactSession): void {
    if (
      this.lifecycleState !== 'starting' ||
      this.stagingCoordinator === null ||
      this.artifactSession !== null ||
      this.mediaRecorder !== null
    ) {
      throw new Error('Recording session cannot bind stale artifacts');
    }
    this.artifactSession = artifactSession;
    this.mediaRecorder = artifactSession.recorder;
  }

  registerStartingRecorderCancellation(mediaRecorder: MediaRecorder, cancel: () => void): void {
    if (this.lifecycleState !== 'starting' || this.mediaRecorder !== mediaRecorder) {
      throw new Error('Recording session cannot register stale recorder cancellation');
    }
    this.#startingRecorderCancellation = cancel;
  }

  cancelStartingRecorder(): boolean {
    if (this.lifecycleState !== 'starting') {
      return false;
    }
    this.#setLifecycleState('stopping', 'cancelStartingRecorder');
    const cancel = this.#startingRecorderCancellation;
    this.#startingRecorderCancellation = null;
    cancel?.();
    return true;
  }

  activateRecorder(mediaRecorder: MediaRecorder): void {
    if (this.mediaRecorder !== mediaRecorder) {
      throw new Error('Recording session cannot activate an unbound recorder');
    }
    this.#setLifecycleState('recording', 'activateRecorder');
    this.#startingRecorderCancellation = null;
  }

  beginStopRequest(handlers: StopRequestHandlers): void {
    this.#setLifecycleState('stopping', 'beginStopRequest');
    this.stopRecordingResolve = handlers.resolve;
    this.stopRecordingReject = handlers.reject;
    this.discardOnStop = handlers.discard ?? false;
  }

  clearStopRequest(): {
    reject: ((reason?: unknown) => void) | null;
    resolve: ((outcome?: RecordingStopOutcome) => void) | null;
  } {
    const resolve = this.stopRecordingResolve;
    const reject = this.stopRecordingReject;
    this.stopRecordingResolve = null;
    this.stopRecordingReject = null;
    this.#startingRecorderCancellation = null;
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
    this.currentRecordingId = null;
    this.generation = null;
    this.streamInstanceId = null;
    this.sourceVideoHeight = null;
    this.sourceVideoWidth = null;
    this.tabOutputControls = null;
    this.tabOutputGeometry = null;
    this.artifactSession = null;
    this.stagingCoordinator = null;
    this.discardOnStop = false;
    this.stopRecordingResolve = null;
    this.stopRecordingReject = null;
    this.#startingRecorderCancellation = null;
    this.#setLifecycleState('idle', 'resetRecordingSession');
  }

  #setLifecycleState(nextState: RecordingLifecycleState, owner: string): void {
    const allowedTransitions: Record<RecordingLifecycleState, readonly RecordingLifecycleState[]> =
      {
        idle: ['idle', 'starting'],
        starting: ['idle', 'recording', 'stopping'],
        recording: ['idle', 'stopping'],
        stopping: ['idle', 'stopping'],
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

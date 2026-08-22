import type { AudioMixer } from '../stream/audio-mixer';
import { sendRuntimeMessageBestEffort } from '../../runtime-messaging/best-effort';
import { createDurationTracker } from '../duration';
import { createLogger } from '@sniptale/platform/observability/logger';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { TabOutputGeometry } from '../stream/tab-output';
import type { RecordingStagingCoordinator } from '../../../composition/persistence/recordings/staging';
import type { LiveRecordingArtifactSession } from '../encoding/live-artifact-session';

const logger = createLogger({ namespace: 'OffscreenRecordingContext' });

type RecordingLifecycleState = 'idle' | 'starting' | 'recording' | 'stopping';

type RecordingSourceBinding = {
  generation: number;
  recordingId: string;
  streamInstanceId: string;
};

export type RecordingStopOutcome =
  | { result: 'stopped' }
  | { error: string; result: 'terminal-failure' };

interface StopRequestHandlers {
  discard?: boolean;
  resolve: (outcome?: RecordingStopOutcome) => void;
  reject: (reason?: unknown) => void;
}

class OffscreenRecordingContext {
  videoStream: MediaStream | null = null;
  sourceStream: MediaStream | null = null;
  audioMixer: AudioMixer | null = null;
  artifactSession: LiveRecordingArtifactSession | null = null;
  stagingCoordinator: RecordingStagingCoordinator | null = null;
  currentRecordingId: string | null = null;
  generation: number | null = null;
  streamInstanceId: string | null = null;
  sourceVideoHeight: number | null = null;
  sourceVideoWidth: number | null = null;
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
  #sourceFailure: { binding: RecordingSourceBinding; error: Error } | null = null;
  #sourceFailureHandler: {
    binding: RecordingSourceBinding;
    handler: (error: Error) => void;
  } | null = null;
  #startingRecorderCancellation: (() => void) | null = null;
  #artifactFinalizingHandler: (() => void) | null = null;

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

  reportSourceInvalidation(binding: RecordingSourceBinding, error: Error): 'applied' | 'stale' {
    if (!this.matchesSourceBinding(binding) || this.lifecycleState === 'idle') return 'stale';
    if (this.#sourceFailure) return 'applied';
    this.#sourceFailure = { binding: { ...binding }, error };
    const registered = this.#sourceFailureHandler;
    if (registered && this.#bindingsEqual(registered.binding, binding)) {
      registered.handler(error);
    }
    return 'applied';
  }

  registerSourceFailureHandler(
    binding: RecordingSourceBinding,
    handler: (error: Error) => void
  ): Error | null {
    if (!this.matchesSourceBinding(binding) || this.lifecycleState !== 'starting') {
      throw new Error('Recording session cannot register a stale source failure handler');
    }
    this.#sourceFailureHandler = { binding: { ...binding }, handler };
    return this.#sourceFailure && this.#bindingsEqual(this.#sourceFailure.binding, binding)
      ? this.#sourceFailure.error
      : null;
  }

  bindStagingCoordinator(coordinator: RecordingStagingCoordinator): void {
    if (this.lifecycleState !== 'starting' || this.stagingCoordinator !== null) {
      throw new Error('Recording session cannot bind stale staging');
    }
    this.stagingCoordinator = coordinator;
  }

  bindStartingArtifactSession(artifactSession: LiveRecordingArtifactSession): void {
    if (
      this.lifecycleState !== 'starting' ||
      this.stagingCoordinator === null ||
      this.artifactSession !== null
    ) {
      throw new Error('Recording session cannot bind stale artifacts');
    }
    this.artifactSession = artifactSession;
  }

  registerStartingRecorderCancellation(
    artifactSession: LiveRecordingArtifactSession,
    cancel: () => void
  ): void {
    if (this.lifecycleState !== 'starting' || this.artifactSession !== artifactSession) {
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

  activateRecorder(artifactSession: LiveRecordingArtifactSession): void {
    if (this.artifactSession !== artifactSession) {
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

  registerArtifactFinalizingHandler(handler: () => void): void {
    if (this.lifecycleState !== 'stopping') {
      throw new Error('Recording session cannot register finalization progress while not stopping');
    }
    this.#artifactFinalizingHandler = handler;
  }

  reportArtifactFinalizing(): void {
    const handler = this.#artifactFinalizingHandler;
    this.#artifactFinalizingHandler = null;
    handler?.();
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
    this.#artifactFinalizingHandler = null;
    return { resolve, reject };
  }

  hasActiveRecordingSession(): boolean {
    return (
      this.#lifecycleState !== 'idle' ||
      this.currentRecordingId !== null ||
      this.artifactSession !== null ||
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
    this.tabOutputGeometry = null;
    this.artifactSession = null;
    this.stagingCoordinator = null;
    this.discardOnStop = false;
    this.stopRecordingResolve = null;
    this.stopRecordingReject = null;
    this.#startingRecorderCancellation = null;
    this.#artifactFinalizingHandler = null;
    this.#sourceFailure = null;
    this.#sourceFailureHandler = null;
    this.#setLifecycleState('idle', 'resetRecordingSession');
  }

  #bindingsEqual(left: RecordingSourceBinding, right: RecordingSourceBinding): boolean {
    return (
      left.recordingId === right.recordingId &&
      left.generation === right.generation &&
      left.streamInstanceId === right.streamInstanceId
    );
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

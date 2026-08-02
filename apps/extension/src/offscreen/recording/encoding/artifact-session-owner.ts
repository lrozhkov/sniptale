import type {
  FinalizedRecordingStagingArtifact,
  RecordingStagingArtifactWriter,
  RecordingStagingCoordinator,
} from '../../../composition/persistence/recordings/staging';
import { getMediaRecorderError } from '../recorder-error';

type ArtifactSessionPhase =
  | 'ready'
  | 'starting'
  | 'recording'
  | 'stopping'
  | 'finalizing'
  | 'finalized'
  | 'failed'
  | 'aborted';

interface RecordingArtifactLifecycleCallbacks {
  onFailure?(error: Error): void;
  onStart?(): void;
  onStop?(artifact: FinalizedRecordingStagingArtifact): Promise<void> | void;
}

export interface RecordingArtifactSession {
  readonly recorder: MediaRecorder;
  abort(): Promise<void>;
  setLifecycleCallbacks(callbacks: RecordingArtifactLifecycleCallbacks): void;
  start(): void;
  stop(): Promise<FinalizedRecordingStagingArtifact>;
}

interface CreateRecordingArtifactSessionOwnerInput {
  artifactId: string;
  coordinator: RecordingStagingCoordinator;
  recorderOptions: MediaRecorderOptions;
  stream: MediaStream;
  writer: RecordingStagingArtifactWriter;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export class RecordingArtifactSessionOwner implements RecordingArtifactSession {
  readonly recorder: MediaRecorder;
  private abortPromise: Promise<void> | null = null;
  private callbacks: RecordingArtifactLifecycleCallbacks = {};
  private failure: Error | null = null;
  private phase: ArtifactSessionPhase = 'ready';
  private terminalSettled = false;
  private readonly terminal: Promise<FinalizedRecordingStagingArtifact>;
  private readonly resolveTerminal: (artifact: FinalizedRecordingStagingArtifact) => void;
  private readonly rejectTerminal: (error: Error) => void;

  constructor(private readonly input: CreateRecordingArtifactSessionOwnerInput) {
    this.recorder = new MediaRecorder(input.stream, input.recorderOptions);
    let resolveTerminal!: (artifact: FinalizedRecordingStagingArtifact) => void;
    let rejectTerminal!: (error: Error) => void;
    this.terminal = new Promise((resolve, reject) => {
      resolveTerminal = resolve;
      rejectTerminal = reject;
    });
    this.resolveTerminal = resolveTerminal;
    this.rejectTerminal = rejectTerminal;
    void this.terminal.catch(() => undefined);
    this.attachRecorderHandlers();
  }

  setLifecycleCallbacks(callbacks: RecordingArtifactLifecycleCallbacks): void {
    this.callbacks = callbacks;
  }

  start(): void {
    if (this.phase !== 'ready') {
      throw new Error(`Recording artifact session cannot start while ${this.phase}.`);
    }
    this.phase = 'starting';
    try {
      this.recorder.start(0);
    } catch (error) {
      this.fail(error);
      throw error;
    }
  }

  stop(): Promise<FinalizedRecordingStagingArtifact> {
    if (['finalized', 'finalizing', 'stopping'].includes(this.phase)) return this.terminal;
    if (this.failure || this.phase === 'failed' || this.phase === 'aborted') return this.terminal;
    if (this.phase === 'ready' || this.recorder.state === 'inactive') {
      this.fail(new Error(`Recording artifact session cannot stop while ${this.phase}.`));
      return this.terminal;
    }
    this.phase = 'stopping';
    try {
      this.recorder.requestData?.();
      this.recorder.stop();
    } catch (error) {
      this.fail(error);
    }
    return this.terminal;
  }

  abort(): Promise<void> {
    if (this.phase === 'finalized') return Promise.resolve();
    if (this.phase === 'aborted') return this.abortPromise ?? Promise.resolve();
    this.phase = 'aborted';
    this.rejectTerminalOnce(new Error(`Recording artifact ${this.input.artifactId} was aborted.`));
    this.detachHandlers();
    this.stopRecorderBestEffort();
    this.abortPromise ??= this.input.coordinator.abort();
    void this.abortPromise.catch(() => undefined);
    return this.abortPromise;
  }

  private attachRecorderHandlers(): void {
    this.recorder.ondataavailable = (event) => {
      if (!event.data || event.data.size === 0 || this.failure) return;
      void this.input.writer.append(event.data).catch((error: unknown) => this.fail(error));
    };
    this.recorder.onerror = (event) => {
      this.fail(getMediaRecorderError(event, 'The recording encoder failed.'));
    };
    this.recorder.onstart = () => this.handleStarted();
    this.recorder.onstop = () => this.handleStopped();
  }

  private handleStarted(): void {
    if (this.phase !== 'starting') return;
    this.phase = 'recording';
    try {
      this.callbacks.onStart?.();
    } catch (error) {
      this.fail(error);
    }
  }

  private handleStopped(): void {
    if (this.failure || this.phase === 'aborted' || this.phase === 'finalized') return;
    this.phase = 'finalizing';
    this.detachHandlers();
    void this.finalizeArtifact();
  }

  private async finalizeArtifact(): Promise<void> {
    try {
      const artifact = await this.input.writer.finalize();
      if (this.cannotCompleteFinalization()) return;
      if (artifact.size === 0) {
        throw new Error(`Recording ${this.input.artifactId} produced no media bytes.`);
      }
      await this.callbacks.onStop?.(artifact);
      if (this.cannotCompleteFinalization()) return;
      this.phase = 'finalized';
      this.resolveTerminalOnce(artifact);
    } catch (error) {
      this.fail(error);
    }
  }

  private fail(reason: unknown): void {
    if (this.failure || this.phase === 'finalized' || this.phase === 'aborted') return;
    this.failure = toError(reason);
    let terminalError: Error = this.failure;
    this.phase = 'failed';
    this.detachHandlers();
    this.stopRecorderBestEffort();
    try {
      this.callbacks.onFailure?.(this.failure);
    } catch (callbackError) {
      terminalError = new AggregateError(
        [this.failure, toError(callbackError)],
        'Recording failure handling also failed.'
      );
    }
    this.abortPromise ??= this.input.coordinator.abort();
    void this.abortPromise.catch(() => undefined);
    this.rejectTerminalOnce(terminalError);
  }

  private cannotCompleteFinalization(): boolean {
    return this.phase === 'aborted' || this.terminalSettled;
  }

  private detachHandlers(): void {
    this.recorder.ondataavailable = null;
    this.recorder.onerror = null;
    this.recorder.onstart = null;
    this.recorder.onstop = null;
  }

  private stopRecorderBestEffort(): void {
    if (this.recorder.state === 'inactive') return;
    try {
      this.recorder.stop();
    } catch {
      // The coordinator abort remains the terminal cleanup authority.
    }
  }

  private resolveTerminalOnce(artifact: FinalizedRecordingStagingArtifact): void {
    if (this.terminalSettled) return;
    this.terminalSettled = true;
    this.resolveTerminal(artifact);
  }

  private rejectTerminalOnce(error: Error): void {
    if (this.terminalSettled) return;
    this.terminalSettled = true;
    this.rejectTerminal(error);
  }
}

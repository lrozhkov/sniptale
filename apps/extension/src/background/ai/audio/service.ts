import {
  AUDIO_JOB_TIMEOUT_MS,
  isAudioSourceJobScope,
  parseAudioJobFailureCode,
  type AudioJobClientMessage,
  type AudioJobFailureCode,
  type AudioJobServerMessage,
  type AudioJobStart,
  type AudioStagedHandle,
} from '../../../contracts/ai/audio';
import {
  writeAudioStaging,
  readAudioStaging,
  discardAudioStaging,
} from '../../../composition/persistence/assets/audio-staging';
import {
  authorizeAudioJob,
  isAudioJobAllowedForConsumer,
  type AudioJobConsumer,
} from './authorization';
import { resolveAudioModelConfig, type AudioModelConfig } from './model-config';
import { requestAudio } from './request';
import { validateAudioUpload } from './response';

function failure(error: unknown): AudioJobFailureCode {
  return (error instanceof Error && parseAudioJobFailureCode(error.message)) || 'provider-failed';
}
interface AudioJobDependencies {
  authorize: typeof authorizeAudioJob;
  resolveModel: typeof resolveAudioModelConfig;
  request: typeof requestAudio;
  write: typeof writeAudioStaging;
  read: typeof readAudioStaging;
  discard: typeof discardAudioStaging;
  createId(): string;
}
type Send = (message: AudioJobServerMessage) => void;
interface Job {
  controller: AbortController;
  request: AudioJobStart;
  ticket: string;
  config?: AudioModelConfig;
  input?: AudioStagedHandle;
  output?: AudioStagedHandle;
  phase: 'authorizing' | 'ready' | 'running' | 'done';
  send: Send;
  timedOut: boolean;
  timer: ReturnType<typeof setTimeout>;
  flight: Promise<void>;
}

/** Owns all active operation transitions and resource cleanup, including erasure exclusion. */
class AudioJobCoordinator {
  private readonly jobs = new Set<Job>();
  private erasureReservations = 0;

  constructor(private readonly deps: AudioJobDependencies) {}

  private finish(job: Job): void {
    clearTimeout(job.timer);
    job.phase = 'done';
    delete job.config;
    this.jobs.delete(job);
  }

  private fail(job: Job, error: unknown): void {
    const code = job.timedOut
      ? 'timeout'
      : job.controller.signal.aborted
        ? 'cancelled'
        : failure(error);
    job.send({ type: 'failure', requestId: job.request.requestId, code });
  }

  private abort(job: Job): void {
    job.controller.abort();
    clearTimeout(job.timer);
    if (job.phase !== 'ready') return;
    this.finish(job);
    this.fail(job, undefined);
  }

  private async cleanup(job: Job): Promise<void> {
    if (job.input) await this.deps.discard(job.input, job.request.scope);
    delete job.input;
  }

  private async prepare(job: Job) {
    job.controller.signal.throwIfAborted();
    await this.deps.authorize(job.request);
    job.controller.signal.throwIfAborted();
    const config = await this.deps.resolveModel(job.request);
    if (!job.config || JSON.stringify(config) !== JSON.stringify(job.config))
      throw new Error('stale');
    const input = job.input ? await this.deps.read(job.input, job.request.scope) : undefined;
    const scope = job.request.scope;
    if (
      input &&
      (!isAudioSourceJobScope(scope) ||
        !(await validateAudioUpload(input, scope.nativeEnd - scope.nativeStart)))
    )
      throw new Error('invalid-request');
    job.controller.signal.throwIfAborted();
    await this.deps.authorize(job.request);
    job.controller.signal.throwIfAborted();
    return { config, ...(input ? { input } : {}) };
  }

  private async publish(job: Job, result: Awaited<ReturnType<typeof requestAudio>>): Promise<void> {
    if (result.kind === 'transcript') {
      job.send({ type: 'transcript', requestId: job.request.requestId, result: result.result });
      return;
    }
    try {
      job.output = await this.deps.write({
        id: this.deps.createId(),
        scope: job.request.scope,
        blob: result.blob,
        signal: job.controller.signal,
      });
    } catch {
      throw new Error('storage-failed');
    }
    job.controller.signal.throwIfAborted();
    job.send({ type: 'audio', requestId: job.request.requestId, staged: job.output });
  }

  private async execute(job: Job): Promise<void> {
    try {
      const prepared = await this.prepare(job);
      job.send({ type: 'progress', requestId: job.request.requestId, phase: 'requesting' });
      const result = await this.deps.request({
        request: job.request,
        ...prepared,
        signal: job.controller.signal,
        onReceiving: () =>
          job.send({ type: 'progress', requestId: job.request.requestId, phase: 'receiving' }),
      });
      job.controller.signal.throwIfAborted();
      await this.deps.authorize(job.request);
      job.controller.signal.throwIfAborted();
      await this.publish(job, result);
    } catch (error) {
      if (job.output) await this.deps.discard(job.output, job.request.scope).catch(() => undefined);
      this.fail(job, error);
    } finally {
      clearTimeout(job.timer);
      job.phase = 'done';
      delete job.config;
      // A cleanup failure keeps the job visible to the erasure barrier for retry.
      await this.cleanup(job);
      this.finish(job);
    }
  }

  private async authorize(job: Job): Promise<void> {
    try {
      await this.deps.authorize(job.request);
      job.controller.signal.throwIfAborted();
      job.config = await this.deps.resolveModel(job.request);
      job.controller.signal.throwIfAborted();
    } catch (error) {
      this.finish(job);
      this.fail(job, error);
      return;
    }
    if (job.request.operation === 'transcription') {
      job.phase = 'ready';
      job.send({
        type: 'authorized',
        requestId: job.request.requestId,
        ticket: job.ticket,
        scope: job.request.scope,
      });
      return;
    }
    job.phase = 'running';
    await this.execute(job);
  }

  private start(request: AudioJobStart, send: Send): Job {
    const job: Job = {
      controller: new AbortController(),
      request,
      ticket: this.deps.createId(),
      phase: 'authorizing',
      timedOut: false,
      send,
      flight: Promise.resolve(),
      timer: setTimeout(() => {
        job.timedOut = true;
        this.abort(job);
      }, AUDIO_JOB_TIMEOUT_MS),
    };
    this.jobs.add(job);
    send({ type: 'progress', requestId: request.requestId, phase: 'authorizing' });
    job.flight = this.authorize(job);
    void job.flight.catch(() => undefined);
    return job;
  }

  private acceptExecution(
    job: Job | undefined,
    message: Extract<AudioJobClientMessage, { type: 'execute' }>,
    send: Send
  ): void {
    if (
      !job ||
      job.phase !== 'ready' ||
      message.requestId !== job.request.requestId ||
      message.ticket !== job.ticket ||
      message.staged.id !== job.ticket
    ) {
      send({ type: 'failure', requestId: message.requestId, code: 'invalid-request' });
      if (job) this.abort(job);
      return;
    }
    job.input = message.staged;
    job.phase = 'running';
    job.flight = this.execute(job);
    void job.flight.catch(() => undefined);
  }

  connect(send: Send, consumer: AudioJobConsumer = 'gallery') {
    let job: Job | undefined;
    let closed = false;
    const emit: Send = (message) => {
      if (!closed) send(message);
    };
    return {
      receive: (message: AudioJobClientMessage): void => {
        if (closed) return;
        if (message.type === 'keepalive') {
          // Receipt keeps MV3 alive; it never creates work or renews the job deadline.
          if (!job || job.phase === 'done' || job.request.requestId !== message.requestId)
            emit({ type: 'failure', requestId: message.requestId, code: 'unauthorized' });
          return;
        }
        if (message.type === 'cancel') {
          if (job?.request.requestId === message.requestId) this.abort(job);
          return;
        }
        if (message.type === 'execute') {
          this.acceptExecution(job, message, emit);
          return;
        }
        if (
          !isAudioJobAllowedForConsumer(message, consumer) ||
          job ||
          this.erasureReservations > 0
        ) {
          emit({ type: 'failure', requestId: message.requestId, code: 'unauthorized' });
          return;
        }
        job = this.start(message, emit);
      },
      disconnect: async () => {
        closed = true;
        if (!job) return;
        this.abort(job);
        await job.flight.catch(() => undefined);
        await this.cleanup(job);
        this.jobs.delete(job);
      },
    };
  }

  reserveErasureExclusion() {
    this.erasureReservations += 1;
    let released = false;
    return {
      release: () => {
        if (!released) {
          released = true;
          this.erasureReservations -= 1;
        }
      },
      waitForActiveMutations: async () => {
        await Promise.all([...this.jobs].map((job) => job.flight));
      },
    };
  }

  async cancelActiveJob(): Promise<void> {
    const active = [...this.jobs];
    active.forEach((job) => this.abort(job));
    await Promise.all(
      active.map(async (job) => {
        await job.flight.catch(() => undefined);
        await this.cleanup(job);
        this.jobs.delete(job);
      })
    );
  }
}

/** Worker restart destroys every capability and never resumes a paid POST. */
export function createAudioJobService(
  overrides: Partial<AudioJobDependencies> = {}
): AudioJobService {
  return new AudioJobCoordinator({
    authorize: authorizeAudioJob,
    resolveModel: resolveAudioModelConfig,
    request: requestAudio,
    write: writeAudioStaging,
    read: readAudioStaging,
    discard: discardAudioStaging,
    createId: () => crypto.randomUUID(),
    ...overrides,
  });
}
export type AudioJobService = Pick<
  AudioJobCoordinator,
  'connect' | 'reserveErasureExclusion' | 'cancelActiveJob'
>;

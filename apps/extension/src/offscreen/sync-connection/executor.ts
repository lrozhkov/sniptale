import type { SyncProductExecutionInput, SyncProductExecutionResult } from './product-execution';
import type {
  SyncProductExecutorRequest,
  SyncProductResponse,
  SyncProductJobSnapshot,
  SyncProductCompletion,
} from '../../contracts/messaging/contracts/runtime-message/sync-connection.types';
import {
  sameConnectionScope,
  sameSyncConnectionIdentity,
} from '../../composition/persistence/remote-connection/model';
import type {
  SyncExecutorBinding,
  SyncExecutorJobSnapshot,
  SyncExecutorSnapshot,
  SyncInspectRequest,
  SyncInspectResponse,
  SyncStartRequest,
  SyncStartResponse,
  SyncStopRequest,
  SyncStopResponse,
  SyncWorkspaceStartRequest,
  SyncWorkspaceJobSnapshot,
} from '../../contracts/messaging/contracts/runtime-message/sync-connection.types';
import type {
  SyncWorkspaceSource,
  SyncConnectionAuthentication,
} from '../../composition/persistence/remote-connection/model';

const MAX_RETAINED_THUMBNAIL_BYTES = 4 * 1024 * 1024;

type TerminalSnapshot = Omit<
  SyncExecutorJobSnapshot,
  'operationId' | 'expectedRevision' | 'state'
> & {
  state: Exclude<SyncExecutorJobSnapshot['state'], 'running'>;
};

/** Terminal native outcome and the adapter's explicit resource containment result. */
export interface SyncExecutionResult {
  snapshot: TerminalSnapshot;
  containment: 'contained' | 'unsafe';
}

/** One immutable native selection; cancellation belongs to this document's job owner. */
export type SyncExecutionInput = SyncExecutorBinding & {
  operationId: string;
  expectedRevision: number;
  signal: AbortSignal;
  onProgress(progress: Pick<SyncExecutorJobSnapshot, 'stage' | 'runId'>): void;
};

/** The adapter owns requests and native operation locks until both promises have settled. */
export interface SyncExecutorExecution {
  run(): Promise<SyncExecutionResult>;
  drain(): Promise<void>;
}

/** One workspace selection; credentials belong only to the synchronously constructed handle. */
export interface SyncWorkspaceExecutionInput {
  source: SyncWorkspaceSource;
  authentication: SyncConnectionAuthentication;
}

/** Safe terminal projection and explicit resource containment. */
export interface SyncWorkspaceExecutionResult {
  snapshot: Pick<SyncWorkspaceJobSnapshot, 'failureCode'> & {
    state: Exclude<SyncWorkspaceJobSnapshot['state'], 'running'>;
  };
  containment: 'contained' | 'unsafe';
}

interface WorkspaceJob {
  snapshot: SyncWorkspaceJobSnapshot;
  source: SyncWorkspaceSource;
  execution: { run(): Promise<SyncWorkspaceExecutionResult>; drain(): Promise<void> };
  completion: Promise<void>;
  active: boolean;
  unsafe: boolean;
  stopped: boolean;
}

/** All execution authority is injected; the disposable executor never opens durable storage. */
export interface SyncExecutorPorts {
  onSettled?(requestId: string, kind: 'product' | 'workspace'): void;
  executorId: string;
  offscreenStartupId: string;
  createExecution(input: SyncExecutionInput): SyncExecutorExecution;
  createWorkspaceExecution(input: SyncWorkspaceExecutionInput): WorkspaceJob['execution'];
  createProductExecution?(input: SyncProductExecutionInput): {
    run(): Promise<SyncProductExecutionResult>;
    drain(): Promise<void>;
  };
}

interface ProductJob {
  snapshot: SyncProductJobSnapshot;
  work: SyncProductExecutionInput['work'];
  controller: AbortController;
  execution: { run(): Promise<SyncProductExecutionResult>; drain(): Promise<void> };
  completion: Promise<void>;
  result: SyncProductCompletion | null;
  active: boolean;
  unsafe: boolean;
}
interface Job {
  snapshot: SyncExecutorJobSnapshot;
  controller: AbortController;
  execution: SyncExecutorExecution | null;
  completion: Promise<void>;
  active: boolean;
  unsafe: boolean;
}

function sameBinding(left: SyncExecutorBinding, right: SyncExecutorBinding) {
  return (
    sameConnectionScope(left.scope, right.scope) &&
    sameSyncConnectionIdentity(left.authorization, right.authorization)
  );
}

function matchesTarget(
  request: Pick<SyncStopRequest, 'offscreenStartupId' | 'executorId' | 'executorRevision'>,
  ports: Pick<SyncExecutorPorts, 'offscreenStartupId' | 'executorId'>,
  revision: number | null
): boolean {
  return (
    request.offscreenStartupId === ports.offscreenStartupId &&
    request.executorId === ports.executorId &&
    request.executorRevision === revision
  );
}

const refused = () => ({ success: false as const, error: 'Sync executor command refused' });

class SyncConnectionExecutor {
  readonly #ports: SyncExecutorPorts;

  constructor(ports: SyncExecutorPorts) {
    this.#ports = ports;
  }

  #settled(requestId: string | undefined, kind: 'product' | 'workspace') {
    if (!requestId) return;
    try {
      this.#ports.onSettled?.(requestId, kind);
    } catch {
      // Advisory delivery cannot change an accounted execution outcome.
    }
  }
  #jobs = new Map<string, Job>();
  #binding: SyncExecutorBinding | null = null;
  #workspace: WorkspaceJob | null = null;
  #products = new Map<string, ProductJob>();
  #stoppedWorkspaceIncarnations = new Set<string>();
  #executorRevision = 1;
  #phase: SyncExecutorSnapshot['phase'] = 'idle';
  #stopping: Promise<SyncStopResponse> | null = null;
  #stopRevision: number | null = null;
  #foregroundAdmission = false;

  #snapshot(): SyncExecutorSnapshot {
    return structuredClone({
      offscreenStartupId: this.#ports.offscreenStartupId,
      executorId: this.#ports.executorId,
      executorRevision: this.#executorRevision,
      phase: this.#phase,
      binding: this.#binding,
      workspace: this.#workspace?.snapshot ?? null,
      ...(this.#products.size
        ? { products: [...this.#products.values()].map((item) => item.snapshot) }
        : {}),
      jobs: [...this.#jobs.values()].map((job) => job.snapshot),
    });
  }

  #failed(job: Job | WorkspaceJob) {
    job.unsafe = true;
    job.snapshot.state = 'failed';
    job.snapshot.failureCode = 'internal';
    this.#phase = 'failed';
  }

  async #run(job: Job, selected: SyncExecutorBinding) {
    try {
      // Stop can reserve before this detached workflow starts.
      if (job.controller.signal.aborted) {
        job.snapshot.state = 'interrupted';
        job.snapshot.failureCode = 'interrupted';
        return;
      }
      job.execution = this.#ports.createExecution({
        ...structuredClone(selected),
        operationId: job.snapshot.operationId,
        expectedRevision: job.snapshot.expectedRevision,
        signal: job.controller.signal,
        onProgress(progress) {
          if (!job.active || job.controller.signal.aborted) return;
          job.snapshot.stage = progress.stage;
          job.snapshot.runId = progress.runId;
        },
      });
      const result = await job.execution.run();
      if (result.containment === 'unsafe') this.#failed(job);
      else if (!job.controller.signal.aborted) Object.assign(job.snapshot, result.snapshot);
      else {
        job.snapshot.state = 'interrupted';
        job.snapshot.failureCode = 'interrupted';
      }
    } catch {
      this.#failed(job);
    } finally {
      job.active = false;
      if (
        this.#phase === 'running' &&
        ![...this.#jobs.values()].some((item) => item.active) &&
        ![...this.#products.values()].some((item) => item.active)
      )
        this.#phase = 'idle';
    }
  }

  async #runWorkspace(job: WorkspaceJob) {
    try {
      if (job.stopped) {
        job.snapshot.state = 'interrupted';
        job.snapshot.failureCode = 'interrupted';
        return;
      }
      const result = await job.execution.run();
      if (result.containment === 'unsafe') this.#failed(job);
      else if (!job.stopped) Object.assign(job.snapshot, result.snapshot);
      else {
        job.snapshot.state = 'interrupted';
        job.snapshot.failureCode = 'interrupted';
      }
    } catch {
      this.#failed(job);
    } finally {
      job.active = false;
      if (this.#phase === 'running') this.#phase = 'idle';
      if (!job.stopped) this.#settled(job.snapshot.requestId, 'workspace');
    }
  }

  startWorkspace(request: SyncWorkspaceStartRequest): SyncStartResponse {
    if (
      !matchesTarget(request, this.#ports, this.#executorRevision) ||
      this.#stopping ||
      this.#phase === 'stopping' ||
      this.#phase === 'failed' ||
      this.#stoppedWorkspaceIncarnations.has(
        JSON.stringify([request.source.kind, request.source.identity.incarnation])
      ) ||
      [...this.#products.values()].some((item) => item.active || item.unsafe) ||
      [...this.#jobs.values()].some((job) => job.active || job.unsafe)
    )
      return refused();
    if (this.#workspace?.active) {
      if (
        this.#workspace.source.kind !== request.source.kind ||
        !sameSyncConnectionIdentity(this.#workspace.source.identity, request.source.identity)
      )
        return refused();
      return {
        success: true,
        result: 'accepted',
        executorId: this.#ports.executorId,
        executorRevision: this.#executorRevision,
      };
    }
    if (this.#workspace?.unsafe) return refused();
    let execution: WorkspaceJob['execution'];
    try {
      execution = this.#ports.createWorkspaceExecution({
        source: structuredClone(request.source),
        authentication: structuredClone(request.authentication),
      });
    } catch {
      return refused();
    }
    const job: WorkspaceJob = {
      source: structuredClone(request.source),
      snapshot: {
        requestId: request.requestId,
        sourceKind: request.source.kind,
        selectionIncarnation: request.source.identity.incarnation,
        selectionRevision: request.source.identity.revision,
        state: 'running',
        failureCode: null,
      },
      execution,
      completion: Promise.resolve(),
      active: true,
      unsafe: false,
      stopped: false,
    };
    this.#binding = null;
    this.#jobs.clear();
    this.#workspace = job;
    this.#executorRevision += 1;
    this.#phase = 'running';
    job.completion = Promise.resolve().then(() => this.#runWorkspace(job));
    return {
      success: true,
      result: 'accepted',
      executorId: this.#ports.executorId,
      executorRevision: this.#executorRevision,
    };
  }

  #admitQueueBinding(request: SyncStartRequest): SyncExecutorBinding | null {
    if (
      !matchesTarget(request, this.#ports, this.#executorRevision) ||
      this.#stopping ||
      this.#phase === 'stopping' ||
      this.#phase === 'failed' ||
      this.#workspace?.active ||
      this.#workspace?.unsafe ||
      [...this.#products.values()].some((item) => item.unsafe)
    )
      return null;
    if (this.#workspace) {
      this.#workspace = null;
      this.#phase = 'idle';
    }
    const selected = structuredClone({
      scope: request.scope,
      authorization: request.authorization,
    });
    const changed = !this.#binding || !sameBinding(this.#binding, selected);
    if (this.#phase === 'stopped' && !changed) return null;
    if (changed) {
      if (
        [...this.#products.values()].some((item) => item.active || item.unsafe) ||
        [...this.#jobs.values()].some((job) => job.active || job.unsafe)
      )
        return null;
      // A changed scope alone cannot reopen a stopped native authorization.
      if (
        this.#phase === 'stopped' &&
        this.#binding &&
        sameSyncConnectionIdentity(this.#binding.authorization, selected.authorization)
      )
        return null;
      this.#binding = structuredClone(selected);
      this.#executorRevision += 1;
      this.#jobs.clear();
      this.#phase = 'idle';
    }
    return selected;
  }

  start(request: SyncStartRequest): SyncStartResponse {
    const selected = this.#admitQueueBinding(request);
    if (!selected) return refused();
    const previous = this.#jobs.get(request.operationId);
    if (previous) {
      if (previous.snapshot.expectedRevision === request.expectedRevision)
        return {
          success: true,
          result: 'accepted',
          executorId: this.#ports.executorId,
          executorRevision: this.#executorRevision,
        };
      if (
        previous.active ||
        previous.unsafe ||
        request.expectedRevision < previous.snapshot.expectedRevision
      )
        return refused();
    }
    if ([...this.#jobs.values()].filter((job) => job.active).length >= 2) return refused();
    if (!previous && this.#jobs.size >= 128) {
      const retired = [...this.#jobs.entries()].find(([, job]) => !job.active && !job.unsafe);
      if (!retired) return refused();
      this.#jobs.delete(retired[0]);
    }
    const job: Job = {
      snapshot: {
        operationId: request.operationId,
        expectedRevision: request.expectedRevision,
        state: 'running',
        stage: 'preparing',
        failureCode: null,
        runId: null,
      },
      controller: new AbortController(),
      execution: null,
      completion: Promise.resolve(),
      active: true,
      unsafe: false,
    };
    this.#jobs.set(request.operationId, job);
    this.#phase = 'running';
    job.completion = Promise.resolve().then(() => this.#run(job, selected));
    return {
      success: true,
      result: 'accepted',
      executorId: this.#ports.executorId,
      executorRevision: this.#executorRevision,
    };
  }

  inspect(request: SyncInspectRequest): SyncInspectResponse {
    if (request.offscreenStartupId !== this.#ports.offscreenStartupId) return refused();
    return { success: true, challenge: request.challenge, snapshot: this.#snapshot() };
  }

  stop(request: SyncStopRequest): Promise<SyncStopResponse> {
    if (this.#stopping && matchesTarget(request, this.#ports, this.#stopRevision))
      return this.#stopping;
    if (
      this.#stopping ||
      this.#phase === 'stopping' ||
      !matchesTarget(request, this.#ports, this.#executorRevision)
    )
      return Promise.resolve(refused());
    this.#stopRevision = this.#executorRevision;
    this.#executorRevision += 1;
    this.#phase = 'stopping';
    const pending = [...this.#jobs.values()];
    const pendingWorkspace = this.#workspace;
    const pendingProducts = [...this.#products.values()];
    const activeProducts = pendingProducts.filter((item) => item.active);
    const workspaceWasActive = pendingWorkspace?.active ?? false;
    const unsafeProducts = new Set(pendingProducts.filter((item) => item.unsafe));
    const productDrains = pendingProducts.map((item) => {
      item.controller.abort();
      try {
        const drain = item.execution.drain();
        void drain.catch(() => undefined);
        return drain;
      } catch (error) {
        const drain = Promise.reject(error);
        void drain.catch(() => undefined);
        return drain;
      }
    });
    const workspaceWasUnsafe = pendingWorkspace?.unsafe ?? false;
    let workspaceDrain: Promise<void> | null = null;
    if (pendingWorkspace) {
      pendingWorkspace.stopped = true;
      this.#stoppedWorkspaceIncarnations.add(
        JSON.stringify([
          pendingWorkspace.snapshot.sourceKind,
          pendingWorkspace.snapshot.selectionIncarnation,
        ])
      );
      // Close admission and abort issued IO before Stop yields to any detached run.
      try {
        workspaceDrain = pendingWorkspace.execution.drain();
      } catch (error) {
        workspaceDrain = Promise.reject(error);
      }
      void workspaceDrain.catch(() => undefined);
    }
    const unsafeBeforeStop = new Set(pending.filter((job) => job.unsafe));
    for (const job of pending) job.controller.abort();
    this.#stopping = (async (): Promise<SyncStopResponse> => {
      // Allow reserved detached jobs to install their handles or observe cancellation.
      await Promise.resolve();
      const drained = await Promise.allSettled(
        pending.map(async (job) => {
          if (job.execution) await job.execution.drain();
        })
      );
      const workspaceDrained = await Promise.allSettled(workspaceDrain ? [workspaceDrain] : []);
      const productDrained = await Promise.allSettled(productDrains);
      await Promise.all(pendingProducts.map((item) => item.completion));
      await Promise.all(pending.map((job) => job.completion));
      if (pendingWorkspace) await pendingWorkspace.completion;
      let contained = true;
      for (let index = 0; index < pending.length; index += 1) {
        const job = pending[index]!;
        if (
          drained[index]?.status === 'rejected' ||
          (job.unsafe && (!job.execution || !unsafeBeforeStop.has(job)))
        ) {
          this.#failed(job);
          contained = false;
        } else job.unsafe = false;
      }
      if (pendingWorkspace) {
        if (
          workspaceDrained[0]?.status === 'rejected' ||
          (pendingWorkspace.unsafe && !workspaceWasUnsafe)
        ) {
          this.#failed(pendingWorkspace);
          contained = false;
        } else pendingWorkspace.unsafe = false;
      }
      for (const [index, item] of pendingProducts.entries()) {
        if (
          productDrained[index]?.status === 'rejected' ||
          (item.unsafe && !unsafeProducts.has(item))
        ) {
          item.unsafe = true;
          this.#phase = 'failed';
          contained = false;
        } else item.unsafe = false;
      }
      if (contained) this.#phase = 'stopped';
      for (const item of activeProducts) this.#settled(item.snapshot.requestId, 'product');
      if (workspaceWasActive) this.#settled(pendingWorkspace?.snapshot.requestId, 'workspace');
      if (!contained) return refused();
      return {
        success: true,
        result: 'stopped',
        executorId: this.#ports.executorId,
        executorRevision: this.#executorRevision,
      };
    })().finally(() => {
      this.#stopping = null;
    });
    return this.#stopping;
  }

  #productAdmissionClosed(): boolean {
    return this.#stopping !== null || this.#phase === 'stopping' || this.#phase === 'failed';
  }
  #refuseProduct(): SyncProductResponse {
    return { success: false, error: 'Sync product command refused' };
  }

  #inspectProduct(product: ProductJob | undefined): SyncProductResponse {
    const result: SyncProductResponse = {
      success: true,
      result: {
        kind: 'operation',
        job: product ? structuredClone(product.snapshot) : null,
        completion: product ? structuredClone(product.result) : null,
      },
    };
    // A preview is an advisory one-shot handoff. Lost responses may fall back or request it again.
    if (product?.result?.kind === 'thumbnail') product.result = null;
    return result;
  }

  async #cancelWorkspace(operationRequestId: string): Promise<SyncProductResponse> {
    const chosen = this.#workspace;
    if (!chosen || chosen.snapshot.requestId !== operationRequestId)
      return { success: true, result: { kind: 'cancelled', outcome: 'refused' } };
    if (!chosen.active)
      return { success: true, result: { kind: 'cancelled', outcome: 'already-completed' } };
    chosen.stopped = true;
    this.#stoppedWorkspaceIncarnations.add(
      JSON.stringify([chosen.source.kind, chosen.source.identity.incarnation])
    );
    try {
      await chosen.execution.drain();
      await chosen.completion;
    } catch {
      this.#failed(chosen);
      this.#settled(chosen.snapshot.requestId, 'workspace');
      return this.#refuseProduct();
    }
    this.#settled(chosen.snapshot.requestId, 'workspace');
    return chosen.unsafe
      ? this.#refuseProduct()
      : { success: true, result: { kind: 'cancelled', outcome: 'cancelled' } };
  }

  async #cancelProduct(
    selected: ProductJob | undefined,
    operationRequestId: string
  ): Promise<SyncProductResponse> {
    if (!selected || selected.snapshot.requestId !== operationRequestId)
      return this.#cancelWorkspace(operationRequestId);
    if (!selected.active)
      return { success: true, result: { kind: 'cancelled', outcome: 'already-completed' } };
    selected.controller.abort();
    try {
      await selected.execution.drain();
      await selected.completion;
    } catch {
      selected.unsafe = true;
      this.#phase = 'failed';
      this.#settled(selected.snapshot.requestId, 'product');
      return this.#refuseProduct();
    }
    this.#settled(selected.snapshot.requestId, 'product');
    if (selected.unsafe) return this.#refuseProduct();
    return {
      success: true,
      result: {
        kind: 'cancelled',
        outcome: selected.snapshot.state === 'ready' ? 'already-completed' : 'cancelled',
      },
    };
  }

  #canStartProduct(
    command: Extract<SyncProductExecutorRequest['command'], { kind: 'start' }>
  ): boolean {
    if (
      this.#foregroundAdmission ||
      !this.#ports.createProductExecution ||
      [...this.#products.values()].some((item) => item.unsafe) ||
      (command.work.kind !== 'thumbnail-read' &&
        [...this.#products.values()].some(
          (item) => item.active && item.work.kind !== 'thumbnail-read'
        )) ||
      ([...this.#products.values()].filter(
        (item) => item.active && item.work.kind === 'thumbnail-read'
      ).length >= 16 &&
        command.work.kind === 'thumbnail-read') ||
      this.#workspace?.active ||
      this.#workspace?.unsafe ||
      (this.#phase === 'stopped' &&
        this.#binding &&
        sameSyncConnectionIdentity(this.#binding.authorization, command.binding.authorization))
    )
      return false;
    if (
      this.#binding &&
      !sameBinding(this.#binding, command.binding) &&
      ([...this.#jobs.values()].some((job) => job.active || job.unsafe) ||
        [...this.#products.values()].some((item) => item.active || item.unsafe))
    )
      return false;
    return true;
  }

  async #containPreviews(): Promise<boolean> {
    const thumbnails = [...this.#products.values()].filter(
      (item) => item.active && item.work.kind === 'thumbnail-read'
    );
    this.#foregroundAdmission = true;
    try {
      for (const item of thumbnails) item.controller.abort();
      await Promise.all(
        thumbnails.map(async (item) => {
          await item.execution.drain();
          await item.completion;
          this.#settled(item.snapshot.requestId, 'product');
          if (item.unsafe) throw new Error('Sync thumbnail containment failed');
        })
      );
    } catch {
      this.#phase = 'failed';
      return false;
    } finally {
      this.#foregroundAdmission = false;
    }
    return true;
  }

  #trimThumbnailCompletions(): void {
    // Bound encoded handoff strings independently of the Gallery resource cache and status count.
    // Account for JavaScript's two-byte string storage; older preview outcomes can fall back.
    let retainedBytes = 0;
    for (const item of this.#products.values())
      if (item.result?.kind === 'thumbnail')
        retainedBytes += (item.result.dataUrl?.length ?? 0) * 2;
    for (const item of this.#products.values()) {
      if (retainedBytes <= MAX_RETAINED_THUMBNAIL_BYTES) break;
      if (item.result?.kind === 'thumbnail') {
        retainedBytes -= (item.result.dataUrl?.length ?? 0) * 2;
        item.result = null;
      }
    }
  }

  async #runProduct(selected: ProductJob): Promise<void> {
    const { controller, execution } = selected;
    try {
      if (controller.signal.aborted) {
        selected.snapshot.state = 'interrupted';
        selected.snapshot.failureCode = 'interrupted';
        return;
      }
      const result = await execution.run();
      selected.unsafe = result.containment === 'unsafe';
      selected.snapshot.state = result.state;
      selected.snapshot.failureCode = result.failureCode;
      selected.result = result.completion;
      this.#trimThumbnailCompletions();
      if (selected.unsafe) this.#phase = 'failed';
    } catch {
      selected.unsafe = true;
      selected.snapshot.state = 'failed';
      selected.snapshot.failureCode = 'internal';
      this.#phase = 'failed';
    } finally {
      selected.active = false;
      if (
        this.#phase === 'running' &&
        ![...this.#jobs.values()].some((job) => job.active) &&
        ![...this.#products.values()].some((item) => item.active)
      )
        this.#phase = 'idle';
      if (!controller.signal.aborted) this.#settled(selected.snapshot.requestId, 'product');
    }
  }

  async #startProduct(
    command: Extract<SyncProductExecutorRequest['command'], { kind: 'start' }>
  ): Promise<SyncProductResponse> {
    if (!this.#ports.createProductExecution) return this.#refuseProduct();
    const controller = new AbortController();
    let execution: ProductJob['execution'];
    try {
      execution = this.#ports.createProductExecution({
        ...structuredClone(command.binding),
        work: structuredClone(command.work),
        signal: controller.signal,
      });
    } catch {
      return this.#refuseProduct();
    }
    this.#binding = structuredClone(command.binding);
    const selected: ProductJob = {
      snapshot: {
        requestId: command.operationRequestId,
        kind: command.work.kind,
        state: 'running',
        failureCode: null,
      },
      work: structuredClone(command.work),
      controller,
      execution,
      completion: Promise.resolve(),
      result: null,
      active: true,
      unsafe: false,
    };
    if (this.#products.size >= 128) {
      const retired = [...this.#products.entries()].find(
        ([, item]) => !item.active && !item.unsafe
      );
      if (!retired) {
        controller.abort();
        await execution.drain();
        return this.#refuseProduct();
      }
      this.#products.delete(retired[0]);
    }
    this.#products.set(command.operationRequestId, selected);
    this.#phase = 'running';
    selected.completion = Promise.resolve().then(() => this.#runProduct(selected));
    return { success: true, result: { kind: 'accepted', requestId: command.operationRequestId } };
  }

  async productCommand(request: SyncProductExecutorRequest): Promise<SyncProductResponse> {
    if (
      !matchesTarget(request, this.#ports, this.#executorRevision) ||
      this.#productAdmissionClosed()
    )
      return this.#refuseProduct();
    const command = request.command;
    const product = this.#products.get(command.operationRequestId);
    if (command.kind === 'inspect') return this.#inspectProduct(product);
    if (command.kind === 'cancel') return this.#cancelProduct(product, command.operationRequestId);
    if (product?.snapshot.requestId === command.operationRequestId)
      return JSON.stringify(product.work) === JSON.stringify(command.work)
        ? { success: true, result: { kind: 'accepted', requestId: command.operationRequestId } }
        : this.#refuseProduct();
    if (!this.#canStartProduct(command)) return this.#refuseProduct();
    if (command.work.kind !== 'thumbnail-read') {
      if (!(await this.#containPreviews())) return this.#refuseProduct();
      // Stop may reserve while preview drainage or its continuation is pending.
      if (
        !matchesTarget(request, this.#ports, this.#executorRevision) ||
        this.#productAdmissionClosed()
      )
        return this.#refuseProduct();
    }
    return this.#startProduct(command);
  }
}

/** Reserve commands synchronously, then own execution independently from the response channel. */
export function createSyncConnectionExecutor(ports: SyncExecutorPorts) {
  const executor = new SyncConnectionExecutor(ports);
  return {
    start: executor.start.bind(executor),
    startWorkspace: executor.startWorkspace.bind(executor),
    inspect: executor.inspect.bind(executor),
    stop: executor.stop.bind(executor),
    productCommand: executor.productCommand.bind(executor),
  };
}

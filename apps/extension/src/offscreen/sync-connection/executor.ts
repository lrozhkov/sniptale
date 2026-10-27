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
  SyncConnectionIdentity,
  SyncConnectionAuthentication,
} from '../../composition/persistence/remote-connection/model';

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
  allocation: SyncConnectionIdentity;
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
  execution: { run(): Promise<SyncWorkspaceExecutionResult>; drain(): Promise<void> };
  completion: Promise<void>;
  active: boolean;
  unsafe: boolean;
  stopped: boolean;
}

/** All execution authority is injected; the disposable executor never opens durable storage. */
export interface SyncExecutorPorts {
  executorId: string;
  offscreenStartupId: string;
  createExecution(input: SyncExecutionInput): SyncExecutorExecution;
  createWorkspaceExecution(input: SyncWorkspaceExecutionInput): WorkspaceJob['execution'];
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
  request: SyncStartRequest | SyncWorkspaceStartRequest | SyncStopRequest,
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

/** Reserve commands synchronously, then own execution independently from the response channel. */
export function createSyncConnectionExecutor(ports: SyncExecutorPorts) {
  const jobs = new Map<string, Job>();
  let binding: SyncExecutorBinding | null = null;
  let workspace: WorkspaceJob | null = null;
  const stoppedWorkspaceIncarnations = new Set<string>();
  let executorRevision = 1;
  let phase: SyncExecutorSnapshot['phase'] = 'idle';
  let stopping: Promise<SyncStopResponse> | null = null;
  let stopRevision: number | null = null;

  function snapshot(): SyncExecutorSnapshot {
    return structuredClone({
      offscreenStartupId: ports.offscreenStartupId,
      executorId: ports.executorId,
      executorRevision,
      phase,
      binding,
      workspace: workspace?.snapshot ?? null,
      jobs: [...jobs.values()].map((job) => job.snapshot),
    });
  }

  function failed(job: Job | WorkspaceJob) {
    job.unsafe = true;
    job.snapshot.state = 'failed';
    job.snapshot.failureCode = 'internal';
    phase = 'failed';
  }

  async function run(job: Job, selected: SyncExecutorBinding) {
    try {
      // Stop can reserve before this detached workflow starts.
      if (job.controller.signal.aborted) {
        job.snapshot.state = 'interrupted';
        job.snapshot.failureCode = 'interrupted';
        return;
      }
      job.execution = ports.createExecution({
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
      if (result.containment === 'unsafe') failed(job);
      else if (!job.controller.signal.aborted) Object.assign(job.snapshot, result.snapshot);
      else {
        job.snapshot.state = 'interrupted';
        job.snapshot.failureCode = 'interrupted';
      }
    } catch {
      failed(job);
    } finally {
      job.active = false;
      if (phase === 'running' && ![...jobs.values()].some((item) => item.active)) phase = 'idle';
    }
  }

  async function runWorkspace(job: WorkspaceJob) {
    try {
      if (job.stopped) {
        job.snapshot.state = 'interrupted';
        job.snapshot.failureCode = 'interrupted';
        return;
      }
      const result = await job.execution.run();
      if (result.containment === 'unsafe') failed(job);
      else if (!job.stopped) Object.assign(job.snapshot, result.snapshot);
      else {
        job.snapshot.state = 'interrupted';
        job.snapshot.failureCode = 'interrupted';
      }
    } catch {
      failed(job);
    } finally {
      job.active = false;
      if (phase === 'running') phase = 'idle';
    }
  }

  function startWorkspace(request: SyncWorkspaceStartRequest): SyncStartResponse {
    if (
      !matchesTarget(request, ports, executorRevision) ||
      stopping ||
      phase === 'stopping' ||
      phase === 'failed' ||
      stoppedWorkspaceIncarnations.has(request.allocation.incarnation) ||
      [...jobs.values()].some((job) => job.active || job.unsafe)
    )
      return refused();
    if (workspace?.active) {
      if (
        workspace.snapshot.allocationIncarnation !== request.allocation.incarnation ||
        workspace.snapshot.selectionRevision !== request.allocation.revision
      )
        return refused();
      return { success: true, result: 'accepted', executorId: ports.executorId, executorRevision };
    }
    if (workspace?.unsafe) return refused();
    let execution: WorkspaceJob['execution'];
    try {
      execution = ports.createWorkspaceExecution({
        allocation: structuredClone(request.allocation),
        authentication: structuredClone(request.authentication),
      });
    } catch {
      return refused();
    }
    const job: WorkspaceJob = {
      snapshot: {
        allocationIncarnation: request.allocation.incarnation,
        selectionRevision: request.allocation.revision,
        state: 'running',
        failureCode: null,
      },
      execution,
      completion: Promise.resolve(),
      active: true,
      unsafe: false,
      stopped: false,
    };
    binding = null;
    jobs.clear();
    workspace = job;
    executorRevision += 1;
    phase = 'running';
    job.completion = Promise.resolve().then(() => runWorkspace(job));
    return { success: true, result: 'accepted', executorId: ports.executorId, executorRevision };
  }

  function start(request: SyncStartRequest): SyncStartResponse {
    if (
      !matchesTarget(request, ports, executorRevision) ||
      stopping ||
      phase === 'stopping' ||
      phase === 'failed' ||
      workspace?.active ||
      workspace?.unsafe
    )
      return refused();
    if (workspace) {
      workspace = null;
      phase = 'idle';
    }
    const selected = structuredClone({
      scope: request.scope,
      authorization: request.authorization,
    });
    const changed = !binding || !sameBinding(binding, selected);
    if (phase === 'stopped' && !changed) return refused();
    if (changed) {
      if ([...jobs.values()].some((job) => job.active || job.unsafe)) return refused();
      // A changed scope alone cannot reopen a stopped native authorization.
      if (
        phase === 'stopped' &&
        binding &&
        sameSyncConnectionIdentity(binding.authorization, selected.authorization)
      )
        return refused();
      binding = structuredClone(selected);
      executorRevision += 1;
      jobs.clear();
      phase = 'idle';
    }
    const previous = jobs.get(request.operationId);
    if (previous) {
      if (previous.snapshot.expectedRevision === request.expectedRevision)
        return {
          success: true,
          result: 'accepted',
          executorId: ports.executorId,
          executorRevision,
        };
      if (
        previous.active ||
        previous.unsafe ||
        request.expectedRevision < previous.snapshot.expectedRevision
      )
        return refused();
    }
    if ([...jobs.values()].filter((job) => job.active).length >= 2) return refused();
    if (!previous && jobs.size >= 128) {
      const retired = [...jobs.entries()].find(([, job]) => !job.active && !job.unsafe);
      if (!retired) return refused();
      jobs.delete(retired[0]);
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
    jobs.set(request.operationId, job);
    phase = 'running';
    job.completion = Promise.resolve().then(() => run(job, selected));
    return { success: true, result: 'accepted', executorId: ports.executorId, executorRevision };
  }

  function inspect(request: SyncInspectRequest): SyncInspectResponse {
    if (request.offscreenStartupId !== ports.offscreenStartupId) return refused();
    return { success: true, challenge: request.challenge, snapshot: snapshot() };
  }

  function stop(request: SyncStopRequest): Promise<SyncStopResponse> {
    if (stopping && matchesTarget(request, ports, stopRevision)) return stopping;
    if (stopping || phase === 'stopping' || !matchesTarget(request, ports, executorRevision))
      return Promise.resolve(refused());
    stopRevision = executorRevision;
    executorRevision += 1;
    phase = 'stopping';
    const pending = [...jobs.values()];
    const pendingWorkspace = workspace;
    const workspaceWasUnsafe = pendingWorkspace?.unsafe ?? false;
    let workspaceDrain: Promise<void> | null = null;
    if (pendingWorkspace) {
      pendingWorkspace.stopped = true;
      stoppedWorkspaceIncarnations.add(pendingWorkspace.snapshot.allocationIncarnation);
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
    stopping = (async (): Promise<SyncStopResponse> => {
      // Allow reserved detached jobs to install their handles or observe cancellation.
      await Promise.resolve();
      const drained = await Promise.allSettled(
        pending.map(async (job) => {
          if (job.execution) await job.execution.drain();
        })
      );
      const workspaceDrained = await Promise.allSettled(workspaceDrain ? [workspaceDrain] : []);
      await Promise.all(pending.map((job) => job.completion));
      if (pendingWorkspace) await pendingWorkspace.completion;
      let contained = true;
      for (let index = 0; index < pending.length; index += 1) {
        const job = pending[index]!;
        if (
          drained[index]?.status === 'rejected' ||
          (job.unsafe && (!job.execution || !unsafeBeforeStop.has(job)))
        ) {
          failed(job);
          contained = false;
        } else job.unsafe = false;
      }
      if (pendingWorkspace) {
        if (
          workspaceDrained[0]?.status === 'rejected' ||
          (pendingWorkspace.unsafe && !workspaceWasUnsafe)
        ) {
          failed(pendingWorkspace);
          contained = false;
        } else pendingWorkspace.unsafe = false;
      }
      if (!contained) return refused();
      phase = 'stopped';
      return { success: true, result: 'stopped', executorId: ports.executorId, executorRevision };
    })().finally(() => {
      stopping = null;
    });
    return stopping;
  }

  return { start, startWorkspace, inspect, stop };
}

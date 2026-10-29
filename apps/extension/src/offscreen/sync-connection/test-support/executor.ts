import { expect, vi } from 'vitest';
import { parseSyncExecutorSnapshot } from '../../../contracts/messaging/contracts/runtime/sync-connection';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type {
  SyncExecutorBinding,
  SyncExecutorSnapshot,
  SyncInspectRequest,
  SyncStartRequest,
  SyncStopRequest,
  SyncWorkspaceStartRequest,
} from '../../../contracts/messaging/contracts/runtime-message/sync-connection.types';
import {
  createSyncConnectionExecutor,
  type SyncExecutorExecution,
  type SyncExecutorPorts,
  type SyncWorkspaceExecutionResult,
} from '../executor';

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const executorId = '11111111-1111-4111-8111-111111111111';
const offscreenStartupId = '22222222-2222-4222-8222-222222222222';
export const base = {
  executorId,
  offscreenStartupId,
  capabilityToken: 'test-capability',
  requestId: '33333333-3333-4333-8333-333333333333',
};
export const binding: SyncExecutorBinding = {
  scope: { spaceId: 'space', connectionGeneration: 1, profileCreatedAt: 1 },
  authorization: { incarnation: '44444444-4444-4444-8444-444444444444', revision: 1 },
};
type ExecutionResult = Awaited<ReturnType<SyncExecutorExecution['run']>>;
export const published: ExecutionResult = {
  containment: 'contained',
  snapshot: { state: 'published', stage: 'published', failureCode: null, runId: null },
};

export function fixture(
  createProductExecution?: SyncExecutorPorts['createProductExecution'],
  onSettled?: SyncExecutorPorts['onSettled']
) {
  const pending: Array<{
    input: Parameters<SyncExecutorPorts['createExecution']>[0];
    result: ReturnType<typeof deferred<ExecutionResult>>;
    drainage: ReturnType<typeof deferred<void>>;
    drain: ReturnType<typeof vi.fn<() => Promise<void>>>;
  }> = [];
  const createExecution = vi.fn<SyncExecutorPorts['createExecution']>((input) => {
    const result = deferred<ExecutionResult>();
    const drainage = deferred<void>();
    const drain = vi.fn(() => drainage.promise);
    pending.push({ input, result, drainage, drain });
    return { run: () => result.promise, drain };
  });
  const workspacePending: Array<{
    result: ReturnType<typeof deferred<SyncWorkspaceExecutionResult>>;
    drainage: ReturnType<typeof deferred<void>>;
    run: ReturnType<typeof vi.fn<() => Promise<SyncWorkspaceExecutionResult>>>;
    drain: ReturnType<typeof vi.fn<() => Promise<void>>>;
  }> = [];
  const createWorkspaceExecution = vi.fn<SyncExecutorPorts['createWorkspaceExecution']>(() => {
    const result = deferred<SyncWorkspaceExecutionResult>();
    const drainage = deferred<void>();
    const run = vi.fn(() => result.promise);
    const drain = vi.fn(() => drainage.promise);
    workspacePending.push({ result, drainage, run, drain });
    return { run, drain };
  });
  const executor = createSyncConnectionExecutor({
    executorId,
    offscreenStartupId,
    createExecution,
    createWorkspaceExecution,
    ...(onSettled ? { onSettled } : {}),
    ...(createProductExecution ? { createProductExecution } : {}),
  });
  const inspectRequest: SyncInspectRequest = {
    ...base,
    type: MessageType.OFFSCREEN_SYNC_INSPECT,
    challenge: '55555555-5555-4555-8555-555555555555',
  };
  function inspect(): SyncExecutorSnapshot {
    const answer = executor.inspect(inspectRequest);
    if (!answer.success) throw new Error('Inspect refused.');
    expect(parseSyncExecutorSnapshot(answer.snapshot)).not.toBeNull();
    return answer.snapshot;
  }
  function start(operationId = 'operation', overrides: Partial<SyncStartRequest> = {}) {
    return executor.start({
      ...base,
      ...binding,
      type: MessageType.OFFSCREEN_SYNC_START,
      executorRevision: inspect().executorRevision,
      operationId,
      expectedRevision: 1,
      ...overrides,
    });
  }
  function stop(overrides: Partial<SyncStopRequest> = {}) {
    return executor.stop({
      ...base,
      type: MessageType.OFFSCREEN_SYNC_STOP,
      executorRevision: inspect().executorRevision,
      ...overrides,
    });
  }
  function startWorkspace(overrides: Partial<SyncWorkspaceStartRequest> = {}) {
    return executor.startWorkspace({
      ...base,
      type: MessageType.OFFSCREEN_SYNC_WORKSPACE_START,
      executorRevision: inspect().executorRevision,
      source: { kind: 'allocation', identity: binding.authorization },
      authentication: { kind: 'bearer', accessToken: 'workspace-private-token' },
      ...overrides,
    });
  }
  return {
    executor,
    createExecution,
    createWorkspaceExecution,
    workspacePending,
    startWorkspace,
    pending,
    inspect,
    start,
    stop,
    inspectRequest,
  };
}

export async function settleWorkflow() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

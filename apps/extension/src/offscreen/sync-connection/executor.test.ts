import { describe, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type {
  SyncExecutorBinding,
  SyncExecutorSnapshot,
  SyncInspectRequest,
  SyncStartRequest,
  SyncStopRequest,
} from '../../contracts/messaging/contracts/runtime-message/sync-connection.types';
import {
  createSyncConnectionExecutor,
  type SyncExecutorExecution,
  type SyncExecutorPorts,
} from './executor';

function deferred<T>() {
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
const base = {
  executorId,
  offscreenStartupId,
  capabilityToken: 'test-capability',
  requestId: '33333333-3333-4333-8333-333333333333',
};
const binding: SyncExecutorBinding = {
  scope: { spaceId: 'space', connectionGeneration: 1, profileCreatedAt: 1 },
  authorization: { incarnation: '44444444-4444-4444-8444-444444444444', revision: 1 },
};
type ExecutionResult = Awaited<ReturnType<SyncExecutorExecution['run']>>;
const published: ExecutionResult = {
  containment: 'contained',
  snapshot: { state: 'published', stage: 'published', failureCode: null, runId: null },
};

function fixture() {
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
  const executor = createSyncConnectionExecutor({
    executorId,
    offscreenStartupId,
    createExecution,
  });
  const inspectRequest: SyncInspectRequest = {
    ...base,
    type: MessageType.OFFSCREEN_SYNC_INSPECT,
    challenge: '55555555-5555-4555-8555-555555555555',
  };
  function inspect(): SyncExecutorSnapshot {
    const answer = executor.inspect(inspectRequest);
    if (!answer.success) throw new Error('Inspect refused.');
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
  return { executor, createExecution, pending, inspect, start, stop, inspectRequest };
}

async function settleWorkflow() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('disposable sync executor', () => {
  it('acknowledges Start before workflow IO and inspects without waiting for it', async () => {
    const test = fixture();
    expect(test.start()).toMatchObject({ success: true, result: 'accepted', executorRevision: 2 });
    expect(test.createExecution).not.toHaveBeenCalled();
    await settleWorkflow();
    expect(test.inspect()).toMatchObject({ phase: 'running', executorRevision: 2 });
    expect(test.inspect().jobs[0]?.state).toBe('running');
    test.pending[0]!.result.resolve(published);
    await settleWorkflow();
    expect(test.inspect()).toMatchObject({ phase: 'idle', jobs: [{ state: 'published' }] });
  });

  it('does not duplicate replayed selections and admits only two independent operations', async () => {
    const test = fixture();
    expect(test.start('one').success).toBe(true);
    expect(test.start('one').success).toBe(true);
    expect(test.start('two').success).toBe(true);
    expect(test.start('three').success).toBe(false);
    expect(test.start('one', { expectedRevision: 2 }).success).toBe(false);
    expect(test.inspect().executorRevision).toBe(2);
    await settleWorkflow();
    expect(test.createExecution).toHaveBeenCalledTimes(2);
    for (const item of test.pending) item.result.resolve(published);
    await settleWorkflow();
    expect(test.start('one').success).toBe(true);
    await settleWorkflow();
    expect(test.createExecution).toHaveBeenCalledTimes(2);
    expect(test.start('one', { expectedRevision: 2 }).success).toBe(true);
    await settleWorkflow();
    expect(test.createExecution).toHaveBeenCalledTimes(3);
    expect(test.start('one', { expectedRevision: 1 }).success).toBe(false);
    test.pending[2]!.result.resolve(published);
    await settleWorkflow();
  });

  it('reserves idle Stop synchronously and refuses a delayed Start', async () => {
    const test = fixture();
    const stopped = test.stop();
    expect(test.inspect()).toMatchObject({ phase: 'stopping', executorRevision: 2 });
    expect(test.start('late', { executorRevision: 1 }).success).toBe(false);
    expect(await stopped).toMatchObject({ success: true, executorRevision: 2 });
    expect(test.createExecution).not.toHaveBeenCalled();
  });

  it('cancels a reserved Start before its detached workflow starts', async () => {
    const test = fixture();
    test.start();
    const stopped = test.stop();
    expect(await stopped).toMatchObject({ success: true });
    expect(test.createExecution).not.toHaveBeenCalled();
    expect(test.inspect().jobs[0]?.state).toBe('interrupted');
  });

  it('aborts all jobs and waits for every request/body drain and native workflow lock', async () => {
    const test = fixture();
    test.start('one');
    test.start('two');
    await settleWorkflow();
    let finished = false;
    const stopped = test.stop().then((answer) => {
      finished = true;
      return answer;
    });
    expect(test.pending.every((job) => job.input.signal.aborted)).toBe(true);
    await settleWorkflow();
    expect(test.pending.every((job) => job.drain.mock.calls.length === 1)).toBe(true);
    test.pending[0]!.drainage.resolve();
    test.pending[0]!.result.resolve(published);
    test.pending[1]!.drainage.resolve();
    await settleWorkflow();
    expect(finished).toBe(false);
    expect(test.inspect().phase).toBe('stopping');
    test.pending[1]!.result.resolve(published);
    expect(await stopped).toMatchObject({ success: true });
    expect(test.inspect().jobs.every((job) => job.state === 'interrupted')).toBe(true);
  });

  it('retains failed containment and retries explicit drainage without reopening work', async () => {
    const test = fixture();
    test.start();
    await settleWorkflow();
    const job = test.pending[0]!;
    const stopped = test.stop();
    job.drainage.reject(new Error('Native body cancellation failed.'));
    job.result.resolve(published);
    expect(await stopped).toMatchObject({ success: false });
    expect(test.inspect()).toMatchObject({
      phase: 'failed',
      jobs: [{ state: 'failed', failureCode: 'internal' }],
    });
    expect(test.start().success).toBe(false);
    job.drain.mockResolvedValue(undefined);
    expect(await test.stop()).toMatchObject({ success: true });
    expect(job.drain).toHaveBeenCalledTimes(2);
    expect(test.start().success).toBe(false);
  });

  it('coalesces duplicate Stop and refuses a second reservation during drainage', async () => {
    const test = fixture();
    test.start();
    await settleWorkflow();
    const observed = test.inspect().executorRevision;
    const stopped = test.stop();
    const replay = test.stop({ executorRevision: observed });
    expect(replay).toBe(stopped);
    expect(await test.stop()).toMatchObject({ success: false });
    await settleWorkflow();
    expect(test.pending[0]!.drain).toHaveBeenCalledTimes(1);
    test.pending[0]!.drainage.resolve();
    test.pending[0]!.result.resolve(published);
    expect(await stopped).toMatchObject({ success: true });
  });

  it('does not silently contain an unexpected workflow rejection after an earlier successful drain', async () => {
    const test = fixture();
    test.start();
    await settleWorkflow();
    const stopped = test.stop();
    test.pending[0]!.drainage.resolve();
    await settleWorkflow();
    test.pending[0]!.result.reject(new Error('Unexpected adapter failure.'));
    expect(await stopped).toMatchObject({ success: false });
    expect(test.inspect().phase).toBe('failed');
    expect(await test.stop()).toMatchObject({ success: true });
  });

  it('leaves unsafe workflow results visible until explicit drainage succeeds', async () => {
    const test = fixture();
    test.start();
    await settleWorkflow();
    test.pending[0]!.result.resolve({ ...published, containment: 'unsafe' });
    await settleWorkflow();
    expect(test.inspect().phase).toBe('failed');
    expect(test.inspect().jobs[0]?.state).toBe('failed');
    const stopped = test.stop();
    test.pending[0]!.drainage.resolve();
    expect(await stopped).toMatchObject({ success: true });
  });

  it('ignores late callbacks and results after Stop and refuses obsolete Stop after native recreation', async () => {
    const test = fixture();
    test.start();
    await settleWorkflow();
    const oldRevision = test.inspect().executorRevision;
    const old = test.pending[0]!;
    const stopped = test.stop();
    old.input.onProgress({ stage: 'publishing', runId: null });
    expect(test.inspect().jobs[0]?.stage).toBe('preparing');
    old.drainage.resolve();
    old.result.resolve(published);
    await stopped;
    expect(test.start().success).toBe(false);
    const replacement = {
      ...binding.authorization,
      incarnation: '66666666-6666-4666-8666-666666666666',
    };
    expect(test.start('new', { authorization: replacement }).success).toBe(true);
    await settleWorkflow();
    const before = test.inspect();
    old.input.onProgress({ stage: 'published', runId: null });
    expect(await test.stop({ executorRevision: oldRevision })).toMatchObject({ success: false });
    expect(test.inspect()).toEqual(before);
    expect(test.pending[1]!.input.signal.aborted).toBe(false);
    test.pending[1]!.result.resolve(published);
    await settleWorkflow();
  });

  it('refuses binding replacement while a native job is live', async () => {
    const test = fixture();
    test.start();
    const authorization = { ...binding.authorization, revision: 2 };
    expect(test.start('replacement', { authorization }).success).toBe(false);
    await settleWorkflow();
    test.pending[0]!.result.resolve(published);
    await settleWorkflow();
    expect(test.start('replacement', { authorization }).success).toBe(true);
    await settleWorkflow();
    test.pending[1]!.result.resolve(published);
    await settleWorkflow();
  });

  it('keeps active snapshots when the bounded terminal history expires', async () => {
    const test = fixture();
    test.start('held');
    await settleWorkflow();
    for (let index = 0; index < 130; index += 1) {
      expect(test.start(`terminal-${index}`).success).toBe(true);
      await settleWorkflow();
      test.pending[index + 1]!.result.resolve(published);
      await settleWorkflow();
    }
    const live = test.inspect();
    expect(live.jobs).toHaveLength(128);
    expect(live.jobs.find((job) => job.operationId === 'held')?.state).toBe('running');
    test.pending[0]!.result.resolve(published);
    await settleWorkflow();
  });

  it('returns isolated snapshots and checks exact document and executor identity', async () => {
    const test = fixture();
    test.start();
    const copy = test.inspect();
    copy.jobs.splice(0);
    copy.binding!.authorization.revision = 100;
    expect(test.inspect().jobs).toHaveLength(1);
    expect(test.inspect().binding?.authorization.revision).toBe(1);
    expect(
      test.executor.inspect({ ...test.inspectRequest, offscreenStartupId: 'old' }).success
    ).toBe(false);
    expect(test.start('wrong', { executorId: 'old' }).success).toBe(false);
    expect(await test.stop({ executorId: 'old' })).toMatchObject({ success: false });
    await settleWorkflow();
    test.pending[0]!.result.resolve(published);
    await settleWorkflow();
  });
});

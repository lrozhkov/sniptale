import { describe, expect, it, vi } from 'vitest';
import type { SyncWorkspaceExecutionResult } from './executor';
import { base, binding, fixture, published, settleWorkflow } from './test-support/executor';

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

describe('workspace slot in the shared sync executor', () => {
  const ready: SyncWorkspaceExecutionResult = {
    snapshot: { state: 'ready', failureCode: null },
    containment: 'contained',
  };

  it('constructs a credential-owning handle before ACK and inspects held IO without exposing credentials', async () => {
    const test = fixture();
    expect(test.startWorkspace()).toMatchObject({ success: true, executorRevision: 2 });
    expect(test.createWorkspaceExecution).toHaveBeenCalledOnce();
    expect(test.workspacePending[0]!.run).not.toHaveBeenCalled();
    expect(test.inspect()).toMatchObject({
      phase: 'running',
      binding: null,
      jobs: [],
      workspace: {
        sourceKind: 'allocation',
        selectionIncarnation: binding.authorization.incarnation,
        selectionRevision: 1,
        state: 'running',
        failureCode: null,
      },
    });
    expect(JSON.stringify(test.inspect())).not.toContain('workspace-private-token');
    expect(JSON.stringify(test.inspect())).not.toContain('authentication');
    await settleWorkflow();
    expect(test.workspacePending[0]!.run).toHaveBeenCalledOnce();
    test.workspacePending[0]!.result.resolve(ready);
    await settleWorkflow();
    expect(test.inspect().workspace?.state).toBe('ready');
  });

  it('joins exact active selections and refuses changed selections and queue overlap', async () => {
    const test = fixture();
    expect(test.startWorkspace().success).toBe(true);
    expect(test.startWorkspace().success).toBe(true);
    expect(
      test.startWorkspace({
        source: { kind: 'allocation', identity: { ...binding.authorization, revision: 2 } },
      }).success
    ).toBe(false);
    expect(test.start().success).toBe(false);
    expect(test.createWorkspaceExecution).toHaveBeenCalledOnce();
    await settleWorkflow();
    test.workspacePending[0]!.result.resolve(ready);
    await settleWorkflow();
    expect(test.start().success).toBe(true);
    expect(test.inspect().workspace).toBeNull();
    expect(test.startWorkspace().success).toBe(false);
    await settleWorkflow();
    test.pending[0]!.result.resolve(published);
    await settleWorkflow();
    expect(test.startWorkspace().success).toBe(true);
    expect(test.inspect().binding).toBeNull();
    expect(test.inspect().jobs).toEqual([]);
    await settleWorkflow();
    test.workspacePending[1]!.result.resolve(ready);
    await settleWorkflow();
  });

  it('isolates CREATE and JOIN admission even when their native identities match', async () => {
    const test = fixture();
    expect(test.startWorkspace().success).toBe(true);
    expect(
      test.startWorkspace({ source: { kind: 'join', identity: binding.authorization } }).success
    ).toBe(false);
    const stopped = test.stop();
    test.workspacePending[0]!.drainage.resolve();
    await stopped;
    expect(
      test.startWorkspace({
        source: { kind: 'allocation', identity: { ...binding.authorization, revision: 2 } },
      }).success
    ).toBe(false);
    expect(
      test.startWorkspace({ source: { kind: 'join', identity: binding.authorization } }).success
    ).toBe(true);
    expect(test.inspect().workspace).toMatchObject({
      sourceKind: 'join',
      selectionIncarnation: binding.authorization.incarnation,
    });
    expect(
      test.startWorkspace({ source: { kind: 'join', identity: binding.authorization } }).success
    ).toBe(true);
    expect(test.startWorkspace().success).toBe(false);
    await settleWorkflow();
    test.workspacePending[1]!.result.resolve(ready);
    await settleWorkflow();
    expect(test.inspect().workspace?.state).toBe('ready');
  });

  it('closes a reserved handle synchronously before the detached workspace can run', async () => {
    const test = fixture();
    test.startWorkspace();
    const stopped = test.stop();
    expect(test.workspacePending[0]!.drain).toHaveBeenCalledOnce();
    expect(test.startWorkspace().success).toBe(false);
    test.workspacePending[0]!.drainage.resolve();
    expect(await stopped).toMatchObject({ success: true });
    expect(test.workspacePending[0]!.run).not.toHaveBeenCalled();
    expect(test.inspect().workspace?.state).toBe('interrupted');
    expect(test.startWorkspace().success).toBe(false);
    expect(
      test.startWorkspace({
        source: {
          kind: 'allocation',
          identity: {
            ...binding.authorization,
            incarnation: '66666666-6666-4666-8666-666666666666',
          },
        },
      }).success
    ).toBe(true);
    await settleWorkflow();
    test.workspacePending[1]!.result.resolve(ready);
    await settleWorkflow();
  });

  it('waits for both workspace IO drain and workflow settlement before stopped', async () => {
    const test = fixture();
    test.startWorkspace();
    await settleWorkflow();
    let finished = false;
    const stopped = test.stop().then((response) => {
      finished = true;
      return response;
    });
    test.workspacePending[0]!.drainage.resolve();
    await settleWorkflow();
    expect(finished).toBe(false);
    expect(test.inspect().phase).toBe('stopping');
    test.workspacePending[0]!.result.resolve(ready);
    expect(await stopped).toMatchObject({ success: true });
    expect(test.inspect().workspace?.state).toBe('interrupted');
  });

  it('retains unsafe workspace containment and refuses all new execution', async () => {
    const test = fixture();
    test.startWorkspace();
    await settleWorkflow();
    const stopped = test.stop();
    test.workspacePending[0]!.drainage.reject(new Error('Private cancellation failure'));
    test.workspacePending[0]!.result.resolve({ ...ready, containment: 'unsafe' });
    expect(await stopped).toMatchObject({ success: false });
    expect(test.inspect()).toMatchObject({
      phase: 'failed',
      workspace: { state: 'failed', failureCode: 'internal' },
    });
    expect(test.start().success).toBe(false);
    expect(test.startWorkspace().success).toBe(false);
  });

  it('permits an explicit fresh command after contained failure with the current native revision', async () => {
    const test = fixture();
    test.startWorkspace();
    await settleWorkflow();
    test.workspacePending[0]!.result.resolve({
      snapshot: { state: 'failed', failureCode: 'temporary' },
      containment: 'contained',
    });
    await settleWorkflow();
    expect(
      test.startWorkspace({
        source: { kind: 'allocation', identity: { ...binding.authorization, revision: 4 } },
      }).success
    ).toBe(true);
    expect(test.inspect().workspace?.selectionRevision).toBe(4);
    await settleWorkflow();
    test.workspacePending[1]!.result.resolve(ready);
    await settleWorkflow();
  });

  it('refuses a factory failure before accepted acknowledgement without retaining secrets', () => {
    const test = fixture();
    test.createWorkspaceExecution.mockImplementationOnce(() => {
      throw new Error('private-token');
    });
    expect(test.startWorkspace().success).toBe(false);
    expect(test.inspect()).toMatchObject({ phase: 'idle', workspace: null, executorRevision: 1 });
  });
});

it('publishes failed workspace accounting and waits for workspace cancellation containment', async () => {
  const onSettled = vi.fn();
  const f = fixture(undefined, onSettled);
  f.startWorkspace();
  await settleWorkflow();
  f.workspacePending[0]!.result.resolve({
    containment: 'contained',
    snapshot: { state: 'failed', failureCode: 'temporary' },
  });
  await settleWorkflow();
  expect(onSettled).toHaveBeenCalledExactlyOnceWith(base.requestId, 'workspace');

  const g = fixture(undefined, onSettled);
  onSettled.mockClear();
  g.startWorkspace();
  await settleWorkflow();
  const stopped = g.stop();
  g.workspacePending[0]!.result.resolve({
    containment: 'contained',
    snapshot: { state: 'failed', failureCode: 'interrupted' },
  });
  await settleWorkflow();
  expect(onSettled).not.toHaveBeenCalled();
  g.workspacePending[0]!.drainage.resolve();
  await stopped;
  expect(onSettled).toHaveBeenCalledExactlyOnceWith(base.requestId, 'workspace');
});

it('announces a published queue operation after releasing its execution slot', async () => {
  const onSettled = vi.fn(() => {
    expect(f.inspect().jobs[0]?.state).toBe('published');
    expect(f.inspect().phase).toBe('idle');
  });
  const f = fixture(undefined, onSettled);
  f.start('bounded-native-operation');
  await settleWorkflow();
  f.pending[0]!.result.resolve(published);
  await settleWorkflow();
  expect(onSettled).toHaveBeenCalledExactlyOnceWith('bounded-native-operation', 'queue');
});

it('does not announce failed queue work or a published result arriving after Stop', async () => {
  const onSettled = vi.fn();
  const f = fixture(undefined, onSettled);
  f.start();
  await settleWorkflow();
  f.pending[0]!.result.resolve({
    containment: 'contained',
    snapshot: { state: 'failed', stage: 'writing', failureCode: 'temporary', runId: null },
  });
  await settleWorkflow();
  expect(onSettled).not.toHaveBeenCalled();
  f.start('second');
  await settleWorkflow();
  const stopped = f.stop();
  f.pending[1]!.result.resolve(published);
  f.pending[0]!.drainage.resolve();
  f.pending[1]!.drainage.resolve();
  await stopped;
  expect(onSettled).not.toHaveBeenCalled();
});

it('retains the exact lock cause while draining an admitted queue execution', async () => {
  const test = fixture();
  test.start();
  await settleWorkflow();
  const job = test.pending[0]!;
  const stopped = test.stop({ reason: 'secrets-locked' });
  expect(job.input.signal.aborted).toBe(true);
  expect(job.input.signal.reason).toMatchObject({ code: 'secrets-locked' });
  job.drainage.resolve();
  job.result.resolve(published);
  await expect(stopped).resolves.toMatchObject({ success: true });
  expect(test.inspect()).toMatchObject({
    phase: 'stopped',
    jobs: [{ state: 'failed', failureCode: 'secrets-locked' }],
  });
});

describe('workspace discovery execution', () => {
  function discovered(): SyncWorkspaceExecutionResult {
    return {
      containment: 'contained',
      snapshot: {
        state: 'discovered',
        failureCode: null,
        discovery: {
          source: { kind: 'join', identity: { ...binding.authorization, revision: 2 } },
          scope: 'exact',
          complete: true,
          candidates: [
            {
              prefix: '',
              identity: {
                spaceId: '55555555-5555-4555-8555-555555555555',
                bootstrapId: '66666666-6666-4666-8666-666666666666',
                fingerprint: 'a'.repeat(64),
              },
            },
          ],
          issues: [],
        },
      },
    };
  }
  it('forwards discovery before ACK and publishes its advanced source instead of ready', async () => {
    const test = fixture();
    expect(
      test.startWorkspace({
        source: { kind: 'join', identity: binding.authorization },
        operation: 'discover',
      }).success
    ).toBe(true);
    expect(test.createWorkspaceExecution).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'discover' })
    );
    expect(
      test.startWorkspace({ source: { kind: 'join', identity: binding.authorization } }).success
    ).toBe(false);
    await settleWorkflow();
    test.workspacePending[0]!.result.resolve(discovered());
    await settleWorkflow();
    expect(test.inspect().workspace).toMatchObject({
      state: 'discovered',
      selectionRevision: 2,
      discovery: { source: { kind: 'join', identity: { ...binding.authorization, revision: 2 } } },
    });
    expect(JSON.stringify(test.inspect())).not.toContain('workspace-private-token');
  });
  it('refuses allocation discovery before constructing an execution handle', () => {
    const test = fixture();
    expect(test.startWorkspace({ operation: 'discover' }).success).toBe(false);
    expect(test.createWorkspaceExecution).not.toHaveBeenCalled();
  });
  it('does not publish a late discovered result after Stop and drains before allowing replacement', async () => {
    const test = fixture();
    test.startWorkspace({
      source: { kind: 'join', identity: binding.authorization },
      operation: 'discover',
    });
    await settleWorkflow();
    const stopping = test.stop();
    test.workspacePending[0]!.result.resolve(discovered());
    await settleWorkflow();
    expect(test.inspect().workspace?.state).toBe('interrupted');
    test.workspacePending[0]!.drainage.resolve();
    await stopping;
    expect(test.inspect().workspace).not.toHaveProperty('discovery');
  });
  it.each(['replacement', 'same-revision', 'unsafe'] as const)(
    'refuses %s discovery evidence without retaining its payload',
    async (change) => {
      const test = fixture();
      test.startWorkspace({
        source: { kind: 'join', identity: binding.authorization },
        operation: 'discover',
      });
      await settleWorkflow();
      const result = discovered();
      if (result.snapshot.state !== 'discovered') throw new Error('Discovery missing');
      if (change === 'replacement')
        result.snapshot.discovery.source.identity.incarnation =
          '77777777-7777-4777-8777-777777777777';
      if (change === 'same-revision') result.snapshot.discovery.source.identity.revision = 1;
      if (change === 'unsafe') result.containment = 'unsafe';
      test.workspacePending[0]!.result.resolve(result);
      await settleWorkflow();
      expect(test.inspect().workspace).toMatchObject({ state: 'failed', failureCode: 'internal' });
      expect(test.inspect().workspace).not.toHaveProperty('discovery');
      expect(test.start().success).toBe(false);
    }
  );
  it('refuses discovered evidence returned by a prepare execution', async () => {
    const test = fixture();
    test.startWorkspace({ source: { kind: 'join', identity: binding.authorization } });
    await settleWorkflow();
    test.workspacePending[0]!.result.resolve(discovered());
    await settleWorkflow();
    expect(test.inspect().workspace).toMatchObject({ state: 'failed', failureCode: 'internal' });
    expect(test.inspect().workspace).not.toHaveProperty('discovery');
  });
});

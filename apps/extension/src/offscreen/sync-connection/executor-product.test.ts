import { describe, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type {
  SyncExecutorSnapshot,
  SyncProductExecutorRequest,
} from '../../contracts/messaging/contracts/runtime-message/sync-connection.types';
import type { SyncExecutorPorts } from './executor';
import {
  base,
  binding,
  deferred,
  fixture,
  published,
  settleWorkflow,
} from './test-support/executor';

describe('named product execution containment', () => {
  function productFixture(onSettled?: SyncExecutorPorts['onSettled']) {
    const result = deferred<import('./product-execution').SyncProductExecutionResult>();
    const drainage = deferred<void>();
    const drain = vi.fn(() => drainage.promise);
    let signal: AbortSignal | null = null;
    const create = vi.fn<NonNullable<SyncExecutorPorts['createProductExecution']>>((input) => {
      signal = input.signal;
      return { run: () => result.promise, drain };
    });
    const f = fixture(create, onSettled);
    const operationRequestId = '88888888-8888-4888-8888-888888888888';
    function command(command: SyncProductExecutorRequest['command']) {
      return f.executor.productCommand({
        ...base,
        type: MessageType.OFFSCREEN_SYNC_PRODUCT_COMMAND,
        executorRevision: f.inspect().executorRevision,
        command,
      });
    }
    const start = () =>
      command({
        kind: 'start',
        operationRequestId,
        binding,
        work: { kind: 'catalog-refresh', bypassCache: false },
      });
    return {
      ...f,
      result,
      drainage,
      drain,
      create,
      startProduct: start,
      command,
      operationRequestId,
      aborted: () => signal?.aborted,
    };
  }
  const ready = {
    state: 'ready' as const,
    failureCode: null,
    completion: { kind: 'catalog' as const, count: 3 },
    containment: 'contained' as const,
  };
  it('publishes terminal product state after accounting and contains notification failure', async () => {
    let observed: SyncExecutorSnapshot | undefined;
    const onSettled = vi.fn<NonNullable<SyncExecutorPorts['onSettled']>>(() => {
      observed = f.inspect();
      throw new Error('notification unavailable');
    });
    const f = productFixture(onSettled);
    await f.startProduct();
    expect(onSettled).not.toHaveBeenCalled();
    f.result.resolve(ready);
    await settleWorkflow();
    expect(onSettled).toHaveBeenCalledExactlyOnceWith(f.operationRequestId, 'product');
    expect(observed).toMatchObject({ phase: 'idle', products: [{ state: 'ready' }] });
    expect(f.inspect().phase).toBe('idle');
  });

  it('publishes cancellation only after the independently held containment drain', async () => {
    const onSettled = vi.fn();
    const f = productFixture(onSettled);
    await f.startProduct();
    const cancelling = f.command({ kind: 'cancel', operationRequestId: f.operationRequestId });
    f.result.resolve({
      state: 'interrupted',
      failureCode: 'interrupted',
      completion: null,
      containment: 'contained',
    });
    await settleWorkflow();
    expect(onSettled).not.toHaveBeenCalled();
    f.drainage.resolve();
    await cancelling;
    expect(onSettled).toHaveBeenCalledExactlyOnceWith(f.operationRequestId, 'product');
    expect(f.inspect().products?.[0]?.state).toBe('interrupted');
  });

  it('acknowledges and deduplicates one named selection while its native work is pending', async () => {
    const f = productFixture();
    await expect(f.startProduct()).resolves.toMatchObject({
      success: true,
      result: { kind: 'accepted' },
    });
    await expect(f.startProduct()).resolves.toMatchObject({
      success: true,
      result: { kind: 'accepted' },
    });
    expect(f.create).toHaveBeenCalledTimes(1);
    await expect(
      f.command({ kind: 'inspect', operationRequestId: f.operationRequestId })
    ).resolves.toMatchObject({ result: { job: { state: 'running' }, completion: null } });
    f.result.resolve(ready);
    await settleWorkflow();
    await expect(
      f.command({ kind: 'inspect', operationRequestId: f.operationRequestId })
    ).resolves.toMatchObject({
      result: { job: { state: 'ready' }, completion: { kind: 'catalog', count: 3 } },
    });
  });
  it('target cancellation waits for request drain and native settlement without aborting outgoing', async () => {
    const f = productFixture();
    f.start('outgoing');
    await settleWorkflow();
    await f.startProduct();
    let settled = false;
    const cancellation = f
      .command({ kind: 'cancel', operationRequestId: f.operationRequestId })
      .then((value) => {
        settled = true;
        return value;
      });
    expect(f.aborted()).toBe(true);
    expect(f.pending[0]!.input.signal.aborted).toBe(false);
    f.drainage.resolve();
    await settleWorkflow();
    expect(settled).toBe(false);
    f.result.resolve({
      state: 'interrupted',
      failureCode: 'interrupted',
      completion: null,
      containment: 'contained',
    });
    await expect(cancellation).resolves.toMatchObject({
      result: { kind: 'cancelled', outcome: 'cancelled' },
    });
    f.pending[0]!.result.resolve(published);
    await settleWorkflow();
  });
  it('reports a completed native commit when cancellation races committed publication', async () => {
    const f = productFixture();
    await f.startProduct();
    const cancelled = f.command({ kind: 'cancel', operationRequestId: f.operationRequestId });
    f.drainage.resolve();
    f.result.resolve(ready);
    await expect(cancelled).resolves.toMatchObject({ result: { outcome: 'already-completed' } });
  });
  it('privacy stop synchronously closes product admission and waits for both native and IO containment', async () => {
    const f = productFixture();
    await f.startProduct();
    let settled = false;
    const stopped = f.stop().then((value) => {
      settled = true;
      return value;
    });
    expect(f.aborted()).toBe(true);
    expect(f.drain).toHaveBeenCalledTimes(1);
    f.drainage.resolve();
    await settleWorkflow();
    expect(settled).toBe(false);
    f.result.resolve({
      state: 'interrupted',
      failureCode: 'interrupted',
      completion: null,
      containment: 'contained',
    });
    await expect(stopped).resolves.toMatchObject({ success: true, result: 'stopped' });
  });
  it('retains unsafe product containment and refuses a replacement workflow', async () => {
    const f = productFixture();
    await f.startProduct();
    f.result.resolve({ ...ready, containment: 'unsafe' });
    await settleWorkflow();
    await expect(
      f.command({
        kind: 'start',
        operationRequestId: '99999999-9999-4999-8999-999999999999',
        binding,
        work: { kind: 'catalog-refresh', bypassCache: true },
      })
    ).resolves.toMatchObject({ success: false });
  });
});

it('user preparation aborts and drains only previews before admission while outgoing remains active', async () => {
  const thumbnail = deferred<import('./product-execution').SyncProductExecutionResult>();
  const thumbnailDrain = deferred<void>();
  const preparation = deferred<import('./product-execution').SyncProductExecutionResult>();
  const thumbnailSignals: AbortSignal[] = [];
  const create = vi.fn<NonNullable<SyncExecutorPorts['createProductExecution']>>((input) => {
    if (input.work.kind === 'thumbnail-read') {
      thumbnailSignals.push(input.signal);
      return { run: () => thumbnail.promise, drain: () => thumbnailDrain.promise };
    }
    return { run: () => preparation.promise, drain: async () => undefined };
  });
  const f = fixture(create);
  f.start('outgoing');
  await settleWorkflow();
  const selection = {
    rootKind: 'video-project' as const,
    rootId: 'project',
    operationId: 'version',
    sourceDigest: 'a'.repeat(64),
  };
  const preview = {
    ...base,
    type: MessageType.OFFSCREEN_SYNC_PRODUCT_COMMAND,
    executorRevision: f.inspect().executorRevision,
    command: {
      kind: 'start' as const,
      operationRequestId: '88888888-8888-4888-8888-888888888888',
      binding,
      work: { kind: 'thumbnail-read' as const, selection },
    },
  } satisfies SyncProductExecutorRequest;
  await f.executor.productCommand(preview);
  const selected = f.executor.productCommand({
    ...preview,
    command: {
      ...preview.command,
      operationRequestId: '99999999-9999-4999-8999-999999999999',
      work: { kind: 'replica-prepare', selection },
    },
  });
  expect(thumbnailSignals[0]?.aborted).toBe(true);
  expect(f.pending[0]!.input.signal.aborted).toBe(false);
  expect(create).toHaveBeenCalledTimes(1);
  thumbnailDrain.resolve();
  thumbnail.resolve({
    state: 'interrupted',
    failureCode: 'interrupted',
    completion: null,
    containment: 'contained',
  });
  await expect(selected).resolves.toMatchObject({ success: true, result: { kind: 'accepted' } });
  expect(create).toHaveBeenCalledTimes(2);
  preparation.resolve({
    state: 'ready',
    failureCode: null,
    completion: { kind: 'replica', selection },
    containment: 'contained',
  });
  f.pending[0]!.result.resolve(published);
  await settleWorkflow();
});

it('bounds preview handoff strings to four MiB and releases a consumed completion', async () => {
  const dataUrl = `data:image/png;base64,${'A'.repeat(600000)}`;
  const create = vi.fn<NonNullable<SyncExecutorPorts['createProductExecution']>>(() => ({
    run: async () => ({
      state: 'ready',
      failureCode: null,
      completion: { kind: 'thumbnail', dataUrl, width: 320, height: 180 },
      containment: 'contained',
    }),
    drain: async () => undefined,
  }));
  const f = fixture(create);
  const selection = {
    rootKind: 'video-project' as const,
    rootId: 'project',
    operationId: 'version',
    sourceDigest: 'a'.repeat(64),
  };
  const ids = Array.from(
    { length: 4 },
    (_, index) => `88888888-8888-4888-8888-88888888888${index}`
  );
  function command(value: SyncProductExecutorRequest['command']) {
    return f.executor.productCommand({
      ...base,
      type: MessageType.OFFSCREEN_SYNC_PRODUCT_COMMAND,
      executorRevision: f.inspect().executorRevision,
      command: value,
    });
  }
  for (const operationRequestId of ids) {
    await command({
      kind: 'start',
      operationRequestId,
      binding,
      work: { kind: 'thumbnail-read', selection },
    });
    await settleWorkflow();
  }
  await expect(command({ kind: 'inspect', operationRequestId: ids[0]! })).resolves.toMatchObject({
    result: { job: { state: 'ready' }, completion: null },
  });
  const responses = await Promise.all(
    ids.slice(1).map((operationRequestId) => command({ kind: 'inspect', operationRequestId }))
  );
  let retained = 0;
  for (const response of responses)
    if (
      response.success &&
      response.result.kind === 'operation' &&
      response.result.completion?.kind === 'thumbnail'
    )
      retained += (response.result.completion.dataUrl?.length ?? 0) * 2;
  expect(retained).toBeLessThanOrEqual(4 * 1024 * 1024);
  expect(retained).toBeGreaterThan(0);
  for (const operationRequestId of ids)
    await expect(command({ kind: 'inspect', operationRequestId })).resolves.toMatchObject({
      result: { completion: null },
    });
});

it('keeps running phase when outgoing settles before an active product and Stop drains that product', async () => {
  const product = deferred<import('./product-execution').SyncProductExecutionResult>();
  const drained = deferred<void>();
  const drain = vi.fn(() => drained.promise);
  const f = fixture(() => ({ run: () => product.promise, drain }));
  f.start('outgoing');
  await settleWorkflow();
  await f.executor.productCommand({
    ...base,
    type: MessageType.OFFSCREEN_SYNC_PRODUCT_COMMAND,
    executorRevision: f.inspect().executorRevision,
    command: {
      kind: 'start',
      operationRequestId: '88888888-8888-4888-8888-888888888888',
      binding,
      work: { kind: 'catalog-refresh', bypassCache: false },
    },
  });
  f.pending[0]!.result.resolve(published);
  await settleWorkflow();
  expect(f.inspect()).toMatchObject({ phase: 'running', products: [{ state: 'running' }] });
  const stopped = f.stop();
  expect(drain).toHaveBeenCalledTimes(1);
  f.pending[0]!.drainage.resolve();
  drained.resolve();
  product.resolve({
    state: 'interrupted',
    failureCode: 'interrupted',
    completion: null,
    containment: 'contained',
  });
  await expect(stopped).resolves.toMatchObject({ success: true, result: 'stopped' });
});

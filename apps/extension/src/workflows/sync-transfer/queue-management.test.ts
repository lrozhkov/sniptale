import { expect, it, vi } from 'vitest';
import { createSyncQueueManagement } from './queue-management';
const scope = { spaceId: 'space', connectionGeneration: 1, profileCreatedAt: 1 };
function fixture() {
  const deps = {
    enrollment: vi.fn().mockResolvedValue(scope),
    page: vi.fn().mockResolvedValue({
      connection: { revision: 1 },
      operations: [],
      sources: [],
      nextCursor: null,
    }),
    queueCommand: vi.fn().mockResolvedValue({}),
    operationCommand: vi.fn().mockResolvedValue({}),
    history: vi.fn().mockResolvedValue(true),
  };
  return { deps, service: createSyncQueueManagement(deps) };
}
it('reads bounded pages and distinguishes absent enrollment from a failed read', async () => {
  const f = fixture();
  const cursor = { scope, afterOperationId: 'operation' };
  expect(await f.service.read(cursor)).toMatchObject({ kind: 'ready', scope });
  expect(f.deps.page).toHaveBeenCalledWith(scope, { limit: 25, cursor });
  f.deps.enrollment.mockResolvedValueOnce(null);
  expect(await f.service.read()).toEqual({ kind: 'unconfigured' });
  expect(f.deps.page).toHaveBeenCalledOnce();
  f.deps.page.mockRejectedValueOnce(new Error('read failure'));
  await expect(f.service.read()).rejects.toThrow('read failure');
});
it.each(['pause', 'resume'] as const)(
  'applies queue %s before delivering its history',
  async (command) => {
    const f = fixture();
    expect(await f.service.command({ kind: 'queue', scope, revision: 3, command })).toEqual({
      kind: 'applied',
      history: 'delivered',
    });
    expect(f.deps.queueCommand).toHaveBeenCalledWith(scope, 3, command);
    expect(f.deps.history).toHaveBeenCalledWith(scope, { kind: 'connection' });
    expect(f.deps.queueCommand.mock.invocationCallOrder[0]).toBeLessThan(
      f.deps.history.mock.invocationCallOrder[0]!
    );
  }
);
it.each(['pause', 'resume', 'retry', 'cancel'] as const)(
  'applies selected operation %s with its exact revision',
  async (command) => {
    const f = fixture();
    expect(
      await f.service.command({
        kind: 'operation',
        scope,
        operationId: 'operation',
        revision: 5,
        command,
      })
    ).toMatchObject({ kind: 'applied' });
    expect(f.deps.operationCommand).toHaveBeenCalledWith(scope, 'operation', 5, command);
    expect(f.deps.history).toHaveBeenCalledWith(scope, {
      kind: 'operation',
      operationId: 'operation',
    });
  }
);
it.each([false, 'reject'])(
  'retains applied status when history delivery fails: %s',
  async (failure) => {
    const f = fixture();
    if (failure === false) f.deps.history.mockResolvedValueOnce(false);
    else f.deps.history.mockRejectedValueOnce(new Error('private diagnostic exception'));
    expect(
      await f.service.command({ kind: 'queue', scope, revision: 3, command: 'pause' })
    ).toEqual({ kind: 'applied', history: 'pending' });
  }
);
it('refuses stale or erased enrollment commands without requesting delivery or retrying mutations', async () => {
  const f = fixture();
  f.deps.operationCommand.mockRejectedValueOnce(new Error('Stale'));
  const selection = {
    kind: 'operation',
    scope,
    operationId: 'operation',
    revision: 5,
    command: 'retry',
  };
  expect(await f.service.command(selection)).toEqual({ kind: 'refused' });
  expect(f.deps.history).not.toHaveBeenCalled();
  expect(f.deps.operationCommand).toHaveBeenCalledOnce();
  expect(await f.service.command(selection)).toMatchObject({ kind: 'applied' });
});
it.each([
  null,
  {},
  { kind: 'queue', scope, revision: -1, command: 'pause' },
  { kind: 'queue', scope, revision: 1, command: 'cancel' },
  { kind: 'operation', scope, operationId: '', revision: 1, command: 'pause' },
])('rejects malformed command input %j without native work', async (value) => {
  const f = fixture();
  expect(await f.service.command(value)).toEqual({ kind: 'refused' });
  expect(f.deps.queueCommand).not.toHaveBeenCalled();
  expect(f.deps.operationCommand).not.toHaveBeenCalled();
  expect(f.deps.history).not.toHaveBeenCalled();
});

it('detaches a continuation before waiting for enrollment admission', async () => {
  const f = fixture();
  let release!: (value: typeof scope) => void;
  f.deps.enrollment.mockReturnValueOnce(
    new Promise((resolve) => {
      release = resolve;
    })
  );
  const cursor = { scope: { ...scope }, afterOperationId: 'selected' };
  const reading = f.service.read(cursor);
  cursor.afterOperationId = 'mutated';
  cursor.scope.profileCreatedAt = 99;
  release(scope);
  await reading;
  expect(f.deps.page).toHaveBeenCalledWith(scope, {
    limit: 25,
    cursor: { scope, afterOperationId: 'selected' },
  });
});

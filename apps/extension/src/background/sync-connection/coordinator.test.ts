import { describe, expect, it, vi } from 'vitest';
import type { SyncConnectionMetadata } from '../../composition/persistence/remote-connection/model';
import type { SyncExecutorSnapshot } from '../../contracts/messaging/contracts/runtime-message/sync-connection.types';
import {
  createSyncConnectionCoordinator,
  type SyncConnectionCoordinatorDependencies,
} from './coordinator';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function fixture() {
  const metadata: SyncConnectionMetadata = {
    version: 1,
    kind: 'sync-connection',
    key: 'connection',
    binding: {
      provider: 'webdav',
      rootUrl: 'https://dav.example/root/',
      accountId: 'account',
      spaceId: 'space',
      connectionGeneration: 1,
      profileCreatedAt: 1,
    },
    identity: { incarnation: '10000000-0000-4000-8000-000000000001', revision: 1 },
    phase: 'active',
    updateNonce: null,
    credentialId: '10000000-0000-4000-8000-000000000002',
  };
  const selection = {
    scope: { spaceId: 'space', connectionGeneration: 1, profileCreatedAt: 1 },
    authorization: metadata.identity,
    operationId: 'operation',
    expectedRevision: 1,
  };
  const snapshot: SyncExecutorSnapshot = {
    offscreenStartupId: 'startup',
    executorId: 'executor',
    executorRevision: 4,
    phase: 'running',
    binding: { scope: selection.scope, authorization: selection.authorization },
    jobs: [],
  };
  const deps = {
    loadConnection: vi.fn(async (): Promise<SyncConnectionMetadata | null> => metadata),
    revokeConnection: vi.fn(async () => {
      metadata.phase = 'paused';
    }),
    ensureDocument: vi.fn(async () => 'startup'),
    inspectExecutor: vi.fn(async (_startupId: string | null, challenge: string) => ({
      kind: 'present' as const,
      challenge,
      snapshot,
    })),
    startExecutor: vi.fn(async () => ({ executorId: 'executor', executorRevision: 4 })),
    stopExecutor: vi.fn(async () => ({ executorId: 'executor', executorRevision: 5 })),
    createChallenge: vi.fn(() => 'challenge'),
  } satisfies SyncConnectionCoordinatorDependencies;
  return {
    metadata,
    selection,
    snapshot,
    deps,
    coordinator: createSyncConnectionCoordinator(deps),
  };
}

describe('sync lifecycle coordinator', () => {
  it('adopts a surviving executor only with the exact startup challenge and durable identity', async () => {
    const f = fixture();
    await expect(f.coordinator.start(f.selection)).resolves.toEqual({
      executorId: 'executor',
      executorRevision: 4,
    });
    expect(f.deps.startExecutor).toHaveBeenCalledWith({
      ...f.selection,
      offscreenStartupId: 'startup',
      executorId: 'executor',
      executorRevision: 4,
    });
    f.snapshot.binding!.authorization = { ...f.selection.authorization, revision: 2 };
    await expect(f.coordinator.inspect()).rejects.toThrow('refused');
  });

  it('refuses a stale challenge or startup without sending Start', async () => {
    const f = fixture();
    f.deps.inspectExecutor.mockImplementation(async () => ({
      kind: 'present',
      challenge: 'old',
      snapshot: f.snapshot,
    }));
    await expect(f.coordinator.start(f.selection)).rejects.toThrow('refused');
    expect(f.deps.startExecutor).not.toHaveBeenCalled();
    f.deps.inspectExecutor.mockImplementation(async (_id, challenge) => ({
      kind: 'present',
      challenge,
      snapshot: { ...f.snapshot, offscreenStartupId: 'old' },
    }));
    await expect(f.coordinator.start(f.selection)).rejects.toThrow('refused');
  });

  it('reserves erasure synchronously and prevents late Start after held Inspect', async () => {
    const f = fixture();
    const entered = deferred<void>();
    const held = deferred<void>();
    f.deps.inspectExecutor.mockImplementation(async (_id, challenge) => {
      entered.resolve();
      await held.promise;
      return { kind: 'present', challenge, snapshot: f.snapshot };
    });
    const start = f.coordinator.start(f.selection);
    const refusedStart = expect(start).rejects.toThrow('refused');
    await entered.promise;
    const reservation = f.coordinator.reserveErasure();
    await expect(f.coordinator.start(f.selection)).rejects.toThrow('refused');
    const drain = reservation.quiesce();
    held.resolve();
    await refusedStart;
    await drain;
    expect(f.deps.startExecutor).not.toHaveBeenCalled();
    expect(f.deps.revokeConnection).toHaveBeenCalledOnce();
    reservation.release();
  });

  it('commits revocation before Stop and targets the observed executor after authorization closes', async () => {
    const f = fixture();
    const entered = deferred<void>();
    const revoked = deferred<void>();
    f.deps.revokeConnection.mockImplementation(async () => {
      entered.resolve();
      await revoked.promise;
      f.metadata.phase = 'paused';
    });
    const reservation = f.coordinator.reserveErasure();
    const drain = reservation.quiesce();
    await entered.promise;
    expect(f.deps.stopExecutor).not.toHaveBeenCalled();
    await expect(f.coordinator.start(f.selection)).rejects.toThrow('refused');
    revoked.resolve();
    await drain;
    expect(f.deps.stopExecutor).toHaveBeenCalledWith({
      offscreenStartupId: 'startup',
      executorId: 'executor',
      executorRevision: 4,
    });
    reservation.release();
  });

  it('keeps the transition queue responsive while Stop waits for workflow containment', async () => {
    const f = fixture();
    const stopped = deferred<{ executorId: string; executorRevision: number }>();
    const entered = deferred<void>();
    f.deps.stopExecutor.mockImplementation(() => {
      entered.resolve();
      return stopped.promise;
    });
    const reservation = f.coordinator.reserveErasure();
    const drain = reservation.quiesce();
    await entered.promise;
    f.snapshot.binding = null;
    await expect(f.coordinator.inspect()).resolves.toBe(f.snapshot);
    stopped.resolve({ executorId: 'executor', executorRevision: 5 });
    await drain;
    reservation.release();
  });

  it('refuses erasure on inconclusive inspection or failed containment and permits a fresh retry', async () => {
    const f = fixture();
    f.deps.inspectExecutor.mockRejectedValueOnce(new Error('transport unavailable'));
    const first = f.coordinator.reserveErasure();
    await expect(first.quiesce()).rejects.toThrow('transport unavailable');
    expect(f.deps.stopExecutor).not.toHaveBeenCalled();
    first.release();
    f.deps.stopExecutor.mockRejectedValueOnce(new Error('containment failed'));
    const second = f.coordinator.reserveErasure();
    await expect(second.quiesce()).rejects.toThrow('containment failed');
    second.release();
    const retry = f.coordinator.reserveErasure();
    await expect(retry.quiesce()).resolves.toBeUndefined();
    retry.release();
  });

  it('requires positive gateway absence and revokes durable authorization even without a worker map', async () => {
    const f = fixture();
    const coordinator = createSyncConnectionCoordinator({
      ...f.deps,
      inspectExecutor: async () => ({ kind: 'absent' }),
    });
    const reservation = coordinator.reserveErasure();
    await expect(reservation.quiesce()).resolves.toBeUndefined();
    expect(f.deps.revokeConnection).toHaveBeenCalledOnce();
    expect(f.deps.stopExecutor).not.toHaveBeenCalled();
    reservation.release();
  });

  it('refuses erasure when durable revocation fails and retries without forgetting the executor', async () => {
    const f = fixture();
    f.deps.revokeConnection.mockRejectedValueOnce(new Error('revocation failed'));
    const first = f.coordinator.reserveErasure();
    await expect(first.quiesce()).rejects.toThrow('revocation failed');
    expect(f.deps.stopExecutor).not.toHaveBeenCalled();
    first.release();
    const retry = f.coordinator.reserveErasure();
    await expect(retry.quiesce()).resolves.toBeUndefined();
    expect(f.deps.stopExecutor).toHaveBeenCalledOnce();
    retry.release();
  });

  it('rejects a stale Stop receipt rather than asserting producer absence', async () => {
    const f = fixture();
    f.deps.stopExecutor.mockResolvedValue({ executorId: 'executor', executorRevision: 4 });
    const reservation = f.coordinator.reserveErasure();
    await expect(reservation.quiesce()).rejects.toThrow('refused');
    reservation.release();
  });

  it('stops only work affected by permission removal', async () => {
    const f = fixture();
    await f.coordinator.permissionsRemoved((origin) => origin === 'https://unrelated.example');
    expect(f.deps.revokeConnection).not.toHaveBeenCalled();
    expect(f.deps.stopExecutor).not.toHaveBeenCalled();
    await f.coordinator.permissionsRemoved((origin) => origin === 'https://dav.example');
    expect(f.deps.revokeConnection).toHaveBeenCalledOnce();
    expect(f.deps.stopExecutor).toHaveBeenCalledOnce();
  });

  it('rechecks durable authorization after asynchronous document admission', async () => {
    const f = fixture();
    f.deps.ensureDocument.mockImplementation(async () => {
      f.metadata.identity = { ...f.metadata.identity, revision: 2 };
      return 'startup';
    });
    await expect(f.coordinator.start(f.selection)).rejects.toThrow('refused');
    expect(f.deps.startExecutor).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from 'vitest';
import type { SyncConnectionMetadata } from '../../composition/persistence/remote-connection/model';
import type { SyncWorkspaceSelection } from '../../composition/persistence/remote-connection/workspace-selection';
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
    workspace: null,
  };
  const deps = {
    loadConnection: vi.fn(async (): Promise<SyncConnectionMetadata | null> => metadata),
    loadWorkspace: vi.fn(async (): Promise<SyncWorkspaceSelection | null> => null),
    revokeWorkspace: vi.fn(async () => undefined),
    hasOriginPermission: vi.fn(async () => true),
    enrollConnection: vi.fn(async () => metadata),
    startWorkspaceExecutor: vi.fn(async () => ({ executorId: 'executor', executorRevision: 4 })),
    revokeConnection: vi.fn(async () => {
      metadata.phase = 'paused';
    }),
    ensureDocument: vi.fn(async () => 'startup'),
    inspectExecutor: vi.fn<SyncConnectionCoordinatorDependencies['inspectExecutor']>(
      async (_startupId, challenge) => ({
        kind: 'present' as const,
        challenge,
        snapshot,
      })
    ),
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
    await expect(first.quiesce()).rejects.toThrow('refused');
    expect(f.deps.stopExecutor).toHaveBeenCalledOnce();
    first.release();
    const retry = f.coordinator.reserveErasure();
    await expect(retry.quiesce()).resolves.toBeUndefined();
    expect(f.deps.stopExecutor).toHaveBeenCalledTimes(2);
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

function workspaceFixture() {
  const f = fixture();
  const workspace: SyncWorkspaceSelection = {
    source: {
      kind: 'allocation',
      identity: { incarnation: '10000000-0000-4000-8000-000000000005', revision: 1 },
    },
    rootUrl: 'https://dav.example/root/Sniptale-10000000-0000-4000-8000-000000000003/',
    accountId: 'account',
    createdAt: 1,
    bindingKey: 'allocation-binding',
    phase: 'planned',
  };
  f.deps.loadConnection.mockResolvedValue(null);
  f.deps.loadWorkspace.mockImplementation(async () => workspace);
  f.snapshot.binding = null;
  const selection = {
    source: structuredClone(workspace.source),
    authentication: { kind: 'basic' as const, username: 'account', password: 'private-password' },
  };
  return { ...f, workspace, selection };
}

describe('workspace lifecycle coordinator', () => {
  it('detaches command input and checks current allocation before starting', async () => {
    const f = workspaceFixture();
    const promise = f.coordinator.startWorkspace(f.selection);
    f.selection.authentication.password = 'mutated';
    await expect(promise).resolves.toEqual({ executorId: 'executor', executorRevision: 4 });
    expect(f.deps.startWorkspaceExecutor).toHaveBeenCalledWith(
      expect.objectContaining({
        source: f.workspace.source,
        authentication: { kind: 'basic', username: 'account', password: 'private-password' },
      })
    );
  });
  it.each(['allocating', 'missing'] as const)(
    'refuses %s allocation without issuing a command',
    async (phase) => {
      const f = workspaceFixture();
      if (phase === 'missing') f.deps.loadWorkspace.mockResolvedValue(null);
      else f.workspace.phase = phase;
      await expect(f.coordinator.startWorkspace(f.selection)).rejects.toThrow('refused');
      expect(f.deps.startWorkspaceExecutor).not.toHaveBeenCalled();
    }
  );
  it('refuses changed native revision after asynchronous document admission', async () => {
    const f = workspaceFixture();
    f.deps.ensureDocument.mockImplementation(async () => {
      f.workspace.source.identity.revision += 1;
      return 'startup';
    });
    await expect(f.coordinator.startWorkspace(f.selection)).rejects.toThrow('refused');
    expect(f.deps.startWorkspaceExecutor).not.toHaveBeenCalled();
  });
  it('adopts a surviving workspace through phase revisions without restarting it', async () => {
    const f = workspaceFixture();
    f.snapshot.workspace = {
      sourceKind: f.workspace.source.kind,
      selectionIncarnation: f.workspace.source.identity.incarnation,
      selectionRevision: 1,
      state: 'running',
      failureCode: null,
    };
    f.workspace.source.identity.revision = 4;
    f.workspace.phase = 'checking';
    await expect(f.coordinator.inspect()).resolves.toBe(f.snapshot);
    expect(f.deps.startWorkspaceExecutor).not.toHaveBeenCalled();
    f.deps.loadWorkspace.mockResolvedValue(null);
    await expect(f.coordinator.inspect()).rejects.toThrow('refused');
    expect(f.deps.stopExecutor).toHaveBeenCalledOnce();
  });
  it('contains orphaned workspace when native authority is unreadable', async () => {
    const f = workspaceFixture();
    f.snapshot.workspace = {
      sourceKind: f.workspace.source.kind,
      selectionIncarnation: f.workspace.source.identity.incarnation,
      selectionRevision: 1,
      state: 'running',
      failureCode: null,
    };
    f.deps.loadWorkspace.mockRejectedValue(new Error('private native error'));
    await expect(f.coordinator.inspect()).rejects.toThrow('refused');
    expect(f.deps.stopExecutor).toHaveBeenCalledOnce();
  });
  it('invalidates held start before privacy containment and revokes current lifetime', async () => {
    const f = workspaceFixture();
    const entered = deferred<void>();
    const held = deferred<void>();
    f.deps.ensureDocument.mockImplementation(async () => {
      entered.resolve();
      await held.promise;
      return 'startup';
    });
    const start = expect(f.coordinator.startWorkspace(f.selection)).rejects.toThrow('refused');
    await entered.promise;
    f.workspace.source.identity.revision = 5;
    const reservation = f.coordinator.reserveErasure();
    const quiescence = reservation.quiesce();
    held.resolve();
    await start;
    await quiescence;
    expect(f.deps.startWorkspaceExecutor).not.toHaveBeenCalled();
    expect(f.deps.revokeWorkspace).toHaveBeenCalledWith(f.workspace.source);
    expect(f.deps.stopExecutor).toHaveBeenCalledOnce();
    reservation.release();
  });
  it('revokes workspace before containment on relevant permission removal', async () => {
    const f = workspaceFixture();
    await f.coordinator.permissionsRemoved((origin) => origin === 'https://elsewhere.example');
    expect(f.deps.stopExecutor).not.toHaveBeenCalled();
    f.deps.stopExecutor.mockImplementation(async () => {
      expect(f.deps.revokeWorkspace).toHaveBeenCalledWith(f.workspace.source);
      return { executorId: 'executor', executorRevision: 5 };
    });
    await f.coordinator.permissionsRemoved((origin) => origin === 'https://dav.example');
    expect(f.deps.stopExecutor).toHaveBeenCalledOnce();
  });
  it('still contains on failed lifetime revocation without reporting privacy success', async () => {
    const f = workspaceFixture();
    f.deps.revokeWorkspace.mockRejectedValue(new Error('private failure'));
    const reservation = f.coordinator.reserveErasure();
    await expect(reservation.quiesce()).rejects.toThrow('refused');
    expect(f.deps.stopExecutor).toHaveBeenCalledOnce();
    reservation.release();
  });
  it('contains on missing or unreadable native state during permission removal', async () => {
    const f = workspaceFixture();
    f.deps.loadWorkspace.mockResolvedValue(null);
    await f.coordinator.permissionsRemoved(() => true);
    expect(f.deps.stopExecutor).toHaveBeenCalledOnce();
    f.deps.loadWorkspace.mockRejectedValue(new Error('private native error'));
    await expect(f.coordinator.permissionsRemoved(() => true)).rejects.toThrow('refused');
    expect(f.deps.stopExecutor).toHaveBeenCalledTimes(2);
  });
});

describe('workspace enrollment handoff', () => {
  function readyFixture(kind: 'allocation' | 'join' = 'allocation') {
    const f = workspaceFixture();
    f.workspace.source.kind = kind;
    f.workspace.phase = 'ready';
    f.selection.source = structuredClone(f.workspace.source);
    f.snapshot.phase = 'idle';
    f.snapshot.workspace = {
      sourceKind: kind,
      selectionIncarnation: f.workspace.source.identity.incarnation,
      selectionRevision: 1,
      state: 'ready',
      failureCode: null,
    };
    return f;
  }
  it.each(['allocation', 'join'] as const)(
    'enrolls %s only after acknowledged containment',
    async (kind) => {
      const f = readyFixture(kind);
      const entered = deferred<void>();
      const stopped = deferred<void>();
      f.deps.stopExecutor.mockImplementation(async () => {
        entered.resolve();
        await stopped.promise;
        return { executorId: 'executor', executorRevision: 5 };
      });
      const pending = f.coordinator.enrollWorkspace(f.selection);
      f.selection.authentication.password = 'mutated';
      await entered.promise;
      expect(f.deps.enrollConnection).not.toHaveBeenCalled();
      stopped.resolve();
      expect(await pending).toBe(f.metadata);
      expect(f.deps.enrollConnection).toHaveBeenCalledWith(f.workspace.source, {
        kind: 'basic',
        username: 'account',
        password: 'private-password',
      });
      expect(f.deps.startExecutor).not.toHaveBeenCalled();
    }
  );
  it.each(['workspace', 'queue', 'unsafe'] as const)(
    'refuses %s execution before installation',
    async (condition) => {
      const f = readyFixture();
      if (condition === 'workspace') f.snapshot.workspace!.state = 'running';
      if (condition === 'queue')
        f.snapshot.jobs.push({
          operationId: 'operation',
          expectedRevision: 1,
          state: 'running',
          stage: 'writing',
          failureCode: null,
          runId: null,
        });
      if (condition === 'unsafe') f.snapshot.phase = 'failed';
      await expect(f.coordinator.enrollWorkspace(f.selection)).rejects.toThrow('refused');
      expect(f.deps.enrollConnection).not.toHaveBeenCalled();
    }
  );
  it('refuses changed source after held containment and allows retry', async () => {
    const f = readyFixture('join');
    f.deps.stopExecutor.mockImplementationOnce(async () => {
      f.workspace.source.identity.revision++;
      return { executorId: 'executor', executorRevision: 5 };
    });
    await expect(f.coordinator.enrollWorkspace(f.selection)).rejects.toThrow('refused');
    expect(f.deps.enrollConnection).not.toHaveBeenCalled();
    f.selection.source = structuredClone(f.workspace.source);
    await expect(f.coordinator.enrollWorkspace(f.selection)).resolves.toBe(f.metadata);
  });
  it('does not install after failed containment', async () => {
    const f = readyFixture();
    f.deps.stopExecutor.mockRejectedValueOnce(new Error('private failure'));
    await expect(f.coordinator.enrollWorkspace(f.selection)).rejects.toThrow();
    expect(f.workspace.phase).toBe('ready');
    expect(f.deps.enrollConnection).not.toHaveBeenCalled();
    await expect(f.coordinator.enrollWorkspace(f.selection)).resolves.toBe(f.metadata);
  });
  it('refuses denied permission and privacy reservation before installation', async () => {
    const f = readyFixture('join');
    f.deps.hasOriginPermission.mockResolvedValueOnce(false);
    await expect(f.coordinator.enrollWorkspace(f.selection)).rejects.toThrow('refused');
    const entered = deferred<void>();
    const permission = deferred<boolean>();
    f.deps.hasOriginPermission.mockImplementationOnce(async () => {
      entered.resolve();
      return permission.promise;
    });
    const pending = expect(f.coordinator.enrollWorkspace(f.selection)).rejects.toThrow('refused');
    await entered.promise;
    const reservation = f.coordinator.reserveErasure();
    permission.resolve(true);
    await pending;
    expect(f.deps.enrollConnection).not.toHaveBeenCalled();
    await reservation.quiesce();
    expect(f.deps.revokeWorkspace).toHaveBeenCalledWith(f.workspace.source);
    reservation.release();
  });
  it('accepts positive absence and replays through the native installer', async () => {
    const f = readyFixture();
    f.deps.inspectExecutor.mockImplementation(async () => ({ kind: 'absent' as const }));
    await expect(f.coordinator.enrollWorkspace(f.selection)).resolves.toBe(f.metadata);
    f.deps.loadConnection.mockResolvedValue(f.metadata);
    await expect(f.coordinator.enrollWorkspace(f.selection)).resolves.toBe(f.metadata);
    expect(f.deps.stopExecutor).not.toHaveBeenCalled();
    expect(f.deps.enrollConnection).toHaveBeenCalledTimes(2);
  });
});

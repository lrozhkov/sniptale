import { expect, it, vi } from 'vitest';
import type { SyncConnectionMetadata } from '../../composition/persistence/remote-connection/model';
import type { SyncQueueSummary } from '../../composition/persistence/sync-capture/queue-summary';
import type { SecretProtectionControl } from '../../composition/persistence/secret-protection/model';
import {
  createSyncRuntimeStatusReader,
  type SyncRuntimeStatusDependencies,
} from './runtime-status';
function fixture() {
  const db = {};
  let current: object | null = db;
  const connection: SyncConnectionMetadata = {
    version: 1,
    kind: 'sync-connection',
    key: 'connection',
    binding: {
      provider: 'webdav',
      rootUrl: 'https://dav.example/root/',
      accountId: 'private-account',
      spaceId: 'space',
      connectionGeneration: 1,
      profileCreatedAt: 1,
    },
    identity: { incarnation: '10000000-0000-4000-8000-000000000001', revision: 1 },
    phase: 'active',
    updateNonce: null,
    credentialId: '10000000-0000-4000-8000-000000000002',
  };
  const summary: Extract<SyncQueueSummary, { configured: true }> = {
    knowledge: 'complete',
    configured: true,
    scope: { spaceId: 'space', connectionGeneration: 1, profileCreatedAt: 1 },
    authorization: connection.identity,
    connection: 'active',
    counts: {
      pendingRoots: 0,
      nativeOperations: 0,
      preparedOperations: 0,
      publishedOperations: 1000,
      queue: {
        queued: 0,
        running: 0,
        paused: 0,
        cancelled: 0,
        failed: 0,
        interrupted: 0,
        published: 1000,
      },
    },
    minimumPendingDueAt: null,
    enrollmentComplete: true,
    localPublication: 'published',
  };
  const control: SecretProtectionControl = {
    version: 1,
    epoch: 1,
    phase: 'stable',
    participants: { ai: false, webdav: null },
  };
  const deps = {
    captureDatabase: () => current,
    readSummary: vi.fn(async (): Promise<SyncQueueSummary> => summary),
    readConnection: vi.fn(async () => connection),
    readProtectionControl: vi.fn(async () => control),
    readProtection: vi.fn(async () => ({
      isEnabled: false,
      isUnlocked: true,
      mode: 'transparent' as const,
      participants: { ai: false, webdav: false },
    })),
    hasOriginPermission: vi.fn(async () => true),
    observeActivity: vi.fn<SyncRuntimeStatusDependencies['observeActivity']>(async () => ({
      activity: 'unknown',
      remote: { knowledge: 'unknown' },
      failureCode: null,
    })),
  };
  return {
    db,
    connection,
    summary,
    control,
    deps,
    replace: (next: object | null) => {
      current = next;
    },
    read: () => createSyncRuntimeStatusReader(deps)(),
  };
}
it('keeps exact large local publication distinct from unknown remote freshness', async () => {
  const f = fixture();
  for (let n = 0; n < 3; n++)
    expect(await f.read()).toMatchObject({
      configuration: 'configured',
      localPublication: 'published',
      activity: 'unknown',
      remote: { knowledge: 'unknown' },
      protection: 'not-enrolled',
      issue: null,
    });
  const text = JSON.stringify(await f.read());
  for (const secret of [
    'private-account',
    'https://dav.example',
    'credentialId',
    'authorization',
    'spaceId',
    'incarnation',
  ])
    expect(text).not.toContain(secret);
});
it.each(['cancelled', 'failed', 'paused', 'interrupted'] as const)(
  'does not infer current head publication from retained %s history',
  async (status) => {
    const f = fixture();
    f.summary.counts.preparedOperations = 1;
    f.summary.counts.queue[status] = 1;
    f.summary.localPublication = 'waiting';
    expect(await f.read()).toMatchObject({
      localPublication: 'unknown',
      issue: status === 'failed' || status === 'interrupted' ? 'queue-problem' : null,
      repair: status === 'failed' || status === 'interrupted' ? 'queue-problems' : 'queue',
    });
  }
);
it('uses definite pending roots as waiting and incomplete enrollment as discovery', async () => {
  const f = fixture();
  f.summary.counts.pendingRoots = 1;
  f.summary.localPublication = 'waiting';
  expect(await f.read()).toMatchObject({ localPublication: 'waiting', issue: null });
  f.summary.counts.pendingRoots = 0;
  f.summary.enrollmentComplete = false;
  f.summary.localPublication = 'discovering';
  expect(await f.read()).toMatchObject({ localPublication: 'discovering' });
});
it('never turns a cold database into an unconfigured success or invokes other owners', async () => {
  const f = fixture();
  f.replace(null);
  expect(await f.read()).toMatchObject({
    configuration: 'unknown',
    localPublication: 'unknown',
    issue: 'not-ready',
  });
  expect(f.deps.readSummary).not.toHaveBeenCalled();
  expect(f.deps.readProtection).not.toHaveBeenCalled();
  expect(f.deps.observeActivity).not.toHaveBeenCalled();
});
it('short circuits an unconfigured native summary without opening secret or executor owners', async () => {
  const f = fixture();
  f.deps.readSummary.mockResolvedValue({ knowledge: 'complete', configured: false });
  expect(await f.read()).toMatchObject({ configuration: 'unconfigured' });
  expect(f.deps.readConnection).not.toHaveBeenCalled();
  expect(f.deps.observeActivity).not.toHaveBeenCalled();
  expect(f.deps.readProtection).not.toHaveBeenCalled();
});
it('discards replaced database or native selection around async activity and permission waits', async () => {
  const f = fixture();
  f.deps.hasOriginPermission.mockImplementationOnce(async () => {
    f.replace({});
    return true;
  });
  expect(await f.read()).toMatchObject({ configuration: 'unknown', issue: 'selection-changed' });
  const g = fixture();
  g.deps.observeActivity.mockImplementationOnce(async () => {
    g.connection.identity = { ...g.connection.identity, revision: 2 };
    return { activity: 'unknown', remote: { knowledge: 'unknown' }, failureCode: null };
  });
  expect(await g.read()).toMatchObject({ configuration: 'unknown', issue: 'selection-changed' });
});
it('keeps user pause ordinary and maps current permission failure to the connection repair', async () => {
  const f = fixture();
  f.summary.connection = 'paused';
  expect(await f.read()).toMatchObject({ connection: 'paused', issue: null, repair: 'connection' });
  f.summary.connection = 'active';
  f.deps.hasOriginPermission.mockResolvedValue(false);
  expect(await f.read()).toMatchObject({ issue: 'permission-required', repair: 'connection' });
});

it('discards protection epoch changes and credentials replaced during permission observation', async () => {
  const f = fixture();
  f.deps.hasOriginPermission.mockImplementationOnce(async () => {
    f.control.epoch++;
    return true;
  });
  expect(await f.read()).toMatchObject({ configuration: 'unknown', issue: 'selection-changed' });
  const g = fixture();
  g.deps.hasOriginPermission.mockImplementationOnce(async () => {
    g.connection.credentialId = '10000000-0000-4000-8000-000000000099';
    return true;
  });
  expect(await g.read()).toMatchObject({ configuration: 'unknown', issue: 'selection-changed' });
});
it('retains unknown index coverage and failed secret reads without inventing queue problems', async () => {
  const f = fixture();
  f.deps.readSummary.mockResolvedValue({ knowledge: 'unknown', reason: 'index-coverage' });
  expect(await f.read()).toMatchObject({ configuration: 'unknown', issue: 'index-coverage' });
  expect(f.deps.observeActivity).not.toHaveBeenCalled();
  const g = fixture();
  g.deps.readProtection.mockRejectedValue(new Error('native unavailable'));
  expect(await g.read()).toMatchObject({
    configuration: 'configured',
    protection: 'unknown',
    issue: 'not-ready',
    repair: 'connection',
  });
});
it(
  'reports observed remote completion independently from pending local publication ' +
    'and finite current failure',
  async () => {
    const f = fixture();
    f.summary.counts.pendingRoots = 1;
    f.deps.observeActivity.mockResolvedValue({
      activity: 'idle',
      remote: { knowledge: 'observed-pass', outcome: 'complete' },
      failureCode: null,
    });
    expect(await f.read()).toMatchObject({
      localPublication: 'waiting',
      remote: { knowledge: 'observed-pass', outcome: 'complete' },
      issue: null,
    });
    f.deps.observeActivity.mockResolvedValue({
      activity: 'idle',
      remote: { knowledge: 'observed-pass', outcome: 'deferred' },
      failureCode: 'storage-full',
    });
    expect(await f.read()).toMatchObject({
      issue: 'storage-full',
      repair: 'queue-problems',
      remote: { knowledge: 'observed-pass', outcome: 'deferred' },
    });
  }
);

it.each(['failed', 'interrupted'] as const)(
  'reports retained %s uploads when current activity has no failure without changing local publication',
  async (status) => {
    const f = fixture();
    f.summary.counts.queue[status] = 1;
    f.deps.observeActivity.mockResolvedValue({
      activity: 'idle',
      remote: { knowledge: 'unknown' },
      failureCode: null,
    });
    expect(await f.read()).toMatchObject({
      issue: 'queue-problem',
      repair: 'queue-problems',
      localPublication: 'published',
    });
  }
);

it.each([
  ['authentication', 'connection'],
  ['storage-full', 'queue-problems'],
  ['selection-changed', 'queue-action-required'],
  ['temporary', 'queue-problems'],
] as const)(
  'keeps current finite %s ahead of retained queue problems',
  async (failureCode, repair) => {
    const f = fixture();
    f.summary.counts.queue.failed = 1;
    f.deps.observeActivity.mockResolvedValue({
      activity: 'idle',
      remote: { knowledge: 'unknown' },
      failureCode,
    });
    expect(await f.read()).toMatchObject({ issue: failureCode, repair });
  }
);
it('keeps credentials permission protection and user pause ahead of retained queue problems', async () => {
  const f = fixture();
  f.summary.counts.queue.failed = 1;
  f.summary.connection = 'credentials-required';
  expect(await f.read()).toMatchObject({ issue: 'authentication', repair: 'connection' });
  f.summary.connection = 'active';
  f.deps.hasOriginPermission.mockResolvedValue(false);
  expect(await f.read()).toMatchObject({ issue: 'permission-required', repair: 'connection' });
  f.deps.hasOriginPermission.mockResolvedValue(true);
  f.control.participants.webdav = {
    incarnation: f.connection.identity.incarnation,
    credentialId: f.connection.credentialId!,
  };
  f.deps.readProtection.mockResolvedValue({
    isEnabled: true,
    isUnlocked: false,
    mode: 'transparent',
    participants: { ai: false, webdav: true },
  });
  expect(await f.read()).toMatchObject({ issue: 'secrets-locked', repair: 'security' });
  f.summary.connection = 'paused';
  expect(await f.read()).toMatchObject({ issue: null, repair: 'connection' });
});
it('clears the durable queue hint after cancellation or recovery removes failed counts', async () => {
  const f = fixture();
  f.summary.counts.queue.failed = 1;
  f.summary.counts.queue.interrupted = 1;
  expect(await f.read()).toMatchObject({ issue: 'queue-problem', repair: 'queue-problems' });
  f.summary.counts.queue.failed = 0;
  f.summary.counts.queue.interrupted = 0;
  f.summary.counts.queue.cancelled = 1;
  f.summary.counts.queue.published++;
  expect(await f.read()).toMatchObject({
    issue: null,
    repair: 'queue',
    localPublication: 'published',
  });
});

it('keeps revoked server access actionable without changing the connection pause', async () => {
  const f = fixture();
  f.summary.connection = 'paused';
  f.connection.phase = 'paused';
  f.deps.hasOriginPermission.mockResolvedValue(false);
  expect(await f.read()).toMatchObject({
    connection: 'paused',
    issue: 'permission-required',
    repair: 'connection',
  });
  expect(f.connection.phase).toBe('paused');
  f.deps.hasOriginPermission.mockResolvedValue(true);
  expect(await f.read()).toMatchObject({
    connection: 'paused',
    issue: null,
    repair: 'connection',
  });
  expect(f.connection.phase).toBe('paused');
});

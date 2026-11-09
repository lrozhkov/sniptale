import { parseSyncCredentialLease } from '../../contracts/messaging/contracts/runtime/sync-product';
import { expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { SyncConnectionMetadata } from '../../composition/persistence/remote-connection/model';
import { createSyncCredentialLeaseOwner, createSyncCredentialRoute } from './credential-route';

function id(value: number) {
  return `10000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function fixture() {
  let counter = 10;
  let connection: SyncConnectionMetadata = {
    version: 1,
    kind: 'sync-connection',
    key: 'connection',
    binding: {
      provider: 'webdav',
      rootUrl: 'https://dav.example/root/',
      accountId: 'alice',
      spaceId: 'space',
      connectionGeneration: 1,
      profileCreatedAt: 1,
    },
    identity: { incarnation: id(1), revision: 1 },
    phase: 'active',
    updateNonce: null,
    credentialId: id(2),
  };
  const control: { epoch: number; phase: 'stable' | 'transitioning' } = {
    epoch: 0,
    phase: 'stable',
  };
  const authentication = {
    kind: 'basic' as const,
    username: 'alice',
    password: 'test-secret-canary',
  };
  const protection = {
    readKey: vi.fn(async () => null),
    withAdmission: async <T>(_domain: 'webdav', operation: (key: CryptoKey | null) => Promise<T>) =>
      operation(null),
  };
  const dependencies = {
    protection,
    workerEpoch: id(3),
    readControl: async () => ({ ...control }),
    loadConnection: async () => structuredClone(connection),
    loadAuthentication: vi.fn(async () => authentication),
    hasOriginPermission: vi.fn(async () => true),
    createId: () => id(counter++),
  };
  const owner = createSyncCredentialLeaseOwner(dependencies);
  return {
    owner,
    dependencies,
    control,
    authentication,
    replace() {
      connection = {
        ...connection,
        credentialId: id(20),
        identity: { ...connection.identity, revision: 2 },
      };
    },
    issue: () =>
      owner.issue({
        offscreenStartupId: id(4),
        executorId: id(5),
        authorization: connection.identity,
      }),
  };
}

it('returns credentials only for the exact retained lease', async () => {
  const f = fixture();
  const lease = await f.issue();
  await expect(f.owner.resolveAuthentication(lease)).resolves.toEqual({
    success: true,
    authentication: f.authentication,
    credentialLease: lease,
  });
  await expect(f.owner.resolveAuthentication({ ...lease, executorId: id(99) })).resolves.toEqual({
    success: false,
    error: 'Sync credential query refused',
  });
  await expect(f.owner.check(lease, lease.authorization, 'https://other.example')).resolves.toBe(
    false
  );
});

it('rejects content and arbitrary extension credential callers', async () => {
  const f = fixture();
  const lease = await f.issue();
  const route = createSyncCredentialRoute({
    leases: f.owner,
    hasTrustedSender: (sender) => sender.url === 'chrome-extension://owned/offscreen',
  });
  for (const sender of [
    {
      url: 'https://page.example',
      tab: {
        id: 1,
        index: 0,
        pinned: false,
        highlighted: false,
        windowId: 1,
        active: true,
        incognito: false,
        selected: false,
        discarded: false,
        frozen: false,
        lastAccessed: 0,
        autoDiscardable: true,
        groupId: -1,
      },
    },
    { url: 'chrome-extension://owned/popup' },
    { url: 'chrome-extension://other/offscreen' },
  ]) {
    const send = vi.fn();
    route(
      { type: MessageType.SYNC_CONNECTION_CREDENTIAL, requestId: id(30), credentialLease: lease },
      sender,
      send
    );
    expect(send).toHaveBeenCalledWith({ success: false, error: 'Sync credential query refused' });
  }
  expect(f.dependencies.loadAuthentication).not.toHaveBeenCalled();
});

it('rejects delayed credentials after lock', async () => {
  const f = fixture();
  const lease = await f.issue();
  const entered = deferred<void>();
  const result = deferred<typeof f.authentication>();
  f.dependencies.loadAuthentication.mockImplementation(async () => {
    entered.resolve();
    return result.promise;
  });
  const pending = f.owner.resolveAuthentication(lease);
  await entered.promise;
  f.control.phase = 'transitioning';
  f.control.epoch++;
  f.owner.revokeAll();
  result.resolve(f.authentication);
  await expect(pending).resolves.toEqual({
    success: false,
    error: 'Sync credential query refused',
  });
});

it('rejects lease after worker restart', async () => {
  const f = fixture();
  const lease = await f.issue();
  const restarted = createSyncCredentialLeaseOwner({ ...f.dependencies, workerEpoch: id(40) });
  await expect(restarted.resolveAuthentication(lease)).resolves.toEqual({
    success: false,
    error: 'Sync credential query refused',
  });
  await expect(restarted.check(lease)).resolves.toBe(false);
  expect(f.dependencies.loadAuthentication).not.toHaveBeenCalled();
});

it('rejects lease after credential replacement', async () => {
  const f = fixture();
  const lease = await f.issue();
  const entered = deferred<void>();
  const permission = deferred<boolean>();
  f.dependencies.hasOriginPermission.mockImplementation(async () => {
    entered.resolve();
    return permission.promise;
  });
  const pending = f.owner.resolveAuthentication(lease);
  await entered.promise;
  f.replace();
  permission.resolve(true);
  await expect(pending).resolves.toEqual({
    success: false,
    error: 'Sync credential query refused',
  });
  expect(f.dependencies.loadAuthentication).not.toHaveBeenCalled();
});

it('rejects a session that locks during native connection read', async () => {
  const f = fixture();
  const lease = await f.issue();
  const entered = deferred<void>();
  const release = deferred<void>();
  const load = f.dependencies.loadConnection;
  f.dependencies.loadConnection = async () => {
    entered.resolve();
    await release.promise;
    return load();
  };
  const pending = f.owner.check(lease);
  await entered.promise;
  f.owner.revokeAll();
  release.resolve();
  await expect(pending).resolves.toBe(false);
});

it('preserves a distinct locked refusal without activating credentials', async () => {
  const { SecretProtectionLockedError } =
    await import('../../composition/persistence/secret-protection/model');
  const f = fixture();
  const lease = await f.issue();
  f.dependencies.protection.withAdmission = async () => {
    throw new SecretProtectionLockedError();
  };
  await expect(f.owner.resolveAuthentication(lease)).resolves.toEqual({
    success: false,
    error: 'secrets-locked',
  });
  expect(f.dependencies.loadAuthentication).not.toHaveBeenCalled();
});

it('delivers authentication before its shared admission releases', async () => {
  const f = fixture();
  const lease = await f.issue();
  let admitted = false;
  f.dependencies.protection.withAdmission = async (_domain, operation) => {
    admitted = true;
    try {
      return await operation(null);
    } finally {
      admitted = false;
    }
  };
  const deliver = vi.fn((response) => {
    expect(admitted).toBe(true);
    expect(response).toMatchObject({ success: true });
  });
  await f.owner.resolveAuthentication(lease, deliver);
  expect(admitted).toBe(false);
  expect(deliver).toHaveBeenCalledOnce();
});

it('does not send a second response when the privileged channel closes', async () => {
  const f = fixture();
  const lease = await f.issue();
  const deliver = vi.fn(() => {
    throw new Error('Channel closed');
  });
  await expect(f.owner.resolveAuthentication(lease, deliver)).resolves.toMatchObject({
    success: true,
  });
  expect(deliver).toHaveBeenCalledOnce();
});

it('issues a strict fresh lease when the first postrotation caller supplies a queue start selection', async () => {
  const f = fixture();
  await f.issue();
  f.replace();
  const queueSelection = {
    offscreenStartupId: id(4),
    executorId: id(5),
    executorRevision: 5,
    authorization: { incarnation: id(1), revision: 2 },
    scope: { spaceId: 'space', connectionGeneration: 1, profileCreatedAt: 1 },
    operationId: 'next-operation',
    expectedRevision: 1,
  };
  const lease = await f.owner.issue(queueSelection);
  expect(parseSyncCredentialLease(lease)).toEqual(lease);
  expect(lease).not.toHaveProperty('scope');
  expect(lease).not.toHaveProperty('operationId');
  const reused = await f.issue();
  expect(parseSyncCredentialLease(reused)).toEqual(lease);
  await expect(f.owner.resolveAuthentication(reused)).resolves.toMatchObject({ success: true });
});

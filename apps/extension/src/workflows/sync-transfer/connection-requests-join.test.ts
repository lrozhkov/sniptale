// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  loadSyncWorkspaceJoin,
  type SyncWorkspaceJoin,
} from '../../composition/persistence/remote-connection/workspace-join';
import { createSyncWorkspaceJoinRequests } from './connection-requests';

vi.mock('../../composition/persistence/remote-connection/store', () => ({
  loadSyncConnection: vi.fn(),
}));
vi.mock('../../composition/persistence/remote-connection/workspace-allocation', () => ({
  loadSyncWorkspaceAllocation: vi.fn(),
}));
vi.mock('../../composition/persistence/remote-connection/workspace-join', () => ({
  loadSyncWorkspaceJoin: vi.fn(),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

/** Execute the real coordination adapter against an exclusive native-lock fixture. */
function admissionLocks() {
  let tail = Promise.resolve();
  let held = 0;
  let maximumHeld = 0;
  const request = vi.fn(
    async <T>(
      name: string,
      options: { mode: string },
      operation: () => T | Promise<T>
    ): Promise<T> => {
      expect(name).toBe('sniptale.sync-connection.admission');
      expect(options).toEqual({ mode: 'exclusive' });
      const previous = tail;
      const release = deferred<void>();
      tail = release.promise;
      await previous;
      held++;
      maximumHeld = Math.max(maximumHeld, held);
      try {
        return await operation();
      } finally {
        held--;
        release.resolve();
      }
    }
  );
  return { request, held: () => held, maximumHeld: () => maximumHeld };
}

const identity = { incarnation: '11111111-1111-4111-8111-111111111111', revision: 1 };
const signal = () => new AbortController().signal;
const emptyResponse = () => new Response(null, { status: 204 });
beforeEach(() => vi.resetAllMocks());
afterEach(() => vi.unstubAllGlobals());

function joinIntent(): SyncWorkspaceJoin {
  return {
    version: 1,
    kind: 'sync-workspace-join',
    key: 'workspace-join',
    provider: 'webdav',
    rootUrl: 'https://dav.example/selected/',
    accountId: 'alice',
    createdAt: 1,
    identity: { ...identity },
    phase: 'checking',
    expected: null,
    workspace: null,
  };
}
function joinSetup() {
  const original = joinIntent();
  let current: SyncWorkspaceJoin | null = structuredClone(original);
  const locks = admissionLocks();
  vi.stubGlobal('navigator', { locks });
  vi.mocked(loadSyncWorkspaceJoin).mockImplementation(async () => structuredClone(current));
  const permission = vi.fn(async (_origin: string) => true);
  const requests = createSyncWorkspaceJoinRequests({
    intent: original,
    hasOriginPermission: permission,
  });
  return {
    original,
    requests,
    permission,
    locks,
    replace(value: SyncWorkspaceJoin | null) {
      current = value;
    },
    request(issue: (signal: AbortSignal) => Promise<Response>) {
      return requests.request(identity, signal(), issue);
    },
  };
}

it.each([
  'missing',
  'phase',
  'revision',
  'incarnation',
  'rootUrl',
  'accountId',
  'createdAt',
  'expected',
])('refuses JOIN %s before dispatch', async (condition) => {
  const f = joinSetup();
  const value = joinIntent();
  if (condition === 'phase') value.phase = 'ready';
  if (condition === 'revision') value.identity.revision++;
  if (condition === 'incarnation')
    value.identity.incarnation = '44444444-4444-4444-8444-444444444444';
  if (condition === 'rootUrl') value.rootUrl = 'https://dav.example/other/';
  if (condition === 'accountId') value.accountId = 'bob';
  if (condition === 'createdAt') value.createdAt++;
  if (condition === 'expected')
    value.expected = {
      spaceId: '33333333-3333-4333-8333-333333333333',
      bootstrapId: '44444444-4444-4444-8444-444444444444',
      fingerprint: 'a'.repeat(64),
    };
  f.replace(condition === 'missing' ? null : value);
  const issue = vi.fn(async () => emptyResponse());
  await expect(f.request(issue)).rejects.toMatchObject({ code: 'authentication' });
  expect(issue).not.toHaveBeenCalled();
  expect(f.permission).not.toHaveBeenCalled();
  await f.requests.close();
});

it.each(['erase', 'recreate', 'advance', 'rootUrl'])(
  'rechecks JOIN %s after permission and detaches expected inputs',
  async (condition) => {
    const f = joinSetup();
    const waiting = deferred<void>();
    const permission = deferred<boolean>();
    f.permission.mockImplementationOnce(async () => {
      waiting.resolve();
      return permission.promise;
    });
    const expected = { ...identity };
    const issue = vi.fn(async () => emptyResponse());
    const pending = expect(f.requests.request(expected, signal(), issue)).rejects.toMatchObject({
      code: 'authentication',
    });
    await waiting.promise;
    expected.revision++;
    f.original.rootUrl = 'https://dav.example/mutated/';
    const changed = joinIntent();
    if (condition === 'advance') changed.identity.revision++;
    if (condition === 'recreate')
      changed.identity.incarnation = '44444444-4444-4444-8444-444444444444';
    if (condition === 'rootUrl') changed.rootUrl = 'https://dav.example/other/';
    f.replace(condition === 'erase' ? null : changed);
    permission.resolve(true);
    await pending;
    expect(issue).not.toHaveBeenCalled();
    expect(f.permission).toHaveBeenCalledExactlyOnceWith('https://dav.example');
    await f.requests.close();
  }
);

it('admits only the frozen JOIN checking revision under the shared admission lock', async () => {
  const f = joinSetup();
  f.original.accountId = 'mutated';
  f.original.identity.revision++;
  const issue = vi.fn(async () => {
    expect(f.locks.held()).toBe(1);
    return emptyResponse();
  });
  expect((await f.request(issue)).status).toBe(204);
  await expect(
    f.requests.request({ ...identity, revision: 2 }, signal(), issue)
  ).rejects.toMatchObject({ code: 'authentication' });
  expect(issue).toHaveBeenCalledOnce();
  f.permission.mockResolvedValueOnce(false);
  await expect(f.request(issue)).rejects.toMatchObject({ code: 'access-denied' });
  expect(issue).toHaveBeenCalledOnce();
  await f.requests.close();
});

it.each([false, true])('shares JOIN drain and refuses failed cancellation=%s', async (fail) => {
  const f = joinSetup();
  const cancelling = deferred<void>();
  const disposed = deferred<void>();
  const response = await f.request(
    async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          cancel() {
            cancelling.resolve();
            return disposed.promise;
          },
        })
      )
  );
  const reading = expect(response.text()).rejects.toMatchObject({ code: 'cancelled' });
  const closing = f.requests.close();
  expect(f.requests.close()).toBe(closing);
  let closed = false;
  const settled = fail
    ? expect(closing).rejects.toEqual(new Error('Sync request containment failed.'))
    : closing.then(() => {
        closed = true;
      });
  await cancelling.promise;
  expect(closed).toBe(false);
  if (fail) disposed.reject(new Error('private provider error'));
  else disposed.resolve();
  await settled;
  await reading;
  const issue = vi.fn(async () => emptyResponse());
  await expect(f.request(issue)).rejects.toMatchObject({ code: 'cancelled' });
  expect(issue).not.toHaveBeenCalled();
});

it('detaches JOIN expected identity before waiting for origin permission', async () => {
  const f = joinSetup();
  const waiting = deferred<void>();
  const permission = deferred<boolean>();
  f.permission.mockImplementationOnce(async () => {
    waiting.resolve();
    return permission.promise;
  });
  const expected = { ...identity };
  const issue = vi.fn(async () => emptyResponse());
  const pending = f.requests.request(expected, signal(), issue);
  await waiting.promise;
  expected.revision++;
  f.original.rootUrl = 'https://dav.example/mutated/';
  permission.resolve(true);
  expect((await pending).status).toBe(204);
  expect(issue).toHaveBeenCalledOnce();
  await f.requests.close();
});

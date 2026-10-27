// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { withSyncConnectionAdmissionLock } from '../../composition/persistence/remote-connection/coordination';
import type { SyncConnectionMetadata } from '../../composition/persistence/remote-connection/model';
import { loadSyncConnection } from '../../composition/persistence/remote-connection/store';
import {
  loadSyncWorkspaceAllocation,
  type SyncWorkspaceAllocation,
} from '../../composition/persistence/remote-connection/workspace-allocation';
import { createSyncConnectionRequests, createSyncWorkspaceRequests } from './connection-requests';

vi.mock('../../composition/persistence/remote-connection/store', () => ({
  loadSyncConnection: vi.fn(),
}));

vi.mock('../../composition/persistence/remote-connection/workspace-allocation', () => ({
  loadSyncWorkspaceAllocation: vi.fn(),
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
function metadata(): SyncConnectionMetadata {
  return {
    version: 1,
    kind: 'sync-connection',
    key: 'connection',
    binding: {
      provider: 'webdav',
      rootUrl: 'https://dav.example/root/',
      accountId: 'alice',
      spaceId: 'space',
      connectionGeneration: 3,
      profileCreatedAt: 1,
    },
    identity: { ...identity },
    phase: 'active',
    updateNonce: null,
    credentialId: '22222222-2222-4222-8222-222222222222',
  };
}
function setup() {
  let current: SyncConnectionMetadata | null = metadata();
  const locks = admissionLocks();
  vi.stubGlobal('navigator', { locks });
  vi.mocked(loadSyncConnection).mockImplementation(async () => structuredClone(current));
  const permission = vi.fn(async (_origin: string) => true);
  const requests = createSyncConnectionRequests({ identity, hasOriginPermission: permission });
  return {
    requests,
    permission,
    locks,
    replace(value: SyncConnectionMetadata | null) {
      current = value;
    },
  };
}
const signal = () => new AbortController().signal;
const emptyResponse = () => new Response(null, { status: 204 });

beforeEach(() => vi.resetAllMocks());
afterEach(() => vi.unstubAllGlobals());

it.each(['missing', 'paused', 'updating-auth', 'old-revision', 'old-incarnation'])(
  'refuses %s durable authorization before invoking a request',
  async (condition) => {
    const f = setup();
    const value = metadata();
    if (condition === 'paused') value.phase = 'paused';
    if (condition === 'updating-auth') value.phase = 'updating-auth';
    if (condition === 'old-revision') value.identity.revision++;
    if (condition === 'old-incarnation')
      value.identity.incarnation = '33333333-3333-4333-8333-333333333333';
    f.replace(condition === 'missing' ? null : value);
    const issue = vi.fn(async (_signal: AbortSignal) => emptyResponse());
    await expect(f.requests.request(signal(), issue)).rejects.toMatchObject({
      code: 'authentication',
    });
    expect(issue).not.toHaveBeenCalled();
    expect(f.permission).not.toHaveBeenCalled();
    await f.requests.close();
  }
);

it('checks the selected root origin and refuses denied permission before dispatch', async () => {
  const f = setup();
  f.permission.mockResolvedValue(false);
  const issue = vi.fn(async (_signal: AbortSignal) => emptyResponse());
  await expect(f.requests.request(signal(), issue)).rejects.toMatchObject({
    code: 'access-denied',
  });
  expect(f.permission).toHaveBeenCalledExactlyOnceWith('https://dav.example');
  expect(issue).not.toHaveBeenCalled();
  await f.requests.close();
});

it.each(['missing', 'paused', 'rotation'])(
  'rechecks %s metadata after an awaited permission decision before dispatch',
  async (condition) => {
    const f = setup();
    const checking = deferred<void>();
    const permission = deferred<boolean>();
    f.permission.mockImplementation(async () => {
      checking.resolve();
      return permission.promise;
    });
    const issue = vi.fn(async (_signal: AbortSignal) => emptyResponse());
    const pending = f.requests.request(signal(), issue);
    const rejected = expect(pending).rejects.toMatchObject({ code: 'authentication' });
    await checking.promise;
    const changed = metadata();
    if (condition === 'paused') changed.phase = 'paused';
    else changed.identity.revision++;
    f.replace(condition === 'missing' ? null : changed);
    permission.resolve(true);
    await rejected;
    expect(loadSyncConnection).toHaveBeenCalledTimes(2);
    expect(issue).not.toHaveBeenCalled();
    await f.requests.close();
  }
);

it('serializes final invocation but admits independent requests before earlier headers arrive', async () => {
  const f = setup();
  const checking = deferred<void>();
  const permission = deferred<boolean>();
  f.permission.mockImplementationOnce(async () => {
    checking.resolve();
    return permission.promise;
  });
  const firstIssued = deferred<void>();
  const secondIssued = deferred<void>();
  const firstHeaders = deferred<Response>();
  const secondHeaders = deferred<Response>();
  const firstIssue = vi.fn((_signal: AbortSignal) => {
    expect(f.locks.held()).toBe(1);
    firstIssued.resolve();
    return firstHeaders.promise;
  });
  const secondIssue = vi.fn((_signal: AbortSignal) => {
    expect(f.locks.held()).toBe(1);
    secondIssued.resolve();
    return secondHeaders.promise;
  });
  const first = f.requests.request(signal(), firstIssue);
  await checking.promise;
  const second = f.requests.request(signal(), secondIssue);
  expect(f.locks.request).toHaveBeenCalledTimes(2);
  expect(f.permission).toHaveBeenCalledOnce();
  expect(firstIssue).not.toHaveBeenCalled();
  expect(secondIssue).not.toHaveBeenCalled();
  permission.resolve(true);
  await Promise.all([firstIssued.promise, secondIssued.promise]);
  await withSyncConnectionAdmissionLock(() => {
    expect(f.locks.held()).toBe(1);
  });
  expect(f.locks.maximumHeld()).toBe(1);
  firstHeaders.resolve(emptyResponse());
  secondHeaders.resolve(emptyResponse());
  await Promise.all([first, second]);
  await f.requests.close();
});

it('releases admission while bodies stream and refuses the old factory after durable rotation', async () => {
  const f = setup();
  const cancelled = vi.fn();
  const first = await f.requests.request(
    signal(),
    async () => new Response(new ReadableStream<Uint8Array>({ cancel: cancelled }))
  );
  const second = await f.requests.request(signal(), async () => emptyResponse());
  expect(second.status).toBe(204);
  await withSyncConnectionAdmissionLock(() => {
    const rotated = metadata();
    rotated.identity.revision++;
    f.replace(rotated);
  });
  const afterRotation = vi.fn(async (_signal: AbortSignal) => emptyResponse());
  await expect(f.requests.request(signal(), afterRotation)).rejects.toMatchObject({
    code: 'authentication',
  });
  expect(afterRotation).not.toHaveBeenCalled();
  await first.body!.cancel();
  expect(cancelled).toHaveBeenCalledOnce();
  await f.requests.close();
});

it('aborts stalled headers and waits for issued transport disposal before closure succeeds', async () => {
  const f = setup();
  const issued = deferred<void>();
  const aborted = deferred<void>();
  const headers = deferred<Response>();
  let issuedSignal: AbortSignal | undefined;
  const pending = f.requests.request(signal(), (requestSignal) => {
    issuedSignal = requestSignal;
    requestSignal.addEventListener('abort', () => aborted.resolve(), { once: true });
    issued.resolve();
    return headers.promise;
  });
  const rejected = expect(pending).rejects.toMatchObject({ code: 'cancelled' });
  await issued.promise;
  let closed = false;
  const closing = f.requests.close().then(() => {
    closed = true;
  });
  await aborted.promise;
  expect(issuedSignal?.aborted).toBe(true);
  expect(closed).toBe(false);
  headers.reject(new Error('synthetic transport disposed'));
  await rejected;
  await closing;
  expect(closed).toBe(true);
});

it('cancels streaming response bodies and waits for their disposal before closure succeeds', async () => {
  const f = setup();
  const cancelling = deferred<void>();
  const disposed = deferred<void>();
  const cancel = vi.fn(() => {
    cancelling.resolve();
    return disposed.promise;
  });
  const response = await f.requests.request(
    signal(),
    async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(output) {
            output.enqueue(new TextEncoder().encode('received prefix'));
          },
          cancel,
        })
      )
  );
  const reader = response.body!.getReader();
  const first = await reader.read();
  expect(new TextDecoder().decode(first.value)).toBe('received prefix');
  const reading = expect(reader.read()).rejects.toMatchObject({ code: 'cancelled' });
  let closed = false;
  const closing = f.requests.close().then(() => {
    closed = true;
  });
  await cancelling.promise;
  expect(closed).toBe(false);
  expect(cancel).toHaveBeenCalledOnce();
  disposed.resolve();
  await closing;
  await reading;
  expect(closed).toBe(true);
});

it('keeps a request awaiting permission owned by closure and prevents its later invocation', async () => {
  const f = setup();
  const checking = deferred<void>();
  const permission = deferred<boolean>();
  f.permission.mockImplementation(async () => {
    checking.resolve();
    return permission.promise;
  });
  const issue = vi.fn(async (_signal: AbortSignal) => emptyResponse());
  const pending = f.requests.request(signal(), issue);
  const rejected = expect(pending).rejects.toMatchObject({ code: 'cancelled' });
  await checking.promise;
  let closed = false;
  const closing = f.requests.close().then(() => {
    closed = true;
  });
  expect(closed).toBe(false);
  permission.resolve(true);
  await rejected;
  await closing;
  expect(issue).not.toHaveBeenCalled();
  expect(closed).toBe(true);
});

it('propagates caller abort to issued headers and keeps ownership until transport settles', async () => {
  const f = setup();
  const caller = new AbortController();
  const issued = deferred<void>();
  const aborted = deferred<void>();
  const headers = deferred<Response>();
  const pending = f.requests.request(caller.signal, (requestSignal) => {
    requestSignal.addEventListener('abort', () => aborted.resolve(), { once: true });
    issued.resolve();
    return headers.promise;
  });
  const rejected = expect(pending).rejects.toMatchObject({ code: 'cancelled' });
  await issued.promise;
  caller.abort();
  await aborted.promise;
  let closed = false;
  const closing = f.requests.close().then(() => {
    closed = true;
  });
  expect(closed).toBe(false);
  headers.reject(new DOMException('Aborted', 'AbortError'));
  await rejected;
  await closing;
});

it('forwards caller abort to the active body and drains its cancellation', async () => {
  const f = setup();
  const caller = new AbortController();
  const cancelling = deferred<void>();
  const disposed = deferred<void>();
  const response = await f.requests.request(
    caller.signal,
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
  caller.abort();
  await cancelling.promise;
  let closed = false;
  const closing = f.requests.close().then(() => {
    closed = true;
  });
  expect(closed).toBe(false);
  disposed.resolve();
  await closing;
  await reading;
});

it('forwards consumer cancellation to the native response reader and waits for disposal', async () => {
  const f = setup();
  const cancelling = deferred<void>();
  const disposed = deferred<void>();
  const cancel = vi.fn(() => {
    cancelling.resolve();
    return disposed.promise;
  });
  const response = await f.requests.request(
    signal(),
    async () => new Response(new ReadableStream<Uint8Array>({ cancel }))
  );
  let cancelled = false;
  const cancellation = response.body!.cancel().then(() => {
    cancelled = true;
  });
  await cancelling.promise;
  expect(cancelled).toBe(false);
  disposed.resolve();
  await cancellation;
  await f.requests.close();
  expect(cancel).toHaveBeenCalledOnce();
});

it('refuses successful closure after cancellation fails and exposes only a fixed diagnostic', async () => {
  const f = setup();
  const cancelling = deferred<void>();
  const disposed = deferred<void>();
  const response = await f.requests.request(
    signal(),
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
  const rejected = expect(closing).rejects.toEqual(new Error('Sync request containment failed.'));
  await cancelling.promise;
  disposed.reject(new Error('synthetic-raw-secret-must-not-escape'));
  await rejected;
  await reading;
  expect(f.requests.close()).toBe(closing);
  const issue = vi.fn(async (_signal: AbortSignal) => emptyResponse());
  await expect(f.requests.request(signal(), issue)).rejects.toMatchObject({ code: 'cancelled' });
  expect(issue).not.toHaveBeenCalled();
});

it('consumes successful response bytes and never dispatches after closure', async () => {
  const f = setup();
  const response = await f.requests.request(
    signal(),
    async () =>
      new Response('retained response bytes', { status: 201, headers: { 'x-check': 'kept' } })
  );
  expect(response.status).toBe(201);
  expect(response.headers.get('x-check')).toBe('kept');
  expect(await response.text()).toBe('retained response bytes');
  await f.requests.close();
  const reads = vi.mocked(loadSyncConnection).mock.calls.length;
  const issue = vi.fn(async (_signal: AbortSignal) => emptyResponse());
  await expect(f.requests.request(signal(), issue)).rejects.toMatchObject({ code: 'cancelled' });
  expect(issue).not.toHaveBeenCalled();
  expect(loadSyncConnection).toHaveBeenCalledTimes(reads);
});

function allocation(): SyncWorkspaceAllocation {
  const bootstrapId = '22222222-2222-4222-8222-222222222222';
  return {
    version: 2,
    kind: 'sync-workspace-allocation',
    key: 'workspace-allocation',
    provider: 'webdav',
    parentUrl: 'https://dav.example/parent/',
    rootUrl: `https://dav.example/parent/Sniptale-${bootstrapId}/`,
    accountId: 'alice',
    spaceId: '33333333-3333-4333-8333-333333333333',
    bootstrapId,
    createdAt: 1,
    identity: { ...identity },
    phase: 'allocating',
    marker: null,
  };
}
function workspaceSetup() {
  const original = allocation();
  let current: SyncWorkspaceAllocation | null = structuredClone(original);
  const locks = admissionLocks();
  vi.stubGlobal('navigator', { locks });
  vi.mocked(loadSyncWorkspaceAllocation).mockImplementation(async () => structuredClone(current));
  const permission = vi.fn(async (_origin: string) => true);
  const requests = createSyncWorkspaceRequests({
    allocation: original,
    hasOriginPermission: permission,
  });
  const request = (issue: (signal: AbortSignal) => Promise<Response>) =>
    requests.request(identity, 'allocating', signal(), issue);
  return {
    original,
    requests,
    request,
    permission,
    locks,
    replace(value: SyncWorkspaceAllocation | null) {
      current = value;
    },
  };
}

it.each([
  'missing',
  'phase',
  'revision',
  'incarnation',
  'parentUrl',
  'rootUrl',
  'accountId',
  'spaceId',
  'bootstrapId',
  'createdAt',
  'planned',
  'abandoned',
])('refuses workspace %s changes before dispatch', async (condition) => {
  const f = workspaceSetup();
  const changed = allocation();
  if (condition === 'phase') changed.phase = 'allocated';
  if (condition === 'revision') changed.identity.revision++;
  if (condition === 'incarnation')
    changed.identity.incarnation = '44444444-4444-4444-8444-444444444444';
  if (condition === 'parentUrl') changed.parentUrl = 'https://dav.example/another/';
  if (condition === 'rootUrl') changed.rootUrl = 'https://dav.example/another/child/';
  if (condition === 'accountId') changed.accountId = 'bob';
  if (condition === 'spaceId') changed.spaceId = '44444444-4444-4444-8444-444444444444';
  if (condition === 'bootstrapId') changed.bootstrapId = '44444444-4444-4444-8444-444444444444';
  if (condition === 'createdAt') changed.createdAt++;
  if (condition === 'planned' || condition === 'abandoned') changed.phase = condition;
  f.replace(condition === 'missing' ? null : changed);
  const issue = vi.fn(async (_signal: AbortSignal) => emptyResponse());
  const expectedPhase =
    condition === 'planned' || condition === 'abandoned' ? condition : 'allocating';
  await expect(f.requests.request(identity, expectedPhase, signal(), issue)).rejects.toMatchObject({
    code: 'authentication',
  });
  expect(issue).not.toHaveBeenCalled();
  expect(f.permission).not.toHaveBeenCalled();
  await f.requests.close();
});

it('shares one detached lifetime across changing workspace phase clients', async () => {
  const f = workspaceSetup();
  f.original.accountId = 'changed caller value';
  f.original.identity.incarnation = '44444444-4444-4444-8444-444444444444';
  const phases = [
    'allocating',
    'allocated',
    'preparing-marker',
    'publishing-marker',
    'ready',
  ] as const;
  for (const [index, phase] of phases.entries()) {
    const current = allocation();
    current.identity.revision += index;
    current.phase = phase;
    f.replace(current);
    const response = await f.requests.request(current.identity, phase, signal(), async () =>
      emptyResponse()
    );
    expect(response.status).toBe(204);
    if (index > 0) {
      const stale = vi.fn(async (_signal: AbortSignal) => emptyResponse());
      await expect(f.request(stale)).rejects.toMatchObject({ code: 'authentication' });
      expect(stale).not.toHaveBeenCalled();
    }
  }
  await f.requests.close();
});

it.each(['installed-profile', 'installed-connection', 'erased-database', 'permission-error'])(
  'contains workspace %s admission errors in a fixed diagnostic',
  async (condition) => {
    const f = workspaceSetup();
    if (condition === 'permission-error')
      f.permission.mockRejectedValue(new Error('private provider URL and credentials'));
    else
      vi.mocked(loadSyncWorkspaceAllocation).mockRejectedValue(new Error('private native state'));
    const issue = vi.fn(async (_signal: AbortSignal) => emptyResponse());
    await expect(f.request(issue)).rejects.toMatchObject({ code: 'transport' });
    expect(issue).not.toHaveBeenCalled();
    await f.requests.close();
  }
);

it('checks the workspace root origin and refuses denied permission', async () => {
  const f = workspaceSetup();
  f.permission.mockResolvedValue(false);
  const issue = vi.fn(async (_signal: AbortSignal) => emptyResponse());
  await expect(f.request(issue)).rejects.toMatchObject({ code: 'access-denied' });
  expect(f.permission).toHaveBeenCalledExactlyOnceWith('https://dav.example');
  expect(issue).not.toHaveBeenCalled();
  await f.requests.close();
});

it.each(['erase', 'recreate', 'abandon', 'advance', 'install'])(
  'refuses workspace %s while origin permission is pending',
  async (condition) => {
    const f = workspaceSetup();
    const checking = deferred<void>();
    const permission = deferred<boolean>();
    f.permission.mockImplementation(async () => {
      checking.resolve();
      return permission.promise;
    });
    const expected = { ...identity };
    const issue = vi.fn(async (_signal: AbortSignal) => emptyResponse());
    const pending = f.requests.request(expected, 'allocating', signal(), issue);
    const rejected = expect(pending).rejects.toMatchObject({
      code: condition === 'install' ? 'transport' : 'authentication',
    });
    await checking.promise;
    expected.revision++;
    const changed = allocation();
    if (condition === 'recreate')
      changed.identity.incarnation = '44444444-4444-4444-8444-444444444444';
    if (condition === 'abandon') changed.phase = 'abandoned';
    if (condition === 'advance') changed.identity.revision++;
    f.replace(condition === 'erase' ? null : changed);
    if (condition === 'install')
      vi.mocked(loadSyncWorkspaceAllocation).mockRejectedValue(
        new Error('private installed state')
      );
    permission.resolve(true);
    await rejected;
    expect(issue).not.toHaveBeenCalled();
    await f.requests.close();
  }
);

it('closes queued workspace admission synchronously and drains permission before returning', async () => {
  const f = workspaceSetup();
  const checking = deferred<void>();
  const permission = deferred<boolean>();
  f.permission.mockImplementationOnce(async () => {
    checking.resolve();
    return permission.promise;
  });
  const issue = vi.fn(async (_signal: AbortSignal) => emptyResponse());
  const first = expect(f.request(issue)).rejects.toMatchObject({ code: 'cancelled' });
  await checking.promise;
  const queued = expect(f.request(issue)).rejects.toMatchObject({ code: 'cancelled' });
  let closed = false;
  const closing = f.requests.close().then(() => {
    closed = true;
  });
  expect(closed).toBe(false);
  const afterClose = expect(f.request(issue)).rejects.toMatchObject({ code: 'cancelled' });
  permission.resolve(true);
  await Promise.all([first, queued, afterClose, closing]);
  expect(issue).not.toHaveBeenCalled();
  expect(f.permission).toHaveBeenCalledOnce();
});

it('releases workspace admission before headers and while an earlier phase body streams', async () => {
  const f = workspaceSetup();
  const issued = deferred<void>();
  const headers = deferred<Response>();
  const first = f.request(() => {
    expect(f.locks.held()).toBe(1);
    issued.resolve();
    return headers.promise;
  });
  await issued.promise;
  const second = await f.request(async () => emptyResponse());
  expect(second.status).toBe(204);
  headers.resolve(new Response(new ReadableStream<Uint8Array>()));
  const response = await first;
  const advanced = allocation();
  advanced.phase = 'allocated';
  advanced.identity.revision++;
  f.replace(advanced);
  const third = await f.requests.request(advanced.identity, advanced.phase, signal(), async () =>
    emptyResponse()
  );
  expect(third.status).toBe(204);
  await response.body!.cancel();
  await f.requests.close();
  expect(f.locks.maximumHeld()).toBe(1);
});

it('aborts workspace headers and waits for the issued transport to settle', async () => {
  const f = workspaceSetup();
  const issued = deferred<AbortSignal>();
  const headers = deferred<Response>();
  const pending = f.request((requestSignal) => {
    issued.resolve(requestSignal);
    return headers.promise;
  });
  const rejected = expect(pending).rejects.toMatchObject({ code: 'cancelled' });
  const requestSignal = await issued.promise;
  let closed = false;
  const closing = f.requests.close().then(() => {
    closed = true;
  });
  expect(requestSignal.aborted).toBe(true);
  expect(closed).toBe(false);
  headers.reject(new Error('private transport error'));
  await rejected;
  await closing;
});

it.each([false, true])(
  'drains workspace body cancellation with failure=%s across phase clients',
  async (fail) => {
    const f = workspaceSetup();
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
    const advanced = allocation();
    advanced.identity.revision++;
    advanced.phase = 'allocated';
    f.replace(advanced);
    let closed = false;
    const closing = f.requests.close();
    const settled = fail
      ? expect(closing).rejects.toEqual(new Error('Sync request containment failed.'))
      : closing.then(() => {
          closed = true;
        });
    await cancelling.promise;
    expect(closed).toBe(false);
    if (fail) disposed.reject(new Error('private body cancellation error'));
    else disposed.resolve();
    await settled;
    await reading;
    expect(f.requests.close()).toBe(closing);
    const issue = vi.fn(async (_signal: AbortSignal) => emptyResponse());
    await expect(
      f.requests.request(advanced.identity, advanced.phase, signal(), issue)
    ).rejects.toMatchObject({ code: 'cancelled' });
    expect(issue).not.toHaveBeenCalled();
  }
);

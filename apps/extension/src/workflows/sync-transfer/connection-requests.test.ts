// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { withSyncConnectionAdmissionLock } from '../../composition/persistence/remote-connection/coordination';
import type { SyncConnectionMetadata } from '../../composition/persistence/remote-connection/model';
import { loadSyncConnection } from '../../composition/persistence/remote-connection/store';
import { createSyncConnectionRequests } from './connection-requests';

vi.mock('../../composition/persistence/remote-connection/store', () => ({
  loadSyncConnection: vi.fn(),
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

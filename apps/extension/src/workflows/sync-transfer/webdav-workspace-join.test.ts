// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  sameSyncConnectionIdentity,
  type SyncConnectionIdentity,
} from '../../composition/persistence/remote-connection/model';
import type { SyncWorkspaceJoin } from '../../composition/persistence/remote-connection/workspace-join';
import {
  encodeSyncWorkspaceMarker,
  SYNC_WORKSPACE_MARKER_KEY,
} from '../../contracts/sync-workspace';
import { SyncRemoteError, type SyncRemoteStore } from './remote-store';
import { createWebdavRemoteStore } from './webdav';
import { createWebdavWorkspaceJoin } from './webdav-workspace-join';
import { createSyncAttempt } from './wire-record';

const native = vi.hoisted(() => ({
  load: vi.fn(),
  begin: vi.fn(),
  complete: vi.fn(),
  revoke: vi.fn(),
}));
vi.mock('../../composition/persistence/remote-connection/workspace-join', () => ({
  loadSyncWorkspaceJoin: native.load,
  beginSyncWorkspaceJoin: native.begin,
  completeSyncWorkspaceJoin: native.complete,
  revokeSyncWorkspaceJoin: native.revoke,
}));
vi.mock('./webdav', () => ({ createWebdavRemoteStore: vi.fn() }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
const incarnation = '30000000-0000-4000-8000-000000000003';
const marker = encodeSyncWorkspaceMarker(
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002'
);
const initialIdentity = { incarnation, revision: 1 };
const authentication = () => ({ kind: 'basic', username: 'alice', password: 'private-password' });

beforeEach(() => vi.resetAllMocks());
afterEach(() => vi.unstubAllGlobals());

function fixture() {
  let state: SyncWorkspaceJoin | null = {
    version: 1,
    kind: 'sync-workspace-join',
    key: 'workspace-join',
    provider: 'webdav',
    rootUrl: 'https://dav.example/selected/',
    accountId: 'alice',
    createdAt: 1,
    identity: { ...initialIdentity },
    phase: 'planned',
    expected: null,
    workspace: null,
  };
  let tail = Promise.resolve();
  vi.stubGlobal('navigator', {
    locks: {
      request: async <T>(_name: string, _options: unknown, operation: () => Promise<T>) => {
        const previous = tail;
        const released = deferred<void>();
        tail = released.promise;
        await previous;
        try {
          return await operation();
        } finally {
          released.resolve();
        }
      },
    },
  });
  native.load.mockImplementation(async () => structuredClone(state));
  function cas(expected: SyncConnectionIdentity) {
    if (!state || !sameSyncConnectionIdentity(expected, state.identity))
      throw new Error('private native state');
    return state;
  }
  native.begin.mockImplementation(async (expected: SyncConnectionIdentity) => {
    const current = cas(expected);
    state = {
      ...current,
      phase: 'checking',
      expected: current.workspace ?? current.expected,
      workspace: null,
      identity: { incarnation, revision: current.identity.revision + 1 },
    };
    return structuredClone(state);
  });
  native.complete.mockImplementation(
    async (expected: SyncConnectionIdentity, evidence: unknown) => {
      const current = cas(expected);
      expect(current.phase).toBe('checking');
      expect(evidence).toEqual(marker.identity);
      state = {
        ...current,
        phase: 'ready',
        workspace: marker.identity,
        identity: { incarnation, revision: current.identity.revision + 1 },
      };
      return structuredClone(state);
    }
  );
  native.revoke.mockImplementation(async (expected: string) => {
    if (state && state.identity.incarnation !== expected)
      throw new Error('private foreign lifetime');
    state = null;
  });
  const files = new Map<string, Blob>([[SYNC_WORKSPACE_MARKER_KEY, new Blob([marker.text])]]);
  const permission = vi.fn(async (_origin: string) => true);
  const readKeys: string[] = [];
  const write = vi.fn(async () => {
    throw new Error('write forbidden');
  });
  let clientOptions: Parameters<typeof createWebdavRemoteStore>[0] | null = null;
  const response = vi.fn(async (key: string, _signal: AbortSignal): Promise<Response> => {
    const body = files.get(key);
    if (!body) throw new SyncRemoteError('missing');
    return new Response(body);
  });
  vi.mocked(createWebdavRemoteStore).mockImplementation(async (options, signal) => {
    clientOptions = options;
    const probe = await options.request(signal, async () => new Response(null, { status: 204 }));
    expect(probe.status).toBe(204);
    const remote: SyncRemoteStore = {
      async stat(key, requestSignal) {
        await options.request(requestSignal, async () => new Response(null, { status: 204 }));
        const body = files.get(key);
        if (!body) throw new SyncRemoteError('missing');
        return { size: body.size };
      },
      async read(key, requestSignal) {
        readKeys.push(key);
        const result = await options.request(requestSignal, (issuedSignal) =>
          response(key, issuedSignal)
        );
        if (!result.body) throw new Error('missing body');
        return result.body;
      },
      async list(prefix, { signal: requestSignal }) {
        await options.request(requestSignal, async () => new Response(null, { status: 204 }));
        return {
          objects: [...files]
            .filter(([key]) => key.startsWith(prefix))
            .map(([key, value]) => ({ key, size: value.size })),
          prefixes: [],
          nextCursor: null,
        };
      },
      write,
    };
    return remote;
  });
  return {
    files,
    permission,
    response,
    readKeys,
    write,
    state: () => structuredClone(state),
    replace(value: SyncWorkspaceJoin | null) {
      state = value;
    },
    options() {
      if (!clientOptions) throw new Error('client not created');
      return clientOptions;
    },
    discover(identity: unknown = initialIdentity) {
      return createWebdavWorkspaceJoin({
        identity,
        authentication: authentication(),
        hasOriginPermission: permission,
        operation: 'discover',
      });
    },
    workflow(auth: unknown = authentication(), identity: unknown = initialIdentity) {
      return createWebdavWorkspaceJoin({
        identity,
        authentication: auth,
        hasOriginPermission: permission,
      });
    },
  };
}

it('returns checked nonempty catalog only after drain and exact native readiness', async () => {
  const f = fixture();
  const record = await createSyncAttempt(
    JSON.stringify({
      format: 'sniptale-sync-operation',
      version: 1,
      spaceId: marker.identity.spaceId,
      operationId: 'operation',
      rootKind: 'media',
      rootId: 'root',
      kind: 'delete',
      parents: [],
      dependencies: [],
      envelope: null,
      objects: [],
    }),
    '40000000-0000-4000-8000-000000000004'
  );
  f.files.set(record.recordKey, new Blob([record.recordText]));
  f.files.set('Files/private/original.png', new Blob(['original']));
  const originalComplete = native.complete.getMockImplementation()!;
  native.complete.mockImplementationOnce(async (...args: unknown[]) => {
    const issue = vi.fn(async () => new Response(null, { status: 204 }));
    await expect(f.options().request(new AbortController().signal, issue)).rejects.toMatchObject({
      code: 'cancelled',
    });
    expect(issue).not.toHaveBeenCalled();
    return originalComplete(...args);
  });
  const workflow = f.workflow();
  const running = workflow.run();
  expect(workflow.run()).toBe(running);
  const result = await running;
  expect(result.intent.phase).toBe('ready');
  expect(result.intent.workspace).toEqual(marker.identity);
  expect(result.identity).toEqual(marker.identity);
  expect(result.catalog.operations.has('operation')).toBe(true);
  expect(f.readKeys).toEqual([
    SYNC_WORKSPACE_MARKER_KEY,
    record.recordKey,
    SYNC_WORKSPACE_MARKER_KEY,
  ]);
  expect(f.write).not.toHaveBeenCalled();
  expect(f.permission.mock.calls.every(([origin]) => origin === 'https://dav.example')).toBe(true);
  await workflow.close();
  expect(native.revoke).not.toHaveBeenCalled();
  expect(f.state()?.phase).toBe('ready');
  await expect(
    Promise.resolve().then(() => {
      const auth = f.options().authentication;
      return typeof auth === 'function' ? auth() : auth;
    })
  ).rejects.toMatchObject({ code: 'authentication' });
});

it.each(['missing', 'malformed', 'unsupported'])(
  'preserves retryable checking and installs no readiness after %s marker',
  async (condition) => {
    const f = fixture();
    if (condition === 'missing') f.files.delete(SYNC_WORKSPACE_MARKER_KEY);
    else
      f.files.set(
        SYNC_WORKSPACE_MARKER_KEY,
        new Blob([
          condition === 'malformed' ? '{}' : marker.text.replace('"version":1', '"version":2'),
        ])
      );
    const failed = f.workflow();
    await expect(failed.run()).rejects.toMatchObject({
      code:
        condition === 'missing'
          ? 'marker-missing'
          : condition === 'malformed'
            ? 'invalid-marker'
            : 'unsupported-format',
    });
    expect(f.state()?.phase).toBe('checking');
    expect(native.complete).not.toHaveBeenCalled();
    await failed.close();
    expect(native.revoke).not.toHaveBeenCalled();
    expect(f.write).not.toHaveBeenCalled();
    f.files.set(SYNC_WORKSPACE_MARKER_KEY, new Blob([marker.text]));
    const retry = f.workflow(authentication(), f.state()?.identity);
    expect((await retry.run()).intent.identity.revision).toBe(4);
    await retry.close();
  }
);

it('detaches authentication and selection before the first asynchronous load', async () => {
  const f = fixture();
  const auth = authentication();
  const selected = { ...initialIdentity };
  const workflow = f.workflow(auth, selected);
  auth.password = 'mutated';
  auth.username = 'bob';
  selected.revision++;
  const originalClient = vi.mocked(createWebdavRemoteStore).getMockImplementation()!;
  vi.mocked(createWebdavRemoteStore).mockImplementationOnce(async (options, signal) => {
    expect(typeof options.authentication).toBe('function');
    if (typeof options.authentication === 'function')
      expect(await options.authentication()).toEqual(authentication());
    return originalClient(options, signal);
  });
  await workflow.run();
  await workflow.close();
});

it('refuses account mismatch before native checking or any transport', async () => {
  const f = fixture();
  await expect(f.workflow({ ...authentication(), username: 'bob' }).run()).rejects.toMatchObject({
    code: 'invalid-configuration',
  });
  expect(native.begin).not.toHaveBeenCalled();
  expect(createWebdavRemoteStore).not.toHaveBeenCalled();
});

it.each(['erase', 'recreate', 'revision', 'permission'])(
  'refuses %s at final drained readiness admission',
  async (condition) => {
    const f = fixture();
    let checks = 0;
    f.permission.mockImplementation(async () => {
      checks++;
      // Probe, marker stat/read, catalog list and second marker stat/read precede final permission.
      if (checks === 7) {
        const changed = f.state();
        if (changed && condition === 'recreate')
          changed.identity.incarnation = '50000000-0000-4000-8000-000000000005';
        if (changed && condition === 'revision') changed.identity.revision++;
        if (condition !== 'permission') f.replace(condition === 'erase' ? null : changed);
        return condition !== 'permission';
      }
      return true;
    });
    await expect(f.workflow().run()).rejects.toMatchObject({
      code: condition === 'permission' ? 'access-denied' : 'unavailable',
    });
    expect(f.state()?.phase).not.toBe('ready');
  }
);

it('close before run revokes its lifetime and never starts transport', async () => {
  const f = fixture();
  const workflow = f.workflow();
  await workflow.close();
  await expect(workflow.run()).rejects.toMatchObject({ code: 'cancelled' });
  expect(native.revoke).toHaveBeenCalledExactlyOnceWith(incarnation);
  expect(createWebdavRemoteStore).not.toHaveBeenCalled();
  expect(f.state()).toBeNull();
});

it.each([
  { fail: false, discover: false },
  { fail: true, discover: false },
  { fail: false, discover: true },
  { fail: true, discover: true },
])(
  'active close drains issued bodies for discovery=$discover when native revocation fails=$fail',
  async ({ fail, discover }) => {
    const f = fixture();
    const issued = deferred<void>();
    const cancelling = deferred<void>();
    const disposed = deferred<void>();
    f.response.mockImplementationOnce(async () => {
      issued.resolve();
      return new Response(
        new ReadableStream<Uint8Array>({
          cancel() {
            cancelling.resolve();
            return disposed.promise;
          },
        })
      );
    });
    if (fail) native.revoke.mockRejectedValueOnce(new Error('private native failure'));
    const workflow = discover ? f.discover() : f.workflow();
    const running = expect(workflow.run()).rejects.toMatchObject({ code: 'cancelled' });
    await issued.promise;
    const closing = workflow.close();
    expect(workflow.close()).toBe(closing);
    let closed = false;
    const settled = fail
      ? expect(closing).rejects.toMatchObject({ code: 'containment-failed' })
      : closing.then(() => {
          closed = true;
        });
    await cancelling.promise;
    expect(closed).toBe(false);
    disposed.resolve();
    await settled;
    await running;
    expect(native.complete).not.toHaveBeenCalled();
    expect(f.state()?.phase).not.toBe('ready');
  }
);

it.each([false, true])(
  'refuses successful closure and readiness after body cancellation fails discovery=%s',
  async (discover) => {
    const f = fixture();
    const issued = deferred<void>();
    f.response.mockImplementationOnce(async () => {
      issued.resolve();
      return new Response(
        new ReadableStream<Uint8Array>({
          cancel() {
            throw new Error('private body failure');
          },
        })
      );
    });
    const workflow = discover ? f.discover() : f.workflow();
    const running = expect(workflow.run()).rejects.toMatchObject({ code: 'containment-failed' });
    await issued.promise;
    await expect(workflow.close()).rejects.toMatchObject({ code: 'containment-failed' });
    await running;
    expect(native.complete).not.toHaveBeenCalled();
  }
);

it('revokes a ready revision when close races the final native completion result', async () => {
  const f = fixture();
  const committed = deferred<void>();
  const release = deferred<void>();
  const original = native.complete.getMockImplementation()!;
  native.complete.mockImplementationOnce(async (...args: unknown[]) => {
    const ready = await original(...args);
    committed.resolve();
    await release.promise;
    return ready;
  });
  const workflow = f.workflow();
  const running = expect(workflow.run()).rejects.toMatchObject({ code: 'cancelled' });
  await committed.promise;
  expect(f.state()?.phase).toBe('ready');
  const closing = workflow.close();
  expect(f.state()).toBeNull();
  release.resolve();
  await closing;
  await running;
  expect(native.revoke).toHaveBeenCalledExactlyOnceWith(incarnation);
});

it('preserves a ready workspace expectation during explicit rechecking', async () => {
  const f = fixture();
  await f.workflow().run();
  const ready = f.state();
  const replacement = encodeSyncWorkspaceMarker(
    marker.identity.spaceId,
    '60000000-0000-4000-8000-000000000006'
  );
  f.files.set(SYNC_WORKSPACE_MARKER_KEY, new Blob([replacement.text]));
  const retry = f.workflow(authentication(), ready?.identity);
  await expect(retry.run()).rejects.toMatchObject({ code: 'binding-mismatch' });
  expect(f.state()?.phase).toBe('checking');
  expect(f.state()?.expected).toEqual(marker.identity);
  expect(f.state()?.workspace).toBeNull();
  await retry.close();
  expect(native.revoke).not.toHaveBeenCalled();
  expect(native.complete).toHaveBeenCalledOnce();
});

it('contains active IO while refusing to revoke a replacement lifetime', async () => {
  const f = fixture();
  const issued = deferred<void>();
  const cancelled = deferred<void>();
  f.response.mockImplementationOnce(async () => {
    issued.resolve();
    return new Response(
      new ReadableStream<Uint8Array>({
        cancel() {
          cancelled.resolve();
        },
      })
    );
  });
  const workflow = f.workflow();
  const running = expect(workflow.run()).rejects.toMatchObject({ code: 'cancelled' });
  await issued.promise;
  const replacement = f.state();
  if (!replacement) throw new Error('checking intent missing');
  replacement.identity.incarnation = '50000000-0000-4000-8000-000000000005';
  f.replace(replacement);
  await expect(workflow.close()).rejects.toMatchObject({ code: 'containment-failed' });
  await cancelled.promise;
  await running;
  expect(f.state()).toEqual(replacement);
  expect(native.complete).not.toHaveBeenCalled();
});

it(
  'discovers an exact workspace with the advanced checking source and no native ' +
    'readiness or original reads',
  async () => {
    const f = fixture();
    f.files.set('Files/private/original.png', new Blob(['original']));
    const discovery = f.discover();
    const result = await discovery.run();
    expect(result).toEqual({
      operation: 'discover',
      source: { kind: 'join', identity: { incarnation, revision: 2 } },
      discovery: {
        scope: 'exact',
        complete: true,
        candidates: [{ prefix: '', identity: marker.identity }],
        issues: [],
      },
    });
    expect(f.state()?.phase).toBe('checking');
    expect(f.readKeys).toEqual([SYNC_WORKSPACE_MARKER_KEY]);
    expect(native.complete).not.toHaveBeenCalled();
    expect(f.write).not.toHaveBeenCalled();
    await discovery.close();
    expect(native.revoke).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain('private-password');
  }
);

it('discovers only immediate child markers and preserves an empty result without creation', async () => {
  const f = fixture();
  f.files.delete(SYNC_WORKSPACE_MARKER_KEY);
  const empty = await f.discover().run();
  expect(empty.discovery).toEqual({
    scope: 'children',
    complete: true,
    candidates: [],
    issues: [],
  });
  const current = f.state()!;
  f.files.set('one/' + SYNC_WORKSPACE_MARKER_KEY, new Blob([marker.text]));
  f.files.set('two/' + SYNC_WORKSPACE_MARKER_KEY, new Blob([marker.text]));
  f.files.set('one/Files/original.png', new Blob(['original']));
  const factory = vi.mocked(createWebdavRemoteStore).getMockImplementation()!;
  vi.mocked(createWebdavRemoteStore).mockImplementationOnce(async (options, signal) => {
    const remote = await factory(options, signal);
    remote.list = async () => ({ objects: [], prefixes: ['one/', 'two/'], nextCursor: null });
    return remote;
  });
  const result = await f.discover(current.identity).run();
  expect(result.discovery.candidates.map((candidate) => candidate.prefix)).toEqual([
    'one/',
    'two/',
  ]);
  expect(f.readKeys).toEqual([
    'one/' + SYNC_WORKSPACE_MARKER_KEY,
    'two/' + SYNC_WORKSPACE_MARKER_KEY,
  ]);
  expect(native.complete).not.toHaveBeenCalled();
  expect(f.write).not.toHaveBeenCalled();
});

it('refuses discovery for an already selected workspace before replacing its expected identity', async () => {
  const f = fixture();
  const selected = f.state()!;
  selected.expected = marker.identity;
  f.replace(selected);
  await expect(f.discover().run()).rejects.toMatchObject({ code: 'join-refused' });
  expect(native.begin).not.toHaveBeenCalled();
  expect(createWebdavRemoteStore).not.toHaveBeenCalled();
});

it.each(['erase', 'recreate', 'revision', 'permission'] as const)(
  'refuses discovery after %s during final permission wait',
  async (change) => {
    const f = fixture();
    const entered = deferred<void>();
    const held = deferred<void>();
    let checks = 0;
    f.permission.mockImplementation(async () => {
      if (++checks === 4) {
        entered.resolve();
        await held.promise;
        return change !== 'permission';
      }
      return true;
    });
    const result = expect(f.discover().run()).rejects.toMatchObject({
      code: change === 'permission' ? 'access-denied' : 'join-refused',
    });
    await entered.promise;
    const replacement = f.state()!;
    if (change === 'recreate')
      replacement.identity.incarnation = '50000000-0000-4000-8000-000000000005';
    if (change === 'revision') replacement.identity.revision++;
    if (change !== 'permission') f.replace(change === 'erase' ? null : replacement);
    held.resolve();
    await result;
    expect(native.complete).not.toHaveBeenCalled();
  }
);

it('cancels discovery during the final permission wait without publishing a late observation', async () => {
  const f = fixture();
  const entered = deferred<void>();
  const held = deferred<void>();
  let checks = 0;
  f.permission.mockImplementation(async () => {
    if (++checks === 4) {
      entered.resolve();
      await held.promise;
    }
    return true;
  });
  const discovery = f.discover();
  const running = expect(discovery.run()).rejects.toMatchObject({ code: 'cancelled' });
  await entered.promise;
  const closed = discovery.close();
  held.resolve();
  await closed;
  await running;
  expect(native.revoke).toHaveBeenCalledExactlyOnceWith(incarnation);
  expect(native.complete).not.toHaveBeenCalled();
});

it.each(['malformed', 'unsupported', 'denied', 'bootstrap'] as const)(
  'retains incomplete discovery for %s without preparing or reading originals',
  async (condition) => {
    const f = fixture();
    if (condition === 'malformed') f.files.set(SYNC_WORKSPACE_MARKER_KEY, new Blob(['{}']));
    if (condition === 'unsupported')
      f.files.set(
        SYNC_WORKSPACE_MARKER_KEY,
        new Blob([marker.text.replace('"version":1', '"version":2')])
      );
    if (condition === 'denied')
      f.response.mockRejectedValueOnce(new SyncRemoteError('access-denied'));
    if (condition === 'bootstrap') {
      f.files.delete(SYNC_WORKSPACE_MARKER_KEY);
      const factory = vi.mocked(createWebdavRemoteStore).getMockImplementation()!;
      vi.mocked(createWebdavRemoteStore).mockImplementationOnce(async (options, signal) => {
        const remote = await factory(options, signal);
        remote.list = async () => ({ objects: [], prefixes: ['.sniptale/'], nextCursor: null });
        return remote;
      });
    }
    const workflow = f.discover();
    const result = await workflow.run();
    expect(result.discovery.complete).toBe(false);
    expect(result.discovery.candidates).toEqual([]);
    expect(result.discovery.issues).toEqual([
      {
        prefix: '',
        code:
          condition === 'malformed'
            ? 'invalid-marker'
            : condition === 'unsupported'
              ? 'unsupported-format'
              : condition === 'denied'
                ? 'access-denied'
                : 'bootstrap-incomplete',
      },
    ]);
    await workflow.close();
    expect(native.complete).not.toHaveBeenCalled();
    expect(native.revoke).not.toHaveBeenCalled();
    expect(f.write).not.toHaveBeenCalled();
    expect(f.readKeys.every((key) => key === SYNC_WORKSPACE_MARKER_KEY)).toBe(true);
  }
);

import { beforeEach, expect, it, vi } from 'vitest';
import type { SyncWorkspaceAllocation } from '../../composition/persistence/remote-connection/workspace-allocation';
import {
  parseSyncWorkspaceMarker,
  SYNC_WORKSPACE_MARKER_KEY,
} from '../../contracts/sync-workspace';
import { finishWebdavWorkspaceCreation } from './webdav-workspace';
import { SyncRemoteError, type SyncRemotePage, type SyncRemoteStore } from './remote-store';
import { hashSyncText } from './wire-record';

const native = vi.hoisted(() => ({
  load: vi.fn(),
  prepare: vi.fn(),
  command: vi.fn(),
  complete: vi.fn(),
}));
vi.mock('../../composition/persistence/remote-connection/workspace-allocation', () => ({
  loadSyncWorkspaceAllocation: native.load,
  prepareSyncWorkspaceMarker: native.prepare,
  commandSyncWorkspaceAllocation: native.command,
  completeSyncWorkspaceMarker: native.complete,
}));

const spaceId = '10000000-0000-4000-8000-000000000001';
const bootstrapId = '20000000-0000-4000-8000-000000000002';
const incarnation = '30000000-0000-4000-8000-000000000003';
const text = JSON.stringify({
  format: 'sniptale-sync-workspace',
  version: 1,
  protocol: 'immutable-records-v1',
  protection: 'plaintext',
  spaceId,
  bootstrapId,
});
const marker = { text, fingerprint: hashSyncText(text) };
const signal = () => new AbortController().signal;

beforeEach(() => vi.resetAllMocks());

function fixture(phase: SyncWorkspaceAllocation['phase'] = 'allocated') {
  let state: SyncWorkspaceAllocation | null = {
    version: 2,
    kind: 'sync-workspace-allocation',
    key: 'workspace-allocation',
    provider: 'webdav',
    parentUrl: 'https://example.invalid/parent/',
    rootUrl: `https://example.invalid/parent/Sniptale-${bootstrapId}/`,
    accountId: 'account',
    spaceId,
    bootstrapId,
    createdAt: 1,
    identity: { incarnation, revision: 3 },
    phase,
    marker:
      phase === 'allocated' ||
      phase === 'planned' ||
      phase === 'allocating' ||
      phase === 'abandoned'
        ? null
        : structuredClone(marker),
  };
  const events: string[] = [];
  const files = new Map<string, Blob>();
  const directories = new Set<string>();
  if (phase === 'publishing-marker' || phase === 'ready') directories.add('.sniptale/');
  const initialIdentity = structuredClone(state.identity);
  function cas(expected: unknown, required: SyncWorkspaceAllocation['phase'][]) {
    if (
      !state ||
      JSON.stringify(expected) !== JSON.stringify(state.identity) ||
      !required.includes(state.phase)
    )
      throw new Error('native refused');
    return state;
  }
  function advance(current: SyncWorkspaceAllocation, next: SyncWorkspaceAllocation['phase']) {
    state = {
      ...current,
      phase: next,
      identity: { incarnation, revision: current.identity.revision + 1 },
    };
    return structuredClone(state);
  }
  native.load.mockImplementation(async () => structuredClone(state));
  native.prepare.mockImplementation(async (expected: unknown) => {
    const current = cas(expected, ['allocated']);
    events.push('freeze');
    return advance({ ...current, marker: structuredClone(marker) }, 'preparing-marker');
  });
  native.command.mockImplementation(async (expected: unknown, action: unknown) => {
    expect(action).toBe('publish-marker');
    const current = cas(expected, ['preparing-marker', 'publishing-marker']);
    events.push('reserve');
    return advance(current, 'publishing-marker');
  });
  native.complete.mockImplementation(async (expected: unknown, evidence: unknown) => {
    const current = cas(expected, ['publishing-marker']);
    expect(evidence).toEqual(parseSyncWorkspaceMarker(text));
    events.push('complete');
    return advance(current, 'ready');
  });
  const list = vi.fn(async (prefix: string): Promise<SyncRemotePage> => {
    events.push(`list:${prefix}`);
    if (prefix && !directories.has(prefix)) throw new SyncRemoteError('missing');
    return {
      objects: [...files]
        .filter(([key]) => key.startsWith(prefix) && !key.slice(prefix.length).includes('/'))
        .map(([key, body]) => ({ key, size: body.size })),
      prefixes: [...directories].filter(
        (key) =>
          key !== prefix &&
          key.startsWith(prefix) &&
          !key.slice(prefix.length).replace(/\/$/u, '').includes('/')
      ),
      nextCursor: null,
    };
  });
  const stat = vi.fn(async (key: string) => {
    events.push(`stat:${key}`);
    const body = files.get(key);
    if (!body) throw new SyncRemoteError('missing');
    return { size: body.size };
  });
  const read = vi.fn(async (key: string) => {
    const body = files.get(key);
    if (!body) throw new SyncRemoteError('missing');
    return body.stream();
  });
  const write = vi.fn(async () => {
    throw new Error('generic write forbidden');
  });
  const remote: SyncRemoteStore = { list, stat, read, write };
  const createMetadataDirectory = vi.fn(async () => {
    expect(state?.phase).toBe('preparing-marker');
    events.push('mkcol');
    directories.add('.sniptale/');
  });
  const publishMarker = vi.fn(async (body: unknown) => {
    expect(state?.phase).toBe('publishing-marker');
    expect(body).toBe(text);
    events.push('put');
    if (files.has(SYNC_WORKSPACE_MARKER_KEY)) throw new SyncRemoteError('collision', 412);
    files.set(SYNC_WORKSPACE_MARKER_KEY, new Blob([text]));
  });
  const factory = vi.fn(async (plan: SyncWorkspaceAllocation) => {
    expect(plan).toEqual(state);
    events.push(`client:${plan.identity.revision}`);
    return { remote, createMetadataDirectory, publishMarker };
  });
  return {
    factory,
    files,
    directories,
    events,
    initialIdentity,
    list,
    stat,
    read,
    write,
    publishMarker,
    createMetadataDirectory,
    current: () => structuredClone(state),
    replace: (replacement: SyncWorkspaceAllocation | null) => {
      state = replacement;
    },
  };
}

it('freezes before MKCOL, binds fresh clients, and completes only after checked readback', async () => {
  const io = fixture();
  const result = await finishWebdavWorkspaceCreation(io.factory, io.initialIdentity, signal());
  expect(result.allocation.phase).toBe('ready');
  expect(result.identity).toEqual(parseSyncWorkspaceMarker(text));
  expect(io.events.indexOf('freeze')).toBeLessThan(io.events.indexOf('mkcol'));
  expect(io.events.indexOf('reserve')).toBeLessThan(io.events.indexOf('put'));
  expect(io.factory.mock.calls.map(([plan]) => plan.identity.revision)).toEqual([3, 4, 5]);
  expect(io.publishMarker).toHaveBeenCalledTimes(1);
  expect(io.read).toHaveBeenCalledTimes(2);
  expect(io.write).not.toHaveBeenCalled();
});

it('recovers a lost PUT acknowledgement with one checked readback', async () => {
  const io = fixture();
  io.publishMarker.mockImplementationOnce(async () => {
    io.files.set(SYNC_WORKSPACE_MARKER_KEY, new Blob([text]));
    throw new SyncRemoteError('transport');
  });
  await expect(
    finishWebdavWorkspaceCreation(io.factory, io.initialIdentity, signal())
  ).resolves.toMatchObject({ allocation: { phase: 'ready' } });
  expect(io.publishMarker).toHaveBeenCalledTimes(1);
  expect(io.read).toHaveBeenCalledTimes(2);
});

it('restarts publishing with a matching marker without PUT or a new reservation', async () => {
  const io = fixture('publishing-marker');
  io.files.set(SYNC_WORKSPACE_MARKER_KEY, new Blob([text]));
  await expect(
    finishWebdavWorkspaceCreation(io.factory, io.initialIdentity, signal())
  ).resolves.toMatchObject({ allocation: { phase: 'ready' } });
  expect(io.publishMarker).not.toHaveBeenCalled();
  expect(native.command).not.toHaveBeenCalled();
  expect(io.createMetadataDirectory).not.toHaveBeenCalled();
});

it('retains publishing after 423 and retries explicitly with fresh revision and identical bytes', async () => {
  const io = fixture();
  io.publishMarker.mockRejectedValueOnce(new SyncRemoteError('temporary', 423));
  await expect(
    finishWebdavWorkspaceCreation(io.factory, io.initialIdentity, signal())
  ).rejects.toMatchObject({ code: 'temporary', status: 423 });
  const pending = io.current();
  expect(pending?.phase).toBe('publishing-marker');
  expect(pending?.marker).toEqual(marker);
  await expect(
    finishWebdavWorkspaceCreation(io.factory, pending?.identity, signal())
  ).resolves.toMatchObject({ allocation: { phase: 'ready' } });
  expect(io.publishMarker.mock.calls.map(([body]) => body)).toEqual([text, text]);
  expect(native.command).toHaveBeenCalledTimes(2);
});

it.each(['foreign-file', 'foreign-prefix', 'metadata-file'])(
  'refuses %s without PUT or cleanup',
  async (foreign) => {
    const io = fixture('preparing-marker');
    if (foreign === 'foreign-file') io.files.set('private.bin', new Blob(['private']));
    if (foreign === 'foreign-prefix') io.directories.add('Private/');
    if (foreign === 'metadata-file') {
      io.directories.add('.sniptale/');
      io.files.set('.sniptale/foreign.json', new Blob(['private']));
    }
    await expect(
      finishWebdavWorkspaceCreation(io.factory, io.initialIdentity, signal())
    ).rejects.toMatchObject({ code: 'foreign-metadata' });
    expect(io.publishMarker).not.toHaveBeenCalled();
    expect(io.read).not.toHaveBeenCalled();
    expect(native.command).not.toHaveBeenCalled();
  }
);

it('refuses any existing metadata in the initially allocated root before freezing', async () => {
  const io = fixture();
  io.directories.add('.sniptale/');
  await expect(
    finishWebdavWorkspaceCreation(io.factory, io.initialIdentity, signal())
  ).rejects.toMatchObject({ code: 'foreign-metadata' });
  expect(native.prepare).not.toHaveBeenCalled();
});

it('requires an explicit successful empty relist after metadata MKCOL 405', async () => {
  const io = fixture('preparing-marker');
  io.createMetadataDirectory.mockImplementationOnce(async () => {
    io.directories.add('.sniptale/');
    throw new SyncRemoteError('collision', 405);
  });
  await expect(
    finishWebdavWorkspaceCreation(io.factory, io.initialIdentity, signal())
  ).resolves.toMatchObject({ allocation: { phase: 'ready' } });
  expect(io.list.mock.calls.map(([prefix]) => prefix).slice(0, 3)).toEqual(['', '', '.sniptale/']);
});

it('does not treat metadata MKCOL 405 alone as ownership', async () => {
  const io = fixture('preparing-marker');
  io.createMetadataDirectory.mockRejectedValueOnce(new SyncRemoteError('collision', 405));
  await expect(
    finishWebdavWorkspaceCreation(io.factory, io.initialIdentity, signal())
  ).rejects.toMatchObject({ code: 'foreign-metadata' });
  expect(io.publishMarker).not.toHaveBeenCalled();
});

it('refuses an unknown publishing marker without PUT', async () => {
  const io = fixture('publishing-marker');
  io.files.set(SYNC_WORKSPACE_MARKER_KEY, new Blob(['foreign']));
  await expect(
    finishWebdavWorkspaceCreation(io.factory, io.initialIdentity, signal())
  ).rejects.toMatchObject({ code: 'invalid-marker' });
  expect(io.publishMarker).not.toHaveBeenCalled();
  expect(native.complete).not.toHaveBeenCalled();
});

it('refuses a different canonical publishing identity without PUT', async () => {
  const io = fixture('publishing-marker');
  io.files.set(SYNC_WORKSPACE_MARKER_KEY, new Blob([text.replace(spaceId, bootstrapId)]));
  await expect(
    finishWebdavWorkspaceCreation(io.factory, io.initialIdentity, signal())
  ).rejects.toMatchObject({ code: 'binding-mismatch' });
  expect(io.publishMarker).not.toHaveBeenCalled();
});

it('never recovers an invalid PUT response silently', async () => {
  const io = fixture();
  io.publishMarker.mockImplementationOnce(async () => {
    io.files.set(SYNC_WORKSPACE_MARKER_KEY, new Blob([text]));
    throw new SyncRemoteError('invalid-response');
  });
  await expect(
    finishWebdavWorkspaceCreation(io.factory, io.initialIdentity, signal())
  ).rejects.toMatchObject({ code: 'invalid-response' });
  expect(io.read).not.toHaveBeenCalled();
  expect(io.current()?.phase).toBe('publishing-marker');
});

it('cancellation after PUT prevents readback and native completion', async () => {
  const io = fixture();
  const controller = new AbortController();
  io.publishMarker.mockImplementationOnce(async () => {
    io.files.set(SYNC_WORKSPACE_MARKER_KEY, new Blob([text]));
    controller.abort();
    throw new SyncRemoteError('transport');
  });
  await expect(
    finishWebdavWorkspaceCreation(io.factory, io.initialIdentity, controller.signal)
  ).rejects.toMatchObject({ code: 'cancelled' });
  expect(io.read).not.toHaveBeenCalled();
  expect(native.complete).not.toHaveBeenCalled();
});

it('refuses stale completion after erase and recreation while readback is pending', async () => {
  const io = fixture('publishing-marker');
  io.files.set(SYNC_WORKSPACE_MARKER_KEY, new Blob([text]));
  const originalRead = io.read.getMockImplementation();
  io.read.mockImplementationOnce(async (key) => {
    const current = io.current();
    if (!current || !originalRead) throw new Error('fixture missing');
    io.replace({
      ...current,
      identity: { incarnation: bootstrapId, revision: current.identity.revision },
    });
    return originalRead(key);
  });
  await expect(
    finishWebdavWorkspaceCreation(io.factory, io.initialIdentity, signal())
  ).rejects.toMatchObject({ code: 'allocation-refused' });
  expect(io.current()?.phase).toBe('publishing-marker');
  expect(io.publishMarker).not.toHaveBeenCalled();
});

it('never reinitializes a ready root with a missing marker', async () => {
  const io = fixture('ready');
  await expect(
    finishWebdavWorkspaceCreation(io.factory, io.initialIdentity, signal())
  ).rejects.toMatchObject({ code: 'marker-missing' });
  expect(io.createMetadataDirectory).not.toHaveBeenCalled();
  expect(io.publishMarker).not.toHaveBeenCalled();
  expect(native.command).not.toHaveBeenCalled();
});

it.each(['planned', 'allocating', 'abandoned'] as const)(
  'refuses %s before binding a client',
  async (phase) => {
    const io = fixture(phase);
    await expect(
      finishWebdavWorkspaceCreation(io.factory, io.initialIdentity, signal())
    ).rejects.toMatchObject({ code: 'allocation-refused' });
    expect(io.factory).not.toHaveBeenCalled();
  }
);

it('prior cancellation starts no native or remote work', async () => {
  const io = fixture();
  const controller = new AbortController();
  controller.abort();
  await expect(
    finishWebdavWorkspaceCreation(io.factory, io.initialIdentity, controller.signal)
  ).rejects.toMatchObject({ code: 'cancelled' });
  expect(native.load).not.toHaveBeenCalled();
  expect(io.factory).not.toHaveBeenCalled();
});

it('refuses an incomplete root listing instead of accepting an empty page', async () => {
  const io = fixture();
  io.list.mockResolvedValueOnce({ objects: [], prefixes: [], nextCursor: 'more' });
  await expect(
    finishWebdavWorkspaceCreation(io.factory, io.initialIdentity, signal())
  ).rejects.toMatchObject({ code: 'metadata-limit' });
  expect(native.prepare).not.toHaveBeenCalled();
});

it('checks a ready workspace without issuing native commands or writes', async () => {
  const io = fixture('ready');
  io.files.set(SYNC_WORKSPACE_MARKER_KEY, new Blob([text]));
  await expect(
    finishWebdavWorkspaceCreation(io.factory, io.initialIdentity, signal())
  ).resolves.toMatchObject({ allocation: { phase: 'ready' } });
  expect(native.prepare).not.toHaveBeenCalled();
  expect(native.command).not.toHaveBeenCalled();
  expect(native.complete).not.toHaveBeenCalled();
  expect(io.publishMarker).not.toHaveBeenCalled();
});

it('cancellation after marker freeze prevents metadata creation', async () => {
  const io = fixture();
  const controller = new AbortController();
  const prepare = native.prepare.getMockImplementation();
  native.prepare.mockImplementationOnce(async (expected: unknown) => {
    if (!prepare) throw new Error('fixture missing');
    const plan: SyncWorkspaceAllocation = await prepare(expected);
    controller.abort();
    return plan;
  });
  await expect(
    finishWebdavWorkspaceCreation(io.factory, io.initialIdentity, controller.signal)
  ).rejects.toMatchObject({ code: 'cancelled' });
  expect(io.current()?.phase).toBe('preparing-marker');
  expect(io.createMetadataDirectory).not.toHaveBeenCalled();
  expect(io.publishMarker).not.toHaveBeenCalled();
});

it('refuses a stale supplied revision without creating a client', async () => {
  const io = fixture();
  await expect(
    finishWebdavWorkspaceCreation(io.factory, { ...io.initialIdentity, revision: 2 }, signal())
  ).rejects.toMatchObject({ code: 'allocation-refused' });
  expect(io.factory).not.toHaveBeenCalled();
});

it('does not expose an unknown factory failure', async () => {
  const io = fixture();
  io.factory.mockRejectedValueOnce(new Error('password at https://private.invalid/'));
  const failure: unknown = await finishWebdavWorkspaceCreation(
    io.factory,
    io.initialIdentity,
    signal()
  ).catch((error: unknown) => error);
  expect(failure).toMatchObject({ code: 'unavailable', message: 'unavailable' });
  expect(JSON.stringify(failure)).not.toContain('private');
});

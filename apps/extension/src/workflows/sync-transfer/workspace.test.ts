import { expect, it, vi } from 'vitest';
import {
  prepareSyncWorkspaceJoin,
  verifySyncWorkspaceIdentity,
  SyncWorkspaceError,
} from './workspace';
import { SyncRemoteError, type SyncRemoteStore } from './remote-store';
import { createSyncAttempt, hashSyncText } from './wire-record';

const spaceId = '10000000-0000-4000-8000-000000000001';
const bootstrapId = '20000000-0000-4000-8000-000000000002';
const markerKey = '.sniptale/workspace.json';
const prefix = `.sniptale/${hashSyncText(spaceId)}/records/`;
const marker = {
  format: 'sniptale-sync-workspace',
  version: 1,
  protocol: 'immutable-records-v1',
  protection: 'plaintext',
  spaceId,
  bootstrapId,
};
const text = JSON.stringify(marker);
const identity = { spaceId, bootstrapId, fingerprint: hashSyncText(text) };
const signal = () => new AbortController().signal;

function fixture(body: Blob = new Blob([text])) {
  const data = new Map<string, Blob>([[markerKey, body]]);
  const stat = vi.fn(async (key: string) => {
    const entry = data.get(key);
    if (!entry) throw new SyncRemoteError('missing');
    return { size: entry.size };
  });
  const read = vi.fn(async (key: string): Promise<ReadableStream<Uint8Array>> => {
    const entry = data.get(key);
    if (!entry) throw new SyncRemoteError('missing');
    return entry.stream();
  });
  const list = vi.fn(async (selected: string) => {
    expect(selected).toBe(prefix);
    return {
      objects: [...data]
        .filter(([key]) => key.startsWith(selected))
        .map(([key, value]) => ({ key, size: value.size })),
      prefixes: [],
      nextCursor: null,
    };
  });
  const write = vi.fn(async () => {
    throw new Error('No remote writes are permitted.');
  });
  const remote: SyncRemoteStore = { stat, read, list, write };
  return { remote, data, stat, read, list, write };
}

async function record(operationId = 'operation', parents: string[] = []) {
  return createSyncAttempt(
    JSON.stringify({
      format: 'sniptale-sync-operation',
      version: 1,
      spaceId,
      operationId,
      rootKind: 'media',
      rootId: 'root',
      kind: 'delete',
      parents,
      dependencies: [],
      envelope: null,
      objects: [],
    }),
    '30000000-0000-4000-8000-000000000003'
  );
}

it('discovers exact identity and fresh metadata without media reads or writes', async () => {
  const io = fixture();
  const entry = await record();
  io.data.set(entry.recordKey, new Blob([entry.recordText]));
  io.data.set('Files/private/original.png', new Blob(['must not read']));
  const result = await prepareSyncWorkspaceJoin(io.remote, signal());
  expect(result.identity).toEqual(identity);
  expect(result.catalog.operations.has('operation')).toBe(true);
  expect(io.stat.mock.calls.map(([key]) => key)).toEqual([markerKey, markerKey]);
  expect(io.read.mock.calls.map(([key]) => key)).toEqual([markerKey, entry.recordKey, markerKey]);
  expect(io.list).toHaveBeenCalledTimes(1);
  expect(io.write).not.toHaveBeenCalled();
});

it('accepts a finalized empty workspace even before a records collection exists', async () => {
  const io = fixture();
  io.list.mockRejectedValueOnce(new SyncRemoteError('missing'));
  const result = await prepareSyncWorkspaceJoin(io.remote, signal(), identity);
  expect(result.catalog.operations.size).toBe(0);
  expect(result.identity).toEqual(identity);
  expect(io.read).toHaveBeenCalledTimes(2);
});

it('refuses ordinary or markerless pilot roots without listing or repairing them', async () => {
  const io = fixture();
  io.data.delete(markerKey);
  await expect(prepareSyncWorkspaceJoin(io.remote, signal())).rejects.toMatchObject({
    code: 'marker-missing',
  });
  expect(io.list).not.toHaveBeenCalled();
  expect(io.write).not.toHaveBeenCalled();
});

it.each([
  { format: 'other' },
  { version: 2 },
  { protocol: 'head-cas-v1' },
  { protection: 'encrypted' },
])('refuses unsupported workspace format %j before catalog access', async (change) => {
  const io = fixture(new Blob([JSON.stringify({ ...marker, ...change })]));
  await expect(prepareSyncWorkspaceJoin(io.remote, signal())).rejects.toMatchObject({
    code: 'unsupported-format',
  });
  expect(io.list).not.toHaveBeenCalled();
});

it.each([
  '{}',
  'null',
  '[]',
  '{',
  `${text}\n`,
  `\uFEFF${text}`,
  JSON.stringify({ ...marker, endpoint: 'https://other.invalid/' }),
  JSON.stringify({ ...marker, spaceId: '../escape' }),
  JSON.stringify({ ...marker, bootstrapId: '20000000-0000-1000-8000-000000000002' }),
  text.replace('"version":1', '"version":1,"version":1'),
])('rejects malformed, noncanonical or path-bearing marker %#', async (input) => {
  const io = fixture(new Blob([input]));
  await expect(prepareSyncWorkspaceJoin(io.remote, signal())).rejects.toMatchObject({
    code: 'invalid-marker',
  });
  expect(io.list).not.toHaveBeenCalled();
});

it('rejects invalid UTF-8 without exposing the remote body', async () => {
  const io = fixture(new Blob([new Uint8Array([0xc3, 0x28])]));
  await expect(prepareSyncWorkspaceJoin(io.remote, signal())).rejects.toThrow('invalid-marker');
});

it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
  'refuses invalid stat size %s without GET',
  async (size) => {
    const io = fixture();
    io.stat.mockResolvedValueOnce({ size });
    await expect(prepareSyncWorkspaceJoin(io.remote, signal())).rejects.toMatchObject({
      code: 'invalid-marker',
    });
    expect(io.read).not.toHaveBeenCalled();
  }
);

it('refuses oversized metadata before reading its body', async () => {
  const io = fixture(new Blob(['x'.repeat(4097)]));
  await expect(prepareSyncWorkspaceJoin(io.remote, signal())).rejects.toMatchObject({
    code: 'metadata-limit',
  });
  expect(io.read).not.toHaveBeenCalled();
});

it('caps actual streamed bytes and cancels an oversized body despite a false stat', async () => {
  const io = fixture();
  const cancel = vi.fn();
  io.read.mockResolvedValueOnce(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(4097));
      },
      cancel,
    })
  );
  await expect(prepareSyncWorkspaceJoin(io.remote, signal())).rejects.toMatchObject({
    code: 'metadata-limit',
  });
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(io.list).not.toHaveBeenCalled();
});

it.each([text.length - 1, text.length + 1])(
  'rejects inconsistent observed length %s',
  async (size) => {
    const io = fixture();
    io.stat.mockResolvedValueOnce({ size });
    await expect(prepareSyncWorkspaceJoin(io.remote, signal())).rejects.toMatchObject({
      code: 'invalid-marker',
    });
  }
);

it.each([
  { ...identity, spaceId: bootstrapId },
  { ...identity, bootstrapId: spaceId },
  { ...identity, fingerprint: 'a'.repeat(64) },
])('refuses a mismatched prior binding before catalog access %#', async (expected) => {
  const io = fixture();
  await expect(prepareSyncWorkspaceJoin(io.remote, signal(), expected)).rejects.toMatchObject({
    code: 'binding-mismatch',
  });
  expect(io.list).not.toHaveBeenCalled();
});

it.each([
  {},
  { ...identity, rootUrl: 'https://other.invalid/' },
  { ...identity, fingerprint: 'bad' },
])('rejects malformed expected binding before any IO %#', async (expected) => {
  const io = fixture();
  await expect(prepareSyncWorkspaceJoin(io.remote, signal(), expected)).rejects.toMatchObject({
    code: 'invalid-binding',
  });
  expect(io.stat).not.toHaveBeenCalled();
});

it('detaches caller-owned expected identity before the first async operation', async () => {
  const io = fixture();
  const expected = { ...identity };
  io.stat.mockImplementationOnce(async () => {
    expected.fingerprint = 'a'.repeat(64);
    return { size: new Blob([text]).size };
  });
  await expect(prepareSyncWorkspaceJoin(io.remote, signal(), expected)).resolves.toMatchObject({
    identity,
  });
});

it('refuses observed replacement after scanning without publishing a result', async () => {
  const io = fixture();
  io.list.mockImplementationOnce(async () => {
    io.data.set(markerKey, new Blob([JSON.stringify({ ...marker, bootstrapId: spaceId })]));
    return { objects: [], prefixes: [], nextCursor: null };
  });
  await expect(prepareSyncWorkspaceJoin(io.remote, signal())).rejects.toMatchObject({
    code: 'workspace-changed',
  });
});

it('refuses disappearance after scanning without recreating the marker', async () => {
  const io = fixture();
  io.list.mockImplementationOnce(async () => {
    io.data.delete(markerKey);
    return { objects: [], prefixes: [], nextCursor: null };
  });
  await expect(prepareSyncWorkspaceJoin(io.remote, signal())).rejects.toMatchObject({
    code: 'marker-missing',
  });
  expect(io.write).not.toHaveBeenCalled();
});

it('retains blocked and invalid catalog evidence without claiming writable enrollment', async () => {
  const io = fixture();
  const entry = await record('child', ['missing-parent']);
  io.data.set(entry.recordKey, new Blob([entry.recordText]));
  io.data.set(`${prefix}unknown.json`, new Blob(['foreign']));
  const result = await prepareSyncWorkspaceJoin(io.remote, signal());
  expect(result.catalog.pending).toContain('child');
  expect(result.catalog.invalid).toEqual([{ key: `${prefix}unknown.json`, code: 'invalid-key' }]);
  expect(Object.keys(result)).toEqual(['identity', 'catalog']);
});

it('cancels a pending marker body and starts no catalog request', async () => {
  const io = fixture();
  const controller = new AbortController();
  const cancel = vi.fn();
  let entered!: () => void;
  const reading = new Promise<void>((resolve) => {
    entered = resolve;
  });
  io.read.mockImplementationOnce(async () => {
    entered();
    return new ReadableStream<Uint8Array>({ cancel });
  });
  const pending = prepareSyncWorkspaceJoin(io.remote, controller.signal);
  await reading;
  controller.abort();
  await expect(pending).rejects.toMatchObject({ code: 'cancelled' });
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(io.list).not.toHaveBeenCalled();
});

it('makes no requests after prior cancellation', async () => {
  const io = fixture();
  const controller = new AbortController();
  controller.abort();
  await expect(prepareSyncWorkspaceJoin(io.remote, controller.signal)).rejects.toMatchObject({
    code: 'cancelled',
  });
  expect(io.stat).not.toHaveBeenCalled();
});

it('preserves fixed authentication failures and replaces unknown provider errors', async () => {
  const io = fixture();
  io.stat.mockRejectedValueOnce(new SyncRemoteError('authentication', 401));
  await expect(prepareSyncWorkspaceJoin(io.remote, signal())).rejects.toMatchObject({
    code: 'authentication',
    status: 401,
  });
  io.stat.mockRejectedValueOnce(new Error('secret password at https://corporate.invalid/'));
  const error = await prepareSyncWorkspaceJoin(io.remote, signal()).catch(
    (failure: unknown) => failure
  );
  expect(error).toBeInstanceOf(SyncWorkspaceError);
  expect(error).toMatchObject({ message: 'unavailable', code: 'unavailable' });
  expect(JSON.stringify(error)).not.toContain('secret');
});

it('verifies an exact marker without catalog media or write effects', async () => {
  const io = fixture();
  const entry = await record();
  io.data.set(entry.recordKey, new Blob([entry.recordText]));
  io.data.set('Files/private/original.png', new Blob(['must not read']));
  await expect(verifySyncWorkspaceIdentity(io.remote, identity, signal())).resolves.toEqual(
    identity
  );
  expect(io.stat.mock.calls.map(([key]) => key)).toEqual([markerKey]);
  expect(io.read.mock.calls.map(([key]) => key)).toEqual([markerKey]);
  expect(io.list).not.toHaveBeenCalled();
  expect(io.write).not.toHaveBeenCalled();
});

it.each([null, undefined, {}, { ...identity, extra: true }])(
  'requires a valid nonnull identity before lightweight marker IO %#',
  async (expected) => {
    const io = fixture();
    await expect(verifySyncWorkspaceIdentity(io.remote, expected, signal())).rejects.toMatchObject({
      code: 'invalid-binding',
    });
    expect(io.stat).not.toHaveBeenCalled();
    expect(io.read).not.toHaveBeenCalled();
    expect(io.list).not.toHaveBeenCalled();
    expect(io.write).not.toHaveBeenCalled();
  }
);

it.each([
  { ...identity, spaceId: bootstrapId },
  { ...identity, bootstrapId: spaceId },
  { ...identity, fingerprint: 'a'.repeat(64) },
])('refuses each mismatched lightweight marker identity field %#', async (expected) => {
  const io = fixture();
  await expect(verifySyncWorkspaceIdentity(io.remote, expected, signal())).rejects.toMatchObject({
    code: 'binding-mismatch',
  });
  expect(io.list).not.toHaveBeenCalled();
  expect(io.write).not.toHaveBeenCalled();
});

it('detaches the lightweight expected identity before remote IO', async () => {
  const io = fixture();
  const expected = { ...identity };
  io.stat.mockImplementationOnce(async () => {
    expected.fingerprint = 'a'.repeat(64);
    return { size: new Blob([text]).size };
  });
  await expect(verifySyncWorkspaceIdentity(io.remote, expected, signal())).resolves.toEqual(
    identity
  );
});

it('refuses a missing lightweight marker without catalog access or repair', async () => {
  const io = fixture();
  io.data.delete(markerKey);
  await expect(verifySyncWorkspaceIdentity(io.remote, identity, signal())).rejects.toMatchObject({
    code: 'marker-missing',
  });
  expect(io.read).not.toHaveBeenCalled();
  expect(io.list).not.toHaveBeenCalled();
  expect(io.write).not.toHaveBeenCalled();
});

it('bounds lightweight marker stat and streamed bytes without catalog access', async () => {
  const io = fixture(new Blob(['x'.repeat(4097)]));
  await expect(verifySyncWorkspaceIdentity(io.remote, identity, signal())).rejects.toMatchObject({
    code: 'metadata-limit',
  });
  expect(io.read).not.toHaveBeenCalled();
  io.stat.mockResolvedValueOnce({ size: text.length });
  const cancel = vi.fn();
  io.read.mockResolvedValueOnce(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(4097));
      },
      cancel,
    })
  );
  await expect(verifySyncWorkspaceIdentity(io.remote, identity, signal())).rejects.toMatchObject({
    code: 'metadata-limit',
  });
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(io.list).not.toHaveBeenCalled();
  expect(io.write).not.toHaveBeenCalled();
});

it('cancels a pending lightweight marker body without further effects', async () => {
  const io = fixture();
  const controller = new AbortController();
  const cancel = vi.fn();
  let entered!: () => void;
  const reading = new Promise<void>((resolve) => {
    entered = resolve;
  });
  io.read.mockImplementationOnce(async () => {
    entered();
    return new ReadableStream<Uint8Array>({ cancel });
  });
  const pending = verifySyncWorkspaceIdentity(io.remote, identity, controller.signal);
  await reading;
  controller.abort();
  await expect(pending).rejects.toMatchObject({ code: 'cancelled' });
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(io.list).not.toHaveBeenCalled();
  expect(io.write).not.toHaveBeenCalled();
});

it('makes no lightweight marker requests after prior cancellation', async () => {
  const io = fixture();
  const controller = new AbortController();
  controller.abort();
  await expect(
    verifySyncWorkspaceIdentity(io.remote, identity, controller.signal)
  ).rejects.toMatchObject({ code: 'cancelled' });
  expect(io.stat).not.toHaveBeenCalled();
});

it('preserves temporary lightweight marker refusal and normalizes unknown errors', async () => {
  const io = fixture();
  io.stat.mockRejectedValueOnce(new SyncRemoteError('temporary', 503));
  await expect(verifySyncWorkspaceIdentity(io.remote, identity, signal())).rejects.toMatchObject({
    code: 'temporary',
    status: 503,
  });
  io.stat.mockRejectedValueOnce(new Error('secret provider response'));
  const error = await verifySyncWorkspaceIdentity(io.remote, identity, signal()).catch(
    (failure: unknown) => failure
  );
  expect(error).toBeInstanceOf(SyncWorkspaceError);
  expect(error).toMatchObject({ message: 'unavailable', code: 'unavailable' });
  expect(JSON.stringify(error)).not.toContain('secret');
  expect(io.list).not.toHaveBeenCalled();
  expect(io.write).not.toHaveBeenCalled();
});

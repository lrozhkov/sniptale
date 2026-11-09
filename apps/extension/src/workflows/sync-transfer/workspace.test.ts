import { expect, it, vi } from 'vitest';
import {
  prepareSyncWorkspaceJoin,
  discoverSyncWorkspaces,
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

function discoveryFixture() {
  const io = fixture();
  io.data.delete(markerKey);
  const pages = new Map<
    string,
    { objects: { key: string; size: number }[]; prefixes: string[]; nextCursor: string | null }
  >();
  pages.set('', { objects: [], prefixes: [], nextCursor: null });
  const list = vi.fn(
    async (selected: string, options: { signal: AbortSignal; cursor?: string }) => {
      expect(selected).toBe('');
      options.signal.throwIfAborted();
      const page = pages.get(options.cursor ?? '');
      if (!page) throw new SyncRemoteError('missing');
      return page;
    }
  );
  return { ...io, pages, list, remote: { ...io.remote, list } };
}

it('returns exact workspace discovery without list catalog or write effects', async () => {
  const io = fixture();
  expect(await discoverSyncWorkspaces(io.remote, signal())).toEqual({
    scope: 'exact',
    complete: true,
    candidates: [{ prefix: '', identity }],
    issues: [],
  });
  expect(io.stat.mock.calls.map(([key]) => key)).toEqual([markerKey]);
  expect(io.read.mock.calls.map(([key]) => key)).toEqual([markerKey]);
  expect(io.list).not.toHaveBeenCalled();
  expect(io.write).not.toHaveBeenCalled();
});

it('reports a complete empty parent while ignoring foreign folders and ZIP objects', async () => {
  const io = discoveryFixture();
  io.pages.set('', {
    objects: [{ key: 'backup.zip', size: 100 }],
    prefixes: ['Foreign/'],
    nextCursor: null,
  });
  io.data.set('backup.zip', new Blob(['Not a sync workspace']));
  expect(await discoverSyncWorkspaces(io.remote, signal())).toEqual({
    scope: 'children',
    complete: true,
    candidates: [],
    issues: [],
  });
  expect(io.stat.mock.calls.map(([key]) => key)).toEqual([markerKey, `Foreign/${markerKey}`]);
  expect(io.read).not.toHaveBeenCalled();
  expect(io.list).toHaveBeenCalledOnce();
  expect(io.write).not.toHaveBeenCalled();
});

it('returns multiple verified immediate workspace candidates without recursion', async () => {
  const io = discoveryFixture();
  const otherText = JSON.stringify({ ...marker, spaceId: bootstrapId, bootstrapId: spaceId });
  const otherIdentity = {
    spaceId: bootstrapId,
    bootstrapId: spaceId,
    fingerprint: hashSyncText(otherText),
  };
  io.pages.set('', { objects: [], prefixes: ['One/', 'Два %literal/'], nextCursor: null });
  io.data.set(`One/${markerKey}`, new Blob([text]));
  io.data.set(`Два %literal/${markerKey}`, new Blob([otherText]));
  expect(await discoverSyncWorkspaces(io.remote, signal())).toEqual({
    scope: 'children',
    complete: true,
    candidates: [
      { prefix: 'One/', identity },
      { prefix: 'Два %literal/', identity: otherIdentity },
    ],
    issues: [],
  });
  expect(io.list).toHaveBeenCalledOnce();
  expect(io.read.mock.calls.map(([key]) => key)).toEqual([
    `One/${markerKey}`,
    `Два %literal/${markerKey}`,
  ]);
});

it.each(['authentication', 'access-denied', 'transport', 'temporary'] as const)(
  'retains verified candidates with explicit partial discovery issues: %s',
  async (code) => {
    const io = discoveryFixture();
    io.pages.set('', { objects: [], prefixes: ['Found/', 'Blocked/'], nextCursor: null });
    io.data.set(`Found/${markerKey}`, new Blob([text]));
    const stat = io.stat.getMockImplementation()!;
    io.stat.mockImplementation(async (key) => {
      if (key.startsWith('Blocked/')) throw new SyncRemoteError(code);
      return stat(key);
    });
    expect(await discoverSyncWorkspaces(io.remote, signal())).toEqual({
      scope: 'children',
      complete: false,
      candidates: [{ prefix: 'Found/', identity }],
      issues: [{ prefix: 'Blocked/', code }],
    });
    expect(io.write).not.toHaveBeenCalled();
  }
);

it('reports markerless metadata as incomplete bootstrap', async () => {
  const io = discoveryFixture();
  io.pages.set('', { objects: [], prefixes: ['.sniptale/'], nextCursor: null });
  expect(await discoverSyncWorkspaces(io.remote, signal())).toEqual({
    scope: 'children',
    complete: false,
    candidates: [],
    issues: [{ prefix: '', code: 'bootstrap-incomplete' }],
  });
  expect(io.stat.mock.calls.map(([key]) => key)).toEqual([markerKey]);
  expect(io.list).toHaveBeenCalledOnce();
});

it.each([
  { body: '{', code: 'invalid-marker' },
  { body: JSON.stringify({ ...marker, version: 2 }), code: 'unsupported-format' },
  { body: 'x'.repeat(4097), code: 'metadata-limit' },
])(
  'reports an exact invalid marker without searching or enabling an empty result: $code',
  async ({ body, code }) => {
    const io = fixture(new Blob([body]));
    expect(await discoverSyncWorkspaces(io.remote, signal())).toEqual({
      scope: 'exact',
      complete: false,
      candidates: [],
      issues: [{ prefix: '', code }],
    });
    expect(io.list).not.toHaveBeenCalled();
  }
);

it.each([
  '../',
  '/escape/',
  'a/b/',
  './',
  '%2e%2e/',
  '%252f/',
  'a\\b/',
  'https:evil/',
  'a?secret/',
  'a#secret/',
  'a\u0000/',
])('refuses unsafe discovery prefixes before child IO: %j', async (unsafe) => {
  const io = discoveryFixture();
  io.pages.set('', { objects: [], prefixes: [unsafe], nextCursor: null });
  const result = await discoverSyncWorkspaces(io.remote, signal());
  expect(result).toMatchObject({
    complete: false,
    candidates: [],
    issues: [{ prefix: '', code: 'invalid-response' }],
  });
  expect(io.stat.mock.calls.map(([key]) => key)).toEqual([markerKey]);
  expect(io.read).not.toHaveBeenCalled();
});

it('bounds discovery pages children and immediate entries', async () => {
  const children = discoveryFixture();
  children.pages.set('', {
    objects: [],
    prefixes: Array.from({ length: 65 }, (_, n) => `Child${n}/`),
    nextCursor: null,
  });
  expect(await discoverSyncWorkspaces(children.remote, signal())).toMatchObject({
    complete: false,
    issues: [{ prefix: '', code: 'metadata-limit' }],
  });
  expect(children.stat.mock.calls.length).toBeLessThanOrEqual(65);
  const entries = discoveryFixture();
  entries.pages.set('', {
    objects: Array.from({ length: 257 }, (_, n) => ({ key: `File${n}`, size: 1 })),
    prefixes: [],
    nextCursor: null,
  });
  expect(await discoverSyncWorkspaces(entries.remote, signal())).toMatchObject({
    complete: false,
    issues: [{ prefix: '', code: 'metadata-limit' }],
  });
  expect(entries.read).not.toHaveBeenCalled();
  const paged = discoveryFixture();
  for (let n = 0; n < 17; n++)
    paged.pages.set(n === 0 ? '' : `page${n}`, {
      objects: [],
      prefixes: [],
      nextCursor: `page${n + 1}`,
    });
  expect(await discoverSyncWorkspaces(paged.remote, signal())).toMatchObject({
    complete: false,
    issues: [{ prefix: '', code: 'metadata-limit' }],
  });
  expect(paged.list).toHaveBeenCalledTimes(16);
});

it('detects discovery pagination cycles and cancellation', async () => {
  const io = discoveryFixture();
  io.pages.set('', { objects: [], prefixes: [], nextCursor: 'again' });
  io.pages.set('again', { objects: [], prefixes: [], nextCursor: 'again' });
  expect(await discoverSyncWorkspaces(io.remote, signal())).toMatchObject({
    complete: false,
    issues: [{ prefix: '', code: 'pagination-cycle' }],
  });
  expect(io.list).toHaveBeenCalledTimes(2);
  const cancelled = discoveryFixture();
  const controller = new AbortController();
  controller.abort();
  await expect(discoverSyncWorkspaces(cancelled.remote, controller.signal)).rejects.toMatchObject({
    code: 'cancelled',
  });
  expect(cancelled.stat).not.toHaveBeenCalled();
});

it('does not reinterpret an exact marker read failure as parent discovery', async () => {
  const io = fixture();
  io.read.mockRejectedValueOnce(new SyncRemoteError('missing'));
  expect(await discoverSyncWorkspaces(io.remote, signal())).toMatchObject({
    scope: 'exact',
    complete: false,
    issues: [{ prefix: '', code: 'workspace-changed' }],
  });
  expect(io.list).not.toHaveBeenCalled();
});

it.each([
  { body: '{', code: 'invalid-marker' },
  { body: JSON.stringify({ ...marker, version: 2 }), code: 'unsupported-format' },
  { body: 'x'.repeat(4097), code: 'metadata-limit' },
])('preserves explicit invalid child marker observations: $code', async ({ body, code }) => {
  const io = discoveryFixture();
  io.pages.set('', { objects: [], prefixes: ['Broken/'], nextCursor: null });
  io.data.set(`Broken/${markerKey}`, new Blob([body]));
  expect(await discoverSyncWorkspaces(io.remote, signal())).toEqual({
    scope: 'children',
    complete: false,
    candidates: [],
    issues: [{ prefix: 'Broken/', code }],
  });
  if (code === 'metadata-limit') expect(io.read).not.toHaveBeenCalled();
});

it('retains a verified candidate when later parent pagination is unavailable', async () => {
  const io = discoveryFixture();
  io.pages.set('', { objects: [], prefixes: ['Found/'], nextCursor: 'later' });
  io.data.set(`Found/${markerKey}`, new Blob([text]));
  const listing = io.list.getMockImplementation()!;
  io.list.mockImplementation(async (prefix, options) => {
    if (options.cursor === 'later') throw new SyncRemoteError('access-denied', 403);
    return listing(prefix, options);
  });
  expect(await discoverSyncWorkspaces(io.remote, signal())).toEqual({
    scope: 'children',
    complete: false,
    candidates: [{ prefix: 'Found/', identity }],
    issues: [{ prefix: '', code: 'access-denied' }],
  });
  expect(io.write).not.toHaveBeenCalled();
});

it('completes parent pagination without reading unrelated object bodies', async () => {
  const io = discoveryFixture();
  io.pages.set('', {
    objects: [{ key: 'backup.zip', size: 1 }],
    prefixes: ['Foreign/'],
    nextCursor: 'next',
  });
  io.pages.set('next', { objects: [], prefixes: ['Found/'], nextCursor: null });
  io.data.set(`Found/${markerKey}`, new Blob([text]));
  expect(await discoverSyncWorkspaces(io.remote, signal())).toMatchObject({
    complete: true,
    candidates: [{ prefix: 'Found/', identity }],
    issues: [],
  });
  expect(io.list.mock.calls.map(([, options]) => options.cursor)).toEqual([undefined, 'next']);
  expect(io.read.mock.calls.map(([key]) => key)).toEqual([`Found/${markerKey}`]);
});

it('cancels a pending child marker stream and probes no later child', async () => {
  const io = discoveryFixture();
  io.pages.set('', { objects: [], prefixes: ['First/', 'Later/'], nextCursor: null });
  io.data.set(`First/${markerKey}`, new Blob([text]));
  io.data.set(`Later/${markerKey}`, new Blob([text]));
  const controller = new AbortController();
  let entered!: () => void;
  const reading = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const cancel = vi.fn();
  io.read.mockImplementationOnce(async () => {
    entered();
    return new ReadableStream<Uint8Array>({ cancel });
  });
  const discovery = discoverSyncWorkspaces(io.remote, controller.signal);
  await reading;
  controller.abort();
  await expect(discovery).rejects.toMatchObject({ code: 'cancelled' });
  expect(cancel).toHaveBeenCalledOnce();
  expect(io.stat.mock.calls.map(([key]) => key)).toEqual([markerKey, `First/${markerKey}`]);
});

it.each(['authentication', 'access-denied', 'transport'] as const)(
  'does not list after an exact marker authority failure: %s',
  async (code) => {
    const io = fixture();
    io.stat.mockRejectedValueOnce(new SyncRemoteError(code));
    expect(await discoverSyncWorkspaces(io.remote, signal())).toMatchObject({
      scope: 'exact',
      complete: false,
      issues: [{ prefix: '', code }],
    });
    expect(io.list).not.toHaveBeenCalled();
  }
);

it('normalizes provider messages and refuses duplicate or malformed parent entries', async () => {
  const io = discoveryFixture();
  io.list.mockRejectedValueOnce(new Error('secret provider endpoint'));
  const result = await discoverSyncWorkspaces(io.remote, signal());
  expect(result).toMatchObject({ complete: false, issues: [{ prefix: '', code: 'unavailable' }] });
  expect(JSON.stringify(result)).not.toContain('secret');
  io.pages.set('', {
    objects: [{ key: '../private.zip', size: 1 }],
    prefixes: [],
    nextCursor: null,
  });
  expect(await discoverSyncWorkspaces(io.remote, signal())).toMatchObject({
    complete: false,
    issues: [{ code: 'invalid-response' }],
  });
  io.pages.set('', { objects: [], prefixes: ['Same/', 'Same/'], nextCursor: null });
  expect(await discoverSyncWorkspaces(io.remote, signal())).toMatchObject({
    complete: false,
    issues: [{ code: 'invalid-response' }],
  });
  expect(io.stat.mock.calls.map(([key]) => key)).not.toContain('../private.zip');
});

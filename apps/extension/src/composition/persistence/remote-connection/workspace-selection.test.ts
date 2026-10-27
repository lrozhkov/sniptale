// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { encodeSyncWorkspaceMarker } from '../../../contracts/sync-workspace';
import { parseSyncWorkspaceSource } from './model';
import { loadSyncWorkspaceSelection } from './workspace-selection';

const io = vi.hoisted(() => ({ database: vi.fn() }));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: io.database,
}));
const incarnation = '10000000-0000-4000-8000-000000000001';
const spaceId = '20000000-0000-4000-8000-000000000002';
const bootstrapId = '30000000-0000-4000-8000-000000000003';
const identity = { incarnation, revision: 7 };
const marker = encodeSyncWorkspaceMarker(spaceId, bootstrapId);
const parentUrl = 'https://dav.example.test/create/';
const rootUrl = `${parentUrl}Sniptale-${bootstrapId}/`;
const joinRootUrl = 'https://dav.example.test/join/';
const allocationBindingKey = JSON.stringify([
  'allocation',
  parentUrl,
  rootUrl,
  'creator',
  spaceId,
  bootstrapId,
  100,
  'webdav',
]);
const joinBindingKey = JSON.stringify(['join', joinRootUrl, 'reader', 200, 'webdav']);

beforeEach(() => vi.clearAllMocks());

function allocation(phase = 'planned') {
  return {
    version: 2,
    kind: 'sync-workspace-allocation',
    key: 'workspace-allocation',
    provider: 'webdav',
    parentUrl,
    rootUrl,
    accountId: 'creator',
    spaceId,
    bootstrapId,
    createdAt: 100,
    identity: { ...identity },
    phase,
    marker:
      phase === 'preparing-marker' || phase === 'publishing-marker' || phase === 'ready'
        ? { text: marker.text, fingerprint: marker.identity.fingerprint }
        : null,
  };
}
function join(phase = 'planned') {
  return {
    version: 1,
    kind: 'sync-workspace-join',
    key: 'workspace-join',
    provider: 'webdav',
    rootUrl: joinRootUrl,
    accountId: 'reader',
    createdAt: 200,
    identity: { incarnation: bootstrapId, revision: 3 },
    phase,
    expected: phase === 'ready' ? marker.identity : null,
    workspace: phase === 'ready' ? marker.identity : null,
  };
}

/** Each transaction sees one snapshot, including when native rows change between reads. */
function setup() {
  const rows = new Map<string, unknown>();
  const transactions: { stores: string[]; mode: string }[] = [];
  const reads: string[] = [];
  let onRead: (() => void) | null = null;
  let completed = 0;
  io.database.mockResolvedValue({
    transaction(stores: string[], mode: string) {
      transactions.push({ stores, mode });
      const snapshot = structuredClone(rows);
      return {
        objectStore(name: string) {
          expect(stores).toContain(name);
          expect(name).toBe('sync_connection');
          return {
            get: async (key: string) => {
              reads.push(key);
              const hook = onRead;
              onRead = null;
              hook?.();
              return structuredClone(snapshot.get(key));
            },
          };
        },
        get done() {
          completed += 1;
          return Promise.resolve();
        },
      };
    },
  });
  return {
    rows,
    reads,
    transactions,
    completed: () => completed,
    onRead(hook: () => void) {
      onRead = hook;
    },
  };
}

it.each(['allocation', 'join'])('parses and detaches the exact native %s source', (kind) => {
  const input = { kind, identity: { ...identity } };
  const parsed = parseSyncWorkspaceSource(input);
  expect(parsed).toEqual(input);
  expect(parsed).not.toBe(input);
  expect(parsed?.identity).not.toBe(input.identity);
  input.identity.revision += 1;
  input.kind = 'changed';
  expect(parsed).toEqual({ kind, identity });
});

it.each([
  null,
  undefined,
  [],
  {},
  { kind: 'other', identity },
  { kind: 'allocation' },
  { kind: 'allocation', identity, rootUrl },
  { kind: 'join', identity: { ...identity, extra: true } },
  { kind: 'join', identity: { ...identity, revision: 0 } },
  { kind: 'join', identity: { ...identity, incarnation: 'bad' } },
])('refuses nonclosed or invalid native sources %#', (input) => {
  expect(parseSyncWorkspaceSource(input)).toBeNull();
});

it('reads absent and abandoned-only selection without mutation or repair', async () => {
  const f = setup();
  expect(await loadSyncWorkspaceSelection()).toBeNull();
  f.rows.set('workspace-allocation', allocation('abandoned'));
  const before = structuredClone(f.rows);
  expect(await loadSyncWorkspaceSelection()).toBeNull();
  expect(f.rows).toEqual(before);
  expect(f.transactions).toEqual([
    { stores: ['sync_connection'], mode: 'readonly' },
    { stores: ['sync_connection'], mode: 'readonly' },
  ]);
});

it.each([
  ['planned', 'planned'],
  ['allocating', 'allocating'],
  ['allocated', 'allocated'],
  ['preparing-marker', 'checking'],
  ['publishing-marker', 'checking'],
  ['ready', 'ready'],
])('projects exact allocation lifetime and %s phase as %s', async (phase, projected) => {
  const f = setup();
  const native = allocation(phase);
  f.rows.set('workspace-allocation', native);
  const selected = await loadSyncWorkspaceSelection();
  expect(selected).toEqual({
    source: { kind: 'allocation', identity },
    bindingKey: allocationBindingKey,
    rootUrl,
    accountId: 'creator',
    createdAt: 100,
    phase: projected,
  });
  native.identity.revision += 1;
  expect(selected?.source.identity).toEqual(identity);
  expect(f.completed()).toBe(1);
});

it.each(['planned', 'checking', 'ready'])(
  'projects exact JOIN lifetime and %s phase',
  async (phase) => {
    const f = setup();
    const native = join(phase);
    f.rows.set('workspace-join', native);
    const selected = await loadSyncWorkspaceSelection();
    expect(selected).toEqual({
      source: { kind: 'join', identity: native.identity },
      bindingKey: joinBindingKey,
      rootUrl: joinRootUrl,
      accountId: 'reader',
      createdAt: 200,
      phase,
    });
    native.identity.revision += 1;
    expect(selected?.source.identity.revision).toBe(3);
  }
);

it('selects JOIN beside abandoned allocation without choosing its endpoint', async () => {
  const f = setup();
  f.rows.set('workspace-allocation', allocation('abandoned'));
  f.rows.set('workspace-join', join('checking'));
  expect(await loadSyncWorkspaceSelection()).toEqual({
    source: { kind: 'join', identity: { incarnation: bootstrapId, revision: 3 } },
    bindingKey: joinBindingKey,
    rootUrl: joinRootUrl,
    accountId: 'reader',
    createdAt: 200,
    phase: 'checking',
  });
});

it('refuses two live native intents without mutation', async () => {
  const f = setup();
  f.rows.set('workspace-allocation', allocation('ready'));
  f.rows.set('workspace-join', join('ready'));
  const before = structuredClone(f.rows);
  await expect(loadSyncWorkspaceSelection()).rejects.toThrow('refused');
  expect(f.rows).toEqual(before);
});

it.each([
  ['workspace-allocation', { ...allocation(), extra: true }],
  ['workspace-allocation', { ...allocation('abandoned'), rootUrl: joinRootUrl }],
  ['workspace-allocation', { ...allocation('ready'), marker: null }],
  ['workspace-join', { ...join(), extra: true }],
  ['workspace-join', { ...join('ready'), workspace: null }],
  ['workspace-join', { ...join(), identity: { ...identity, extra: true } }],
] as const)('refuses malformed native evidence without repair %#', async (key, row) => {
  const f = setup();
  f.rows.set(key, row);
  const before = structuredClone(f.rows);
  await expect(loadSyncWorkspaceSelection()).rejects.toThrow('refused');
  expect(f.rows).toEqual(before);
  expect(f.completed()).toBe(1);
});

it('refuses malformed abandoned evidence even beside a valid JOIN', async () => {
  const f = setup();
  f.rows.set('workspace-allocation', { ...allocation('abandoned'), extra: true });
  f.rows.set('workspace-join', join());
  await expect(loadSyncWorkspaceSelection()).rejects.toThrow('refused');
});

it('reads both intents from one native transaction during controlled replacement', async () => {
  const f = setup();
  f.rows.set('workspace-allocation', allocation());
  f.onRead(() => {
    f.rows.delete('workspace-allocation');
    f.rows.set('workspace-join', join());
  });
  expect(await loadSyncWorkspaceSelection()).toMatchObject({
    source: { kind: 'allocation', identity },
    rootUrl,
  });
  expect(f.transactions).toEqual([{ stores: ['sync_connection'], mode: 'readonly' }]);
  expect(f.reads).toEqual(['workspace-allocation', 'workspace-join']);
  expect(await loadSyncWorkspaceSelection()).toMatchObject({ source: { kind: 'join' } });
});

it.each(['allocation', 'join'])(
  'reads retained ready %s evidence after enrollment',
  async (kind) => {
    const f = setup();
    f.rows.set(`workspace-${kind}`, kind === 'allocation' ? allocation('ready') : join('ready'));
    f.rows.set('connection', { enrolled: true });
    f.rows.set('credential', { private: true });
    f.rows.set('workspace-enrollment', { installed: true });
    expect(await loadSyncWorkspaceSelection()).toMatchObject({ source: { kind }, phase: 'ready' });
    expect(f.reads).toEqual(['workspace-allocation', 'workspace-join']);
    expect(f.transactions).toEqual([{ stores: ['sync_connection'], mode: 'readonly' }]);
  }
);

it.each(['allocation', 'join'])(
  'keeps the %s binding key stable across phase revisions and changes it for a new binding',
  async (kind) => {
    const f = setup();
    const native = kind === 'allocation' ? allocation() : join();
    f.rows.set(`workspace-${kind}`, native);
    const planned = await loadSyncWorkspaceSelection();
    native.phase = kind === 'allocation' ? 'allocating' : 'checking';
    native.identity.revision += 1;
    const advanced = await loadSyncWorkspaceSelection();
    expect(advanced?.bindingKey).toBe(planned?.bindingKey);
    expect(advanced?.source.identity.revision).toBe(native.identity.revision);
    native.accountId = 'different-account';
    const changed = await loadSyncWorkspaceSelection();
    expect(changed?.bindingKey).not.toBe(planned?.bindingKey);
  }
);

it('binds the allocation key to its immutable native parent and workspace fields', async () => {
  const f = setup();
  const native = allocation();
  f.rows.set('workspace-allocation', native);
  const planned = await loadSyncWorkspaceSelection();
  for (const changed of [
    { ...native, parentUrl: joinRootUrl, rootUrl: `${joinRootUrl}Sniptale-${bootstrapId}/` },
    { ...native, spaceId: incarnation },
    { ...native, bootstrapId: incarnation, rootUrl: `${parentUrl}Sniptale-${incarnation}/` },
    { ...native, createdAt: native.createdAt + 1 },
  ]) {
    f.rows.set('workspace-allocation', changed);
    expect((await loadSyncWorkspaceSelection())?.bindingKey).not.toBe(planned?.bindingKey);
  }
});

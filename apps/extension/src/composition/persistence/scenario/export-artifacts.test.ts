import { beforeEach, expect, it, vi } from 'vitest';
import type { AssetOwner, AssetReadyJournal, AssetRef } from '../assets';
import type { ScenarioExportEntry } from './contracts';
const io = vi.hoisted(() => ({
  writer: vi.fn(),
  journal: vi.fn(),
  retry: vi.fn(),
  discard: vi.fn(),
  release: vi.fn(),
  read: vi.fn(),
  db: vi.fn(),
  mutate: vi.fn(),
}));
vi.mock('../assets', async (original) => ({
  ...(await original<typeof import('../assets')>()),
  createAssetObjectWriter: io.writer,
  createAssetPublicationJournal: io.journal,
  publishReadyJournalWithRetry: io.retry,
  discardPreparedAsset: io.discard,
  releaseAssetReadyProtection: io.release,
  readAssetFile: io.read,
}));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: io.db,
}));
vi.mock('../infrastructure/indexed-db/mutation', () => ({ runWithIndexedDbMutation: io.mutate }));
import {
  createScenarioHtmlCapture,
  readScenarioHtmlArtifact,
  saveScenarioHtmlArtifact,
  scenarioHtmlPublicationAdapter,
  unlinkScenarioHtmlOwnership,
} from './export-artifacts';

const ref: AssetRef = {
  assetId: 'html-body',
  createdAt: 1,
  location: { kind: 'opfs', objectKey: 'objects/html-body' },
  mimeType: 'text/html;charset=utf-8',
  sha256: null,
  size: 4,
};
const entry: ScenarioExportEntry = {
  id: 'export',
  projectId: 'project',
  format: 'html',
  filename: 'old.html',
  createdAt: 1,
  size: 4,
  html: { mode: 'guide', assetId: ref.assetId },
};
const owner: AssetOwner = {
  assetId: ref.assetId,
  ownerId: entry.id,
  ownerKind: 'scenario-export',
  role: 'body',
};
const journal = (value = entry): AssetReadyJournal => ({
  journalId: 'ready',
  domain: 'scenario-html-exports',
  createdAt: 1,
  payload: value,
  assetRefs: [ref],
});

function database(parent = true, initial?: ScenarioExportEntry) {
  let stored = initial;
  const exports = {
    get: vi.fn(async () => stored),
    put: vi.fn(async (value: ScenarioExportEntry) => {
      stored = value;
    }),
  };
  const refs = { get: vi.fn(async () => ref), put: vi.fn() };
  const owners = { get: vi.fn(async () => owner), put: vi.fn() };
  const projects = {
    get: vi.fn(async () =>
      parent ? { id: entry.projectId, name: 'Changed after export' } : undefined
    ),
  };
  const objectStore = (name: string) => {
    if (name === 'scenario_exports') return exports;
    if (name === 'asset_refs') return refs;
    if (name === 'asset_owners') return owners;
    if (name === 'scenario_projects') return projects;
    throw new Error('Unexpected store');
  };
  const db = {
    transaction: vi.fn(() => ({ objectStore, done: Promise.resolve() })),
    get: vi.fn(async (name: string) => objectStore(name).get()),
  };
  io.db.mockResolvedValue(db);
  io.mutate.mockImplementation(async (effect) => effect(db));
  return { db, exports, refs, owners, projects };
}

beforeEach(() => {
  vi.resetAllMocks();
  io.journal.mockImplementation(async (args) => ({ ...args, journalId: 'ready', createdAt: 1 }));
  io.retry.mockImplementation(async (value, publish) => publish(value));
  io.read.mockResolvedValue(new Blob(['html'], { type: 'text/html' }));
});

it('publishes one immutable body and its catalogue/owner graph in the same transaction', async () => {
  const d = database();
  await saveScenarioHtmlArtifact(entry, ref);
  expect(d.db.transaction).toHaveBeenCalledWith(
    ['scenario_exports', 'scenario_projects', 'asset_refs', 'asset_owners'],
    'readwrite'
  );
  expect(d.refs.put).toHaveBeenCalledWith(ref);
  expect(d.owners.put).toHaveBeenCalledWith(owner);
  expect(d.exports.put).toHaveBeenCalledWith(entry);
  expect(io.journal).toHaveBeenCalledWith({
    domain: 'scenario-html-exports',
    payload: entry,
    assetRefs: [ref],
  });
  expect(io.release).toHaveBeenCalledWith([ref.assetId]);
});

it('replays without undoing an already committed rename or Trash state', async () => {
  const renamed = { ...entry, filename: 'new.html', trashState: { updatedAt: 4, trashedAt: 4 } };
  const d = database(true, renamed);
  await scenarioHtmlPublicationAdapter.publish(journal());
  expect(d.exports.put).not.toHaveBeenCalled();
  expect(await d.exports.get()).toEqual(renamed);
  expect(io.discard).not.toHaveBeenCalled();
});

it('discards an unpublished body after parent deletion and never recreates the catalogue', async () => {
  const d = database(false);
  await scenarioHtmlPublicationAdapter.publish(journal());
  expect(d.exports.put).not.toHaveBeenCalled();
  expect(d.refs.put).not.toHaveBeenCalled();
  expect(io.discard).toHaveBeenCalledWith(ref.assetId);
});

it('retains journal authority after publication fails but discards before handoff fails', async () => {
  database();
  io.retry.mockRejectedValueOnce(new Error('quota'));
  await expect(saveScenarioHtmlArtifact(entry, ref)).rejects.toThrow('quota');
  expect(io.discard).not.toHaveBeenCalled();
  io.journal.mockRejectedValueOnce(new Error('journal'));
  await expect(saveScenarioHtmlArtifact(entry, ref)).rejects.toThrow('journal');
  expect(io.discard).toHaveBeenCalledExactlyOnceWith(ref.assetId);
});

it('rejects a mismatched artifact before creating a durable journal', async () => {
  database();
  await expect(saveScenarioHtmlArtifact({ ...entry, size: 5 }, ref)).rejects.toThrow('Invalid');
  expect(io.journal).not.toHaveBeenCalled();
  expect(io.discard).toHaveBeenCalledWith(ref.assetId);
});

it.each(['guide', 'tour'] as const)(
  'reads selected saved %s bytes and the latest name without loading project state',
  async (mode) => {
    const d = database(true, {
      ...entry,
      filename: 'renamed.html',
      html: { assetId: ref.assetId, mode },
    });
    const result = await readScenarioHtmlArtifact(entry.id);
    expect(await result?.blob.text()).toBe('html');
    expect(result?.entry.filename).toBe('renamed.html');
    expect(d.projects.get).not.toHaveBeenCalled();
    expect(io.read).toHaveBeenCalledWith(ref, 'renamed.html');
    expect(d.exports.put).not.toHaveBeenCalled();
  }
);

it('refuses legacy metadata, retained Trash and foreign ownership without reading bytes', async () => {
  const { html: _html, ...legacy } = entry;
  database(true, legacy);
  expect(await readScenarioHtmlArtifact(entry.id)).toBeNull();
  database(true, { ...entry, trashState: { updatedAt: 3, trashedAt: 3 } });
  expect(await readScenarioHtmlArtifact(entry.id)).toBeNull();
  const d = database(true, entry);
  d.owners.get.mockResolvedValueOnce({ ...owner, assetId: 'foreign' });
  expect(await readScenarioHtmlArtifact(entry.id)).toBeNull();
  expect(io.read).not.toHaveBeenCalled();
});

it.each([0, 1])(
  'unlinks only the selected catalogue edge with %s remaining owners',
  async (remaining) => {
    const stores = {
      owners: {
        get: vi.fn(async () => owner),
        delete: vi.fn(),
        index: () => ({ count: async () => remaining }),
      },
      refs: { delete: vi.fn() },
    };
    const operation = {
      operationId: 'delete',
      kind: 'physical-delete' as const,
      status: 'pending' as const,
      createdAt: 1,
      updatedAt: 1,
      assetIds: [] as string[],
    };
    await unlinkScenarioHtmlOwnership(entry.id, stores, operation);
    expect(stores.owners.delete).toHaveBeenCalledWith(['scenario-export', entry.id, 'body']);
    expect(operation.assetIds).toEqual(remaining ? [] : [ref.assetId]);
    expect(stores.refs.delete).toHaveBeenCalledTimes(remaining ? 0 : 1);
  }
);

it('captures exact chunks and defers local write failure until after native file commit', async () => {
  const writer = {
    assetId: ref.assetId,
    append: vi.fn(),
    abort: vi.fn(),
    finalize: vi.fn(async () => ({ ref })),
  };
  io.writer.mockResolvedValue(writer);
  const capture = await createScenarioHtmlCapture();
  await capture.append(new Uint8Array([1, 2]));
  expect(await writer.append.mock.calls[0]?.[0].arrayBuffer()).toEqual(
    new Uint8Array([1, 2]).buffer
  );
  writer.append.mockRejectedValueOnce(new Error('quota'));
  await expect(capture.append(new Uint8Array([3, 4]))).resolves.toBeUndefined();
  await expect(capture.finalize()).rejects.toThrow('quota');
  expect(writer.abort).toHaveBeenCalledOnce();
  expect(writer.finalize).not.toHaveBeenCalled();
});

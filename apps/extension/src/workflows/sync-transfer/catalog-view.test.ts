import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readPersistedSyncCatalogCards } from './catalog-view';
import { hashSyncText } from './wire-record';
const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  cache: vi.fn(),
  manifest: vi.fn(),
  graph: vi.fn(),
  portable: vi.fn(),
  materialized: vi.fn<
    (input: { scope: unknown; selections: readonly unknown[] }) => Promise<readonly unknown[]>
  >(async () => []),
}));
vi.mock('../../composition/persistence/remote-connection/store', () => ({
  loadSyncConnection: mocks.connection,
}));
vi.mock('../../composition/persistence/sync-catalog/catalog-cache', () => ({
  loadSyncCatalogCache: mocks.cache,
}));
vi.mock('../../composition/persistence/sync-capture/catalog-admission', () => ({
  loadMaterializedCatalogSelections: mocks.materialized,
}));
vi.mock('./catalog', () => ({ checkedSyncCatalogManifest: mocks.manifest }));
vi.mock('./catalog-graph', () => ({ projectSyncCatalog: mocks.graph }));
vi.mock('./prepared-root', () => ({ parsePortableSyncRoot: mocks.portable }));
beforeEach(() => {
  vi.resetAllMocks();
  mocks.materialized.mockResolvedValue([]);
});
describe('native advisory catalog display', () => {
  it('projects all ten thousand bounded cards from one native read and one parse per manifest', async () => {
    mocks.connection.mockResolvedValue({
      binding: { spaceId: 'space', connectionGeneration: 1, profileCreatedAt: 1 },
    });
    const manifests = Array.from({ length: 10000 }, (_, index) => ({
      manifestKey: `record-${index}`,
      size: 2,
      text: '{}',
    }));
    mocks.cache.mockResolvedValue({ profileCreatedAt: 1, manifests });
    mocks.manifest.mockImplementation(async (_text: string, key: string) => ({
      operation: { operationId: key },
      recordKey: key,
      attemptId: key,
      objects: [],
    }));
    const roots = new Map(
      manifests.map((item) => [
        item.manifestKey,
        {
          rootKind: 'video-project',
          rootId: item.manifestKey,
          heads: [item.manifestKey],
          deleted: false,
          blocked: false,
          conflict: false,
          unavailableDependencies: [],
        },
      ])
    );
    const operations = new Map(
      manifests.map((item) => [
        item.manifestKey,
        { operation: { operationId: item.manifestKey, envelope: null }, operationText: '{}' },
      ])
    );
    mocks.graph.mockReturnValue({ roots, operations });
    const cards = await readPersistedSyncCatalogCards();
    expect(cards).toHaveLength(10000);
    expect(mocks.cache).toHaveBeenCalledTimes(1);
    expect(mocks.manifest).toHaveBeenCalledTimes(10000);
    expect(mocks.portable).not.toHaveBeenCalled();
    expect(mocks.materialized).toHaveBeenCalledTimes(1);
    expect(mocks.materialized.mock.calls[0]?.[0]).toMatchObject({ selections: expect.any(Array) });
    expect(cards[0]).toMatchObject({ source: 'remote', selection: { rootKind: 'video-project' } });
    expect(cards[0]).not.toHaveProperty('project');
    expect(cards[0]).not.toHaveProperty('blob');
  });
});

const displayScope = { spaceId: 'space', connectionGeneration: 1, profileCreatedAt: 1 };
function installDisplayCatalog() {
  const entries = [
    {
      id: 'audio',
      rootKind: 'media',
      parsedKind: 'media',
      entryKind: 'audio',
      mimeType: 'audio/ogg',
    },
    {
      id: 'audio-mime',
      rootKind: 'media',
      parsedKind: 'media',
      entryKind: 'video',
      mimeType: 'audio/mp4',
    },
    {
      id: 'image',
      rootKind: 'media',
      parsedKind: 'image',
      entryKind: 'image',
      mimeType: 'image/png',
    },
    {
      id: 'screenshot',
      rootKind: 'media',
      parsedKind: 'image',
      entryKind: 'screenshot',
      mimeType: 'image/png',
    },
    {
      id: 'image-mime',
      rootKind: 'media',
      parsedKind: 'image',
      entryKind: 'video',
      mimeType: 'image/webp',
    },
    {
      id: 'video',
      rootKind: 'media',
      parsedKind: 'media',
      entryKind: 'video',
      mimeType: 'video/mp4',
    },
    {
      id: 'review',
      rootKind: 'video-review',
      parsedKind: 'video-review',
      entryKind: 'video',
      mimeType: 'video/mp4',
    },
    {
      id: 'project',
      rootKind: 'video-project',
      parsedKind: 'video-project',
      entryKind: 'video',
      mimeType: 'video/mp4',
    },
  ];
  mocks.connection.mockResolvedValue({ binding: displayScope });
  mocks.cache.mockResolvedValue({
    profileCreatedAt: 1,
    manifests: [{ manifestKey: 'record', text: '{}', size: 2 }],
  });
  mocks.manifest.mockResolvedValue({
    operation: {},
    recordKey: 'record',
    attemptId: 'attempt',
    objects: [],
  });
  const roots = new Map(
    entries.map((entry) => [
      entry.id,
      {
        rootId: entry.id,
        rootKind: entry.rootKind,
        heads: [`operation-${entry.id}`],
        deleted: false,
        blocked: false,
        conflict: false,
        unavailableDependencies: [] as string[],
      },
    ])
  );
  const operations = new Map(
    entries.map((entry) => [
      `operation-${entry.id}`,
      {
        operationText: '{}',
        operation: { operationId: `operation-${entry.id}`, envelope: { fixtureId: entry.id } },
      },
    ])
  );
  mocks.graph.mockReturnValue({ roots, operations });
  mocks.portable.mockImplementation(async (envelope: { fixtureId: string }) => {
    const entry = entries.find((candidate) => candidate.id === envelope.fixtureId);
    if (!entry) throw new Error('Unknown portable display fixture');
    if (entry.parsedKind === 'video-project')
      return {
        kind: 'video-project',
        entry: { project: { name: 'Display project' }, createdAt: 3, updatedAt: 4 },
        envelope: { descriptor: { totalBytes: 500 } },
      };
    return {
      kind: entry.parsedKind,
      metadata: {
        entry: {
          filename: `${entry.id}.display`,
          tags: ['work'],
          kind: entry.entryKind,
          mimeType: entry.mimeType,
          size: 100,
          createdAt: 1,
          updatedAt: 2,
        },
      },
    };
  });
  return { roots, operations };
}

it('projects each supported family and marks only exact materialized versions', async () => {
  installDisplayCatalog();
  const materialized = {
    rootKind: 'video-project',
    rootId: 'project',
    operationId: 'operation-project',
    sourceDigest: hashSyncText('{}'),
  };
  mocks.materialized.mockResolvedValue([materialized]);
  const cards = await readPersistedSyncCatalogCards();
  expect(cards).toHaveLength(8);
  for (const [id, kind] of [
    ['audio', 'audio'],
    ['audio-mime', 'audio'],
    ['image', 'image'],
    ['screenshot', 'image'],
    ['image-mime', 'image'],
    ['video', 'video'],
    ['review', 'video-review'],
  ]) {
    expect(cards.find((card) => card.selection.rootId === id)).toMatchObject({
      source: 'remote',
      label: `${id}.display`,
      kind,
      tags: ['work'],
      size: 100,
      createdAt: 1,
      updatedAt: 2,
      selection: { rootId: id, operationId: `operation-${id}`, sourceDigest: hashSyncText('{}') },
    });
  }
  expect(cards.find((card) => card.selection.rootId === 'project')).toMatchObject({
    label: 'Display project',
    kind: 'video-project',
    tags: [],
    size: 500,
    createdAt: 3,
    updatedAt: 4,
    materialized: true,
    selection: materialized,
  });
  expect(cards.filter((card) => card.materialized)).toHaveLength(1);
  expect(mocks.materialized).toHaveBeenCalledExactlyOnceWith({
    scope: displayScope,
    selections: cards.map((card) => card.selection),
  });
  expect(mocks.cache).toHaveBeenCalledOnce();
});

it('shows conflicts, deletion and unavailable dependencies and omits headless roots', async () => {
  const { roots, operations } = installDisplayCatalog();
  const conflict = roots.get('video');
  const blocked = roots.get('audio');
  const unavailable = roots.get('image');
  if (!conflict || !blocked || !unavailable) throw new Error('Display fixtures missing');
  conflict.conflict = true;
  conflict.deleted = true;
  blocked.blocked = true;
  unavailable.unavailableDependencies = ['missing-dependency'];
  operations.delete('operation-review');
  const cards = await readPersistedSyncCatalogCards();
  expect(cards.find((card) => card.selection.rootId === 'video')).toMatchObject({
    conflict: true,
    deleted: true,
  });
  expect(cards.find((card) => card.selection.rootId === 'audio')).toMatchObject({
    unavailable: true,
  });
  expect(cards.find((card) => card.selection.rootId === 'image')).toMatchObject({
    unavailable: true,
  });
  expect(cards.some((card) => card.selection.rootId === 'review')).toBe(false);
});

it('keeps valid display metadata unavailable when another cached manifest is invalid', async () => {
  installDisplayCatalog();
  mocks.cache.mockResolvedValue({
    profileCreatedAt: 1,
    manifests: [
      { manifestKey: 'bad', text: 'bad', size: 3 },
      { manifestKey: 'good', text: '{}', size: 2 },
    ],
  });
  mocks.manifest.mockRejectedValueOnce(new Error('Invalid manifest'));
  const cards = await readPersistedSyncCatalogCards();
  expect(cards).toHaveLength(8);
  expect(cards.every((card) => card.unavailable)).toBe(true);
  expect(cards.some((card) => card.label === 'Display project')).toBe(true);
});

it.each(['no-connection', 'no-cache', 'old-profile'] as const)(
  'does not display catalog cards from %s',
  async (state) => {
    installDisplayCatalog();
    if (state === 'no-connection') mocks.connection.mockResolvedValue(null);
    if (state === 'no-cache') mocks.cache.mockResolvedValue(null);
    if (state === 'old-profile')
      mocks.cache.mockResolvedValue({ profileCreatedAt: 0, manifests: [] });
    await expect(readPersistedSyncCatalogCards()).resolves.toEqual([]);
    expect(mocks.portable).not.toHaveBeenCalled();
    expect(mocks.materialized).not.toHaveBeenCalled();
  }
);

it.each(['temporary', 'step-template', 'library'])(
  'keeps a %s Scenario prerequisite out of the Library unless saved normally',
  async (kind) => {
    const { roots, operations } = installDisplayCatalog();
    roots.clear();
    operations.clear();
    roots.set('scenario', {
      rootKind: 'scenario-project',
      rootId: 'scenario',
      heads: ['scenario-op'],
      deleted: false,
      blocked: false,
      conflict: false,
      unavailableDependencies: [],
    });
    operations.set('scenario-op', {
      operationText: '{}',
      operation: { operationId: 'scenario-op', envelope: { fixtureId: 'scenario' } },
    });
    mocks.portable.mockResolvedValue({
      kind: 'scenario-project',
      name: 'Guide',
      metadata: {
        entry: {
          createdAt: 1,
          updatedAt: 2,
          lifecycle: { storageClass: kind === 'temporary' ? 'temporary' : 'library' },
          project: kind === 'step-template' ? { purpose: 'step-template' } : {},
        },
      },
      envelope: { descriptor: { totalBytes: 3 } },
    });
    const cards = await readPersistedSyncCatalogCards();
    expect(cards).toHaveLength(kind === 'library' ? 1 : 0);
    expect(mocks.materialized.mock.calls[0]?.[0].selections).toHaveLength(
      kind === 'library' ? 1 : 0
    );
  }
);

it('keeps a conflict visible when its first catalog head is already the local published version', async () => {
  const { roots, operations } = installDisplayCatalog();
  const root = roots.get('project')!;
  root.conflict = true;
  root.heads.push('alternate-project');
  const original = operations.get('operation-project')!;
  operations.set('alternate-project', {
    ...original,
    operationText: '{"alternate":true}',
    operation: { ...original.operation, operationId: 'alternate-project' },
  });
  mocks.materialized.mockImplementation(async ({ selections }) => selections);
  const card = (await readPersistedSyncCatalogCards()).find(
    (item) => item.selection.rootId === 'project'
  );
  expect(card).toMatchObject({ conflict: true });
  expect(card?.versions).toHaveLength(2);
  expect(card?.materialized).not.toBe(true);
});

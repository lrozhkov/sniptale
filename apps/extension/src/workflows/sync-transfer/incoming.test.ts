vi.mock('../../composition/persistence/sync-capture/apply-video-project', () => ({
  loadProjectReplicaExport: vi.fn(async () => null),
}));
import { createProjectExportEntry } from '../../composition/persistence/projects/index.test-support';
import { MissingAssetObjectError } from '../../composition/persistence/assets';
import { parseScenarioAssetEntry } from '../../composition/persistence/scenario/read-guards';
import { createGuideProject } from '../../features/scenario/project/factories';
import { createScenarioProjectEntry } from '../../composition/persistence/scenario/projects/entry';
import { beforeEach, expect, it, vi } from 'vitest';

import { parseRootEnvelope } from '../media-hub-backup/v6/codec';
import { projectSyncCatalog } from './catalog-graph';
import { createSyncAttempt, hashSyncText, parseSyncAttemptText } from './wire-record';
import { prepareCatalogReplica, applyCatalogDeletion } from './incoming';

import {
  mediaId,
  sha,
  ref,
  object,
  mediaEnvelope,
  projectEnvelope,
  attempt,
  fixture,
  resetIncomingTestIO,
} from './incoming.test-support';

const io = vi.hoisted(() => ({
  active: false,
  reading: false,
  staged: [] as string[],
  discard: vi.fn(),
  read: vi.fn(),
  journal: vi.fn(),
  deletion: vi.fn(),
  stage: vi.fn(),
  predecessor: vi.fn(),
  scenarioPredecessor: vi.fn(),
  releaseReader: vi.fn(),
  unloaded: vi.fn(),
  restoreStaged: vi.fn(),
}));
vi.mock('./native-residency', () => ({
  hasUnloadedNativeEditingRoot: io.unloaded,
  restoreStagedNativeOriginal: io.restoreStaged,
}));
vi.mock('../../composition/persistence/assets/resource-sessions', () => ({
  runWithAssetResourceRead: async (operation: () => Promise<unknown>) => {
    io.reading = true;
    try {
      return await operation();
    } finally {
      io.reading = false;
      io.releaseReader();
    }
  },
}));
vi.mock('../../composition/persistence/sync-capture/apply-scenario', () => ({
  loadScenarioReplicaPredecessorAssets: io.scenarioPredecessor,
}));
vi.mock('../../composition/persistence/sync-capture/apply-media', () => ({
  loadMediaReplicaPredecessorRef: io.predecessor,
}));
vi.mock('../../composition/persistence/assets', async (original) => ({
  ...(await original<typeof import('../../composition/persistence/assets')>()),
  runWithDurableAssetOperation: async (operation: () => Promise<unknown>) => {
    io.active = true;
    try {
      return await operation();
    } finally {
      io.active = false;
    }
  },
  discardPreparedAsset: io.discard,
  readAssetFile: io.read,
}));
vi.mock('../../composition/persistence/sync-capture/replica-publication', () => ({
  createPreparedReplicaJournal: io.journal,
}));
vi.mock('../../composition/persistence/sync-capture/apply-deletion', () => ({
  applyCatalogDeletionNative: io.deletion,
}));
vi.mock('../media-hub-backup/v6/staging', () => ({ stageRootObjects: io.stage }));
beforeEach(() => {
  vi.clearAllMocks();
  resetIncomingTestIO(io);
  io.unloaded.mockReset().mockResolvedValue(false);
  io.restoreStaged.mockReset().mockResolvedValue(false);
});

it('stages a media original and uses the stable logical digest for the native journal', async () => {
  const f = await fixture();
  const journal = await prepareCatalogReplica({
    ...f,
    rootKind: 'media',
    rootId: mediaId,
    signal: new AbortController().signal,
  });
  expect(journal.payload.kind).toBe('media');
  expect(journal.payload.input.sourceDigest).toBe(hashSyncText(f.selected.operationText));
  expect(f.reads).toEqual(f.selected.objects.map((item) => item.remoteKey));
  expect(io.discard).not.toHaveBeenCalled();
  expect(io.active).toBe(false);
});
it('reuses the checked predecessor original and preserves it on failure', async () => {
  const f = await fixture();
  const original = { ...ref('retained-original'), sha256: null };
  io.predecessor.mockResolvedValue(original);
  const args = {
    ...f,
    admission: { ...f.admission, expectedLocalGeneration: 1, expectedBasis: ['media-op'] },
    rootKind: 'media' as const,
    rootId: mediaId,
    signal: new AbortController().signal,
  };
  const journal = await prepareCatalogReplica(args);
  expect(io.predecessor).toHaveBeenCalledWith({
    spaceId: 'space',
    profileCreatedAt: 1,
    connectionGeneration: 7,
    mediaId,
    expectedLocalGeneration: 1,
    expectedBasis: ['media-op'],
  });
  expect(journal.payload.kind).toBe('media');
  if (journal.payload.kind !== 'media') throw new Error('Expected media.');
  expect(journal.payload.input.rows.ref).toEqual(original);
  expect(io.read).toHaveBeenCalledWith(original, 'original.png');
  expect(io.staged).toEqual([]);
  expect(f.reads).toEqual([]);
  io.journal.mockRejectedValue(new Error('Native refusal'));
  await expect(prepareCatalogReplica(args)).rejects.toThrow('Native refusal');
  expect(io.discard).not.toHaveBeenCalled();
  expect(io.reading).toBe(false);
});
it('refuses same-size corrupt predecessor reuse', async () => {
  const f = await fixture();
  const original = ref('corrupt-original');
  io.predecessor.mockResolvedValue(original);
  // Even a matching ref SHA is not proof of the bytes retained in the local object.
  io.read.mockResolvedValue(new File(['bad'], 'original.png', { type: 'image/png' }));
  const journal = await prepareCatalogReplica({
    ...f,
    admission: { ...f.admission, expectedLocalGeneration: 1, expectedBasis: ['media-op'] },
    rootKind: 'media',
    rootId: mediaId,
    signal: new AbortController().signal,
  });
  expect(journal.payload.kind).toBe('media');
  if (journal.payload.kind !== 'media') throw new Error('Expected media.');
  expect(journal.payload.input.rows.ref.assetId).toBe('staged-original');
  expect(f.reads).toEqual(f.selected.objects.map((item) => item.remoteKey));
  expect(io.discard).not.toHaveBeenCalled();
});
it('holds the original until journal protection replaces the reader', async () => {
  const f = await fixture();
  io.predecessor.mockResolvedValue(ref('retained-original'));
  let ready!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((resolve) => {
    ready = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  io.journal.mockImplementation(async (payload) => {
    expect(io.reading).toBe(true);
    ready();
    await gate;
    expect(io.reading).toBe(true);
    return { journalId: 'ready', payload };
  });
  const pending = prepareCatalogReplica({
    ...f,
    admission: { ...f.admission, expectedLocalGeneration: 1, expectedBasis: ['media-op'] },
    rootKind: 'media',
    rootId: mediaId,
    signal: new AbortController().signal,
  });
  await entered;
  expect(io.releaseReader).not.toHaveBeenCalled();
  release();
  await pending;
  expect(io.releaseReader).toHaveBeenCalledOnce();
});
it('preserves native predecessor refusals before downloads or journal creation', async () => {
  const f = await fixture();
  io.predecessor.mockRejectedValue(new Error('Stale native source'));
  await expect(
    prepareCatalogReplica({
      ...f,
      admission: { ...f.admission, expectedLocalGeneration: 1, expectedBasis: ['media-op'] },
      rootKind: 'media',
      rootId: mediaId,
      signal: new AbortController().signal,
    })
  ).rejects.toThrow('Stale native source');
  expect(io.stage).not.toHaveBeenCalled();
  expect(io.journal).not.toHaveBeenCalled();
  expect(io.reading).toBe(false);
});
it('prepares soft Trash as retained media metadata rather than a catalog tombstone', async () => {
  const f = await fixture();
  const media = mediaEnvelope();
  media.entry.lifecycle = {
    storageClass: 'library',
    savedAt: 1,
    updatedAt: 2,
    trashedAt: 2,
  };
  media.envelope.metadata = { ...Object(media.envelope.metadata), entry: media.entry };
  const selected = await attempt(media.envelope, 'trashed-media', 2, ['media-op']);
  const catalog = { ...f.catalog, ...projectSyncCatalog('space', [f.selected, selected]) };
  expect(catalog.roots.get(JSON.stringify(['media', mediaId]))!.deleted).toBe(false);
  io.predecessor.mockResolvedValue(ref('retained-original'));
  const journal = await prepareCatalogReplica({
    ...f,
    catalog,
    admission: { ...f.admission, expectedLocalGeneration: 1, expectedBasis: ['media-op'] },
    rootKind: 'media',
    rootId: mediaId,
    signal: new AbortController().signal,
  });
  if (journal.payload.kind !== 'media') throw new Error('Expected media.');
  expect(journal.payload.input.rows.media.lifecycle).toEqual(media.entry.lifecycle);
  expect(journal.payload.input.rows.ref.assetId).toBe('retained-original');
  expect(f.reads).toEqual([]);
});
it('uses a second physical alternative when the first original is missing', async () => {
  const f = await fixture(false, true);
  f.data.delete(f.selected.objects[0]!.remoteKey);
  const journal = await prepareCatalogReplica({
    ...f,
    rootKind: 'media',
    rootId: mediaId,
    signal: new AbortController().signal,
  });
  expect(journal.payload.input.sourceDigest).toBe(hashSyncText(f.selected.operationText));
  expect(f.reads).toHaveLength(2);
});
it('rejects unreadable metadata, unavailable dependencies and cancellation before original downloads', async () => {
  const f = await fixture(true);
  const controller = new AbortController();
  controller.abort();
  await expect(
    prepareCatalogReplica({
      ...f,
      rootKind: 'video-project',
      rootId: 'project',
      signal: controller.signal,
    })
  ).rejects.toThrow();
  const root = f.catalog.roots.get(JSON.stringify(['video-project', 'project']))!;
  root.unavailableDependencies.push('missing');
  await expect(
    prepareCatalogReplica({
      ...f,
      rootKind: 'video-project',
      rootId: 'project',
      signal: new AbortController().signal,
    })
  ).rejects.toThrow();
  expect(f.reads).toEqual([]);
  expect(io.stage).not.toHaveBeenCalled();
});

it('refuses missing or extra wire dependency inventory before staging files', async () => {
  const envelope = projectEnvelope();
  for (const dependencies of [
    [],
    [
      { mediaId, basis: ['media-op'] },
      { mediaId: 'extra', basis: ['other'] },
    ],
  ]) {
    const text = JSON.stringify({
      format: 'sniptale-sync-operation',
      version: 1,
      spaceId: 'space',
      operationId: 'invalid',
      rootKind: 'video-project',
      rootId: 'project',
      kind: 'edit',
      parents: [],
      dependencies,
      envelope,
      objects: envelope.objects.map((item) => ({ objectId: item.objectId, sha256: sha })),
    });
    await expect(createSyncAttempt(text, '00000000-0000-0000-0000-000000000001')).rejects.toThrow();
  }
  expect(io.stage).not.toHaveBeenCalled();
});

it('stages reused same-space mappings through the existing native journal admission', async () => {
  const f = await fixture();
  const physical = await createSyncAttempt(
    f.selected.operationText,
    '00000000-0000-0000-0000-000000000009',
    f.selected.objects
  );
  const selected = {
    ...(await parseSyncAttemptText(physical.recordText)),
    operationText: f.selected.operationText,
  };
  const catalog = {
    ...projectSyncCatalog('space', [selected]),
    invalid: [],
    metadataBytes: 0,
    pages: 1,
  };
  const journal = await prepareCatalogReplica({
    ...f,
    catalog,
    rootKind: 'media',
    rootId: mediaId,
    signal: new AbortController().signal,
  });
  expect(f.reads).toEqual(f.selected.objects.map((item) => item.remoteKey));
  expect(io.staged).toEqual(['original']);
  expect(journal.payload.kind).toBe('media');
  expect(journal.payload.input.sourceDigest).toBe(hashSyncText(f.selected.operationText));
  expect(io.journal).toHaveBeenCalledOnce();
});
it.each([false, true])(
  'checks the admitted native basis against selected remote ancestry for project=%s',
  async (project) => {
    const f = await fixture(project);
    const envelope = project ? projectEnvelope() : mediaEnvelope().envelope;
    const next = await attempt(envelope, 'causal-successor', 4, [f.selected.operation.operationId]);
    const attempts = [...f.catalog.operations.values()].flatMap((item) => item.attempts);
    const catalog = { ...f.catalog, ...projectSyncCatalog('space', [...attempts, next]) };
    for (const row of next.objects) f.data.set(row.remoteKey, new Blob([new Uint8Array(3)]));
    const admission = {
      ...f.admission,
      expectedLocalGeneration: 1,
      expectedBasis: [f.selected.operation.operationId],
    };
    const journal = await prepareCatalogReplica({
      ...f,
      catalog,
      admission,
      rootKind: project ? 'video-project' : 'media',
      rootId: project ? 'project' : mediaId,
      signal: new AbortController().signal,
    });
    expect(journal.payload.input).toMatchObject({
      expectedBasis: admission.expectedBasis,
      expectedLocalGeneration: 1,
      operationId: 'causal-successor',
    });
    io.stage.mockClear();
    io.journal.mockClear();
    await expect(
      prepareCatalogReplica({
        ...f,
        catalog,
        admission: { ...admission, expectedBasis: ['published-local-branch-outside-catalog'] },
        rootKind: project ? 'video-project' : 'media',
        rootId: project ? 'project' : mediaId,
        signal: new AbortController().signal,
      })
    ).rejects.toThrow();
    expect(io.stage).not.toHaveBeenCalled();
    expect(io.journal).not.toHaveBeenCalled();
  }
);

async function deletedFixture() {
  const f = await fixture();
  const operationText = JSON.stringify({
    format: 'sniptale-sync-operation',
    version: 1,
    spaceId: 'space',
    operationId: 'remote-delete',
    rootKind: 'media',
    rootId: mediaId,
    kind: 'delete',
    parents: ['media-op'],
    dependencies: [],
    envelope: null,
    objects: [],
  });
  const physical = await createSyncAttempt(operationText, '00000000-0000-0000-0000-000000000008');
  const tombstone = { ...(await parseSyncAttemptText(physical.recordText)), operationText };
  const catalog = { ...f.catalog, ...projectSyncCatalog('space', [f.selected, tombstone]) };
  return {
    ...f,
    catalog,
    admission: { ...f.admission, expectedLocalGeneration: 1, expectedBasis: ['media-op'] },
  };
}

it('applies a checked catalog tombstone without downloading files or creating a ready journal', async () => {
  const f = await deletedFixture();
  io.deletion.mockResolvedValue({ status: 'applied', generation: 2 });
  expect(
    await applyCatalogDeletion({
      ...f,
      rootKind: 'media',
      rootId: mediaId,
      signal: new AbortController().signal,
    })
  ).toEqual({ status: 'applied', generation: 2 });
  expect(io.deletion).toHaveBeenCalledWith(
    expect.objectContaining({
      operationId: 'remote-delete',
      rootId: mediaId,
      expectedLocalGeneration: 1,
      expectedBasis: ['media-op'],
      profileCreatedAt: 1,
      spaceId: 'space',
    }),
    expect.anything()
  );
  expect(f.reads).toEqual([]);
  expect(io.stage).not.toHaveBeenCalled();
  expect(io.journal).not.toHaveBeenCalled();
});

it.each(['basis', 'unreadable', 'cancelled', 'live'] as const)(
  'refuses an unchecked catalog deletion: %s',
  async (change) => {
    const f = await deletedFixture();
    if (change === 'basis') f.admission.expectedBasis = ['outside-local-branch'];
    let catalog: Parameters<typeof applyCatalogDeletion>[0]['catalog'] = f.catalog;
    if (change === 'unreadable')
      catalog = { ...catalog, invalid: [{ key: 'invalid', code: 'invalid-manifest' }] };
    if (change === 'live') catalog = (await fixture()).catalog;
    const controller = new AbortController();
    if (change === 'cancelled') controller.abort();
    await expect(
      applyCatalogDeletion({
        ...f,
        catalog,
        rootKind: 'media',
        rootId: mediaId,
        signal: controller.signal,
      })
    ).rejects.toThrow();
    expect(io.deletion).not.toHaveBeenCalled();
    expect(io.stage).not.toHaveBeenCalled();
  }
);

it('persists native connection authorization without using sender generation counters', async () => {
  const f = await fixture();
  const authorization = { incarnation: '10000000-0000-4000-8000-000000000001', revision: 1 };
  const journal = await prepareCatalogReplica({
    ...f,
    admission: { ...f.admission, authorization },
    rootKind: 'media',
    rootId: mediaId,
    signal: new AbortController().signal,
  });
  expect(journal.payload.input.authorization).toEqual(authorization);
  expect(journal.payload.input.expectedLocalGeneration).toBe(0);
});

it.each([false, true, 'permission'] as const)(
  'keeps exact predecessor Scenario bytes only after streamed verification, changed body: %s',
  async (changed) => {
    const project = createGuideProject('Renamed guide', 'scenario-source', 1);
    const child = {
      id: 'child',
      projectId: project.id,
      galleryAssetId: null,
      mimeType: 'image/png',
      size: 3,
      width: 10,
      height: 10,
      createdAt: 1,
    };
    const envelope = parseRootEnvelope({
      descriptor: {
        rootKind: 'scenario-project',
        rootId: project.id,
        metadataPath: 'Metadata/root.json',
        objectCount: 1,
        totalBytes: 3,
      },
      metadata: {
        entry: createScenarioProjectEntry({ project, existing: undefined, updatedAt: 2 }),
        assets: [{ entry: child, objectId: 'body' }],
        stepDocuments: [],
        exports: [],
        exportThumbnails: [],
      },
      objects: [object('body', 'body.png')],
    });
    const before = await attempt(envelope, 'before');
    const selected = await attempt(envelope, 'after', 2, ['before']);
    const previousRef = { ...ref('native-child'), sha256: null };
    io.scenarioPredecessor.mockImplementationOnce(async () => {
      expect(io.reading && io.active).toBe(true);
      return [
        {
          entry: parseScenarioAssetEntry({ ...child, assetId: previousRef.assetId }),
          ref: previousRef,
        },
      ];
    });
    if (changed === 'permission')
      io.read.mockRejectedValueOnce(new DOMException('Read denied', 'NotAllowedError'));
    else
      io.read.mockResolvedValueOnce(
        new File([new Uint8Array(changed ? [1, 2, 3] : [0, 0, 0])], 'body.png', {
          type: 'image/png',
        })
      );
    const read = vi.fn(async () => new Blob([new Uint8Array(3)]).stream());
    const receiving = prepareCatalogReplica({
      rootKind: 'scenario-project',
      rootId: project.id,
      catalog: {
        ...projectSyncCatalog('space', [before, selected]),
        invalid: [],
        metadataBytes: 0,
        pages: 1,
      },
      remote: { read, list: vi.fn(), stat: vi.fn(), write: vi.fn() },
      signal: new AbortController().signal,
      admission: {
        spaceId: 'space',
        connectionGeneration: 7,
        profileCreatedAt: 1,
        expectedBasis: ['before'],
        expectedLocalGeneration: 1,
        expectedWorkspaceRevision: 0,
        dependencies: [],
      },
    });
    if (changed === 'permission') {
      await expect(receiving).rejects.toMatchObject({ name: 'NotAllowedError' });
      expect(io.stage).not.toHaveBeenCalled();
      return;
    }
    const journal = await receiving;
    expect(journal.payload.kind).toBe('scenario-project');
    if (journal.payload.kind !== 'scenario-project')
      throw new Error('Expected native Scenario publication');
    expect(journal.payload.input.root.assets[0]?.ref.assetId).toBe(
      changed ? 'staged-body' : 'native-child'
    );
    expect(read).toHaveBeenCalledTimes(changed ? 1 : 0);
    expect(io.read).toHaveBeenCalled();
  }
);

it.each(['missing-root', 'missing-file'] as const)(
  'stages the current original when predecessor reuse finds missing local bytes: %s',
  async (kind) => {
    const f = await fixture();
    const original = ref('unloaded-original');
    io.predecessor.mockResolvedValue(original);
    io.read.mockRejectedValue(
      kind === 'missing-root'
        ? new MissingAssetObjectError(original.assetId)
        : new DOMException('Missing', 'NotFoundError')
    );
    const journal = await prepareCatalogReplica({
      ...f,
      admission: { ...f.admission, expectedLocalGeneration: 1, expectedBasis: ['media-op'] },
      rootKind: 'media',
      rootId: mediaId,
      signal: new AbortController().signal,
    });
    if (journal.payload.kind !== 'media') throw new Error('Expected media');
    expect(journal.payload.input.rows.ref.assetId).toBe('staged-original');
    expect(f.reads).toEqual(f.selected.objects.map((item) => item.remoteKey));
    expect(io.read).toHaveBeenCalledTimes(1);
    expect(io.discard).not.toHaveBeenCalled();
  }
);

it('propagates predecessor read refusal without staging or treating it as a cache miss', async () => {
  const f = await fixture();
  io.predecessor.mockResolvedValue(ref('retained-original'));
  const failure = new DOMException('Refused', 'NotAllowedError');
  io.read.mockRejectedValue(failure);
  await expect(
    prepareCatalogReplica({
      ...f,
      admission: { ...f.admission, expectedLocalGeneration: 1, expectedBasis: ['media-op'] },
      rootKind: 'media',
      rootId: mediaId,
      signal: new AbortController().signal,
    })
  ).rejects.toBe(failure);
  expect(f.reads).toEqual([]);
  expect(io.stage).not.toHaveBeenCalled();
  expect(io.journal).not.toHaveBeenCalled();
});

it('refuses a background source that became unloaded before staging under its reader', async () => {
  const f = await fixture();
  io.unloaded.mockResolvedValue(true);
  await expect(
    prepareCatalogReplica({
      ...f,
      rootKind: 'media',
      rootId: mediaId,
      residentOnly: true,
      signal: new AbortController().signal,
    })
  ).rejects.toThrow('requires resident');
  expect(io.unloaded).toHaveBeenCalledWith({ rootKind: 'media', rootId: mediaId });
  expect(io.stage).not.toHaveBeenCalled();
  expect(f.reads).toEqual([]);
  expect(io.reading).toBe(false);
});

it('preserves shared original identity when incoming restores unloaded bytes', async () => {
  const f = await fixture();
  const original = ref('unloaded-shared-original');
  io.predecessor.mockResolvedValue(original);
  io.read.mockRejectedValue(new MissingAssetObjectError(original.assetId));
  io.restoreStaged.mockResolvedValue(true);
  const journal = await prepareCatalogReplica({
    ...f,
    admission: { ...f.admission, expectedLocalGeneration: 1, expectedBasis: ['media-op'] },
    rootKind: 'media',
    rootId: mediaId,
    signal: new AbortController().signal,
  });
  if (journal.payload.kind !== 'media') throw new Error('Expected media');
  expect(journal.payload.input.rows.ref.assetId).toBe(original.assetId);
  expect(io.restoreStaged).toHaveBeenCalledWith(
    expect.objectContaining({
      ref: original,
      sourceRef: expect.objectContaining({ assetId: 'staged-original' }),
      sha256: sha,
    })
  );
  expect(io.discard).toHaveBeenCalledExactlyOnceWith('staged-original');
  expect(f.reads).toEqual(f.selected.objects.map((item) => item.remoteKey));
});

it('does not publish or replace a shared original after native recovery refusal', async () => {
  const f = await fixture();
  const original = ref('unloaded-shared-original');
  io.predecessor.mockResolvedValue(original);
  io.read.mockRejectedValue(new MissingAssetObjectError(original.assetId));
  io.restoreStaged.mockRejectedValue(new Error('Native source changed'));
  await expect(
    prepareCatalogReplica({
      ...f,
      admission: { ...f.admission, expectedLocalGeneration: 1, expectedBasis: ['media-op'] },
      rootKind: 'media',
      rootId: mediaId,
      signal: new AbortController().signal,
    })
  ).rejects.toThrow('Native source changed');
  expect(io.journal).not.toHaveBeenCalled();
  expect(io.discard).toHaveBeenCalledExactlyOnceWith('staged-original');
  expect(io.discard).not.toHaveBeenCalledWith(original.assetId);
});

it('restores a parent-retained export to the same native identity on its first media enrollment', async () => {
  const f = await fixture();
  const original = ref('parent-retained-export');
  const { assetId: _assetId, ...projectExport } = createProjectExportEntry({
    id: 'saved',
    projectId: 'parent',
    assetId: original.assetId,
    mimeType: original.mimeType,
    size: original.size,
  });
  const base = mediaEnvelope();
  const id = 'export:saved';
  const selected = await attempt(
    parseRootEnvelope({
      ...base.envelope,
      descriptor: { ...base.envelope.descriptor, rootId: id },
      metadata: {
        entry: {
          ...base.entry,
          id,
          kind: 'export',
          source: { kind: 'project-export', exportId: 'saved', projectId: 'parent' },
        },
        projectExport,
        originalObjectId: 'original',
      },
    }),
    'export-op'
  );
  const data = new Map(
    selected.objects.map((item) => [item.remoteKey, new Blob([new Uint8Array(3)])])
  );
  const catalog = { ...f.catalog, ...projectSyncCatalog('space', [selected]) };
  io.predecessor.mockResolvedValue(original);
  io.read.mockRejectedValue(new MissingAssetObjectError(original.assetId));
  io.restoreStaged.mockResolvedValue(true);
  const journal = await prepareCatalogReplica({
    ...f,
    catalog,
    remote: { ...f.remote, read: async (key: string) => data.get(key)!.stream() },
    rootKind: 'media',
    rootId: id,
    signal: new AbortController().signal,
  });
  if (journal.payload.kind !== 'media') throw new Error('Expected media.');
  expect(journal.payload.input.rows.ref).toEqual(original);
  expect(io.predecessor).toHaveBeenCalledWith(
    expect.objectContaining({
      expectedLocalGeneration: 0,
      exportSource: { projectId: 'parent', sha256: sha },
    })
  );
  expect(io.restoreStaged).toHaveBeenCalledWith(
    expect.objectContaining({ ref: original, sha256: sha })
  );
  expect(io.discard).toHaveBeenCalledExactlyOnceWith('staged-original');
});

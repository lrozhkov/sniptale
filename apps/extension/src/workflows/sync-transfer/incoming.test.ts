import { encodePortableScenarioProjectEntry } from '../media-hub-backup/v6/root-codecs/projects';
import { projectScenarioPrivacy } from '../media-hub-backup/v6/privacy';
import { createMediaHubBackupExportOptions } from '../media-hub-backup/v6/options';
import { createPersistedEditorDocumentFixture } from '../../composition/persistence/document-assets/test-support';
import { createEditorDocumentFixture } from '../../editor/document/page-session/document.test-support';
import { encodePortableEditorDocument } from '../media-hub-backup/v6/root-codecs/editor-document';
vi.mock('../../composition/persistence/sync-capture/apply-video-project', () => ({
  loadProjectReplicaExport: vi.fn(async () => null),
}));
import { createProjectExportEntry } from '../../composition/persistence/projects/index.test-support';
import type { AssetResidencyCopy } from '../../composition/persistence/assets/residency-records';
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
  scenarioExport: vi.fn(),
  releaseReader: vi.fn(),
  unloaded: vi.fn(),
  restoreStaged: vi.fn(),
  resident: vi.fn(),
  write: vi.fn(),
}));
vi.mock('../../composition/persistence/sync-capture/catalog-admission', () => ({
  loadCatalogReplicaResidentCandidates: io.resident,
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
  loadScenarioReplicaExport: io.scenarioExport,
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
  collectPreparedAssetCleanupFailures: async (assetIds: readonly string[]) => {
    const results = await Promise.allSettled(assetIds.map((id) => io.discard(id)));
    return results.flatMap((result) =>
      result.status === 'rejected' ? [result.reason as unknown] : []
    );
  },
  readAssetFile: io.read,
  writeBlobToAsset: io.write,
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
  io.scenarioExport.mockReset().mockResolvedValue(null);
  io.resident.mockReset().mockResolvedValue({ refs: [], inlineOriginals: [] });
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

it('defers on-demand successors with a missing required object before any remote GET', async () => {
  const f = await fixture();
  await expect(
    prepareCatalogReplica({
      ...f,
      admission: {
        ...f.admission,
        authorization: { incarnation: '10000000-0000-4000-8000-000000000001', revision: 1 },
        expectedLocalGeneration: 1,
        expectedBasis: ['media-op'],
      },
      rootKind: 'media',
      rootId: mediaId,
      binaryAdmission: 'resident',
      signal: new AbortController().signal,
    })
  ).rejects.toThrow('On-demand incoming requires local verified objects.');
  expect(f.reads).toEqual([]);
  expect(io.stage).not.toHaveBeenCalled();
  expect(io.journal).not.toHaveBeenCalled();
  expect(io.discard).not.toHaveBeenCalled();
});
it('reuses actual verified resident bytes without trusting the stored digest', async () => {
  const f = await fixture();
  const resident = { ...ref('resident-original'), sha256: null };
  io.resident.mockResolvedValue({ refs: [resident], inlineOriginals: [] });
  const journal = await prepareCatalogReplica({
    ...f,
    admission: {
      ...f.admission,
      authorization: { incarnation: '10000000-0000-4000-8000-000000000001', revision: 1 },
      expectedLocalGeneration: 1,
      expectedBasis: ['media-op'],
    },
    rootKind: 'media',
    rootId: mediaId,
    binaryAdmission: 'resident',
    signal: new AbortController().signal,
  });
  expect(journal.payload.kind).toBe('media');
  if (journal.payload.kind !== 'media') throw new Error('Expected media.');
  expect(journal.payload.input.rows.ref).toEqual(resident);
  expect(f.reads).toEqual([]);
  expect(io.read).toHaveBeenCalledWith(resident, 'original.png');
  expect(io.discard).not.toHaveBeenCalled();
});
it('does not download a corrupt resident object even when its stored digest matches', async () => {
  const f = await fixture();
  io.resident.mockResolvedValue({ refs: [ref('corrupt-resident')], inlineOriginals: [] });
  io.read.mockResolvedValue(new File(['bad'], 'original.png', { type: 'image/png' }));
  await expect(
    prepareCatalogReplica({
      ...f,
      admission: {
        ...f.admission,
        authorization: { incarnation: '10000000-0000-4000-8000-000000000001', revision: 1 },
        expectedLocalGeneration: 1,
        expectedBasis: ['media-op'],
      },
      rootKind: 'media',
      rootId: mediaId,
      binaryAdmission: 'resident',
      signal: new AbortController().signal,
    })
  ).rejects.toThrow('On-demand incoming requires local verified objects.');
  expect(f.reads).toEqual([]);
  expect(io.stage).not.toHaveBeenCalled();
});

it('stages an inline screenshot original locally and omits changed disposable presentation', async () => {
  const f = await fixture();
  const original = new Blob([new Uint8Array(3)], { type: 'image/png' });
  const envelope = parseRootEnvelope({
    descriptor: {
      rootKind: 'media',
      rootId: 'shot',
      mediaSubtype: 'library-item',
      metadataPath: 'Metadata/root.json',
      objectCount: 2,
      totalBytes: 6,
    },
    metadata: {
      entry: {
        ...mediaEnvelope().entry,
        id: 'shot',
        kind: 'screenshot',
        source: { kind: 'screenshot' },
      },
      originalObjectId: 'original',
      presentation: {
        entry: {
          aggregateId: 'shot',
          aggregateKind: 'image',
          presentationRevision: 0,
          updatedAt: 1,
        },
        thumbnailObjectId: 'preview',
      },
    },
    objects: [object('original', 'original.png'), object('preview', 'preview.png')],
  });
  const selected = await attempt(envelope, 'shot-op');
  io.resident.mockResolvedValue({
    refs: [],
    inlineOriginals: [{ mediaId: 'shot', blob: original, mimeType: 'image/png' }],
  });
  const args = {
    ...f,
    catalog: { ...f.catalog, ...projectSyncCatalog('space', [selected]) },
    admission: {
      ...f.admission,
      authorization: { incarnation: '10000000-0000-4000-8000-000000000001', revision: 1 },
      expectedLocalGeneration: 1,
      expectedBasis: ['shot-op'],
    },
    rootKind: 'media' as const,
    rootId: 'shot',
    binaryAdmission: 'resident' as const,
    signal: new AbortController().signal,
  };
  const result = await prepareCatalogReplica(args);
  expect(result.payload.kind).toBe('image');
  if (result.payload.kind !== 'image') throw new Error('Expected image.');
  expect(result.payload.input.presentation).toBeNull();
  expect(result.payload.input.originalRef.assetId).toBe('staged-original');
  expect(io.staged).toEqual(['original']);
  expect(f.reads).toEqual([]);
  expect(result.payload.input.sourceDigest).toBe(hashSyncText(selected.operationText));
  io.journal.mockRejectedValue(new Error('Native refusal'));
  await expect(prepareCatalogReplica(args)).rejects.toThrow('Native refusal');
  expect(io.discard.mock.calls).toEqual([['staged-original']]);
  expect(original.size).toBe(3);
});
it('keeps an authored image document resource required when it is also the thumbnail', async () => {
  const f = await fixture();
  const document = encodePortableEditorDocument({
    document: createPersistedEditorDocumentFixture(createEditorDocumentFixture(), 'doc-source'),
    objectsByAssetId: new Map([['doc-source', 'shared']]),
  });
  const envelope = parseRootEnvelope({
    descriptor: {
      rootKind: 'media',
      rootId: 'shot',
      mediaSubtype: 'library-item',
      metadataPath: 'Metadata/root.json',
      objectCount: 3,
      totalBytes: 9,
    },
    metadata: {
      entry: {
        ...mediaEnvelope().entry,
        id: 'shot',
        kind: 'screenshot',
        source: { kind: 'screenshot' },
        workspaceRevision: 1,
      },
      originalObjectId: 'original',
      workspace: {
        aggregateId: 'shot',
        revision: 1,
        createdAt: 1,
        updatedAt: 1,
        sourceTitle: null,
        sourceUrl: null,
        document,
      },
      presentation: {
        entry: {
          aggregateId: 'shot',
          aggregateKind: 'image',
          presentationRevision: 0,
          updatedAt: 1,
        },
        thumbnailObjectId: 'shared',
        previewObjectId: 'preview',
      },
    },
    objects: [
      object('original', 'original.png'),
      object('shared', 'shared.png'),
      object('preview', 'preview.png'),
    ],
  });
  const selected = await attempt(envelope, 'shot-op');
  const resident = { ...ref('resident-document'), sha256: null };
  io.resident.mockResolvedValue({ refs: [resident], inlineOriginals: [] });
  const result = await prepareCatalogReplica({
    ...f,
    catalog: { ...f.catalog, ...projectSyncCatalog('space', [selected]) },
    admission: {
      ...f.admission,
      authorization: { incarnation: '10000000-0000-4000-8000-000000000001', revision: 1 },
      expectedLocalGeneration: 1,
      expectedBasis: ['shot-op'],
    },
    rootKind: 'media',
    rootId: 'shot',
    binaryAdmission: 'resident',
    signal: new AbortController().signal,
  });
  expect(result.payload.kind).toBe('image');
  if (result.payload.kind !== 'image') throw new Error('Expected image.');
  expect(result.payload.input.workspace?.document.assets[0]?.assetId).toBe(resident.assetId);
  expect(result.payload.input.documentRefs).toContainEqual(resident);
  expect(result.payload.input.presentation).toBeNull();
  expect(f.reads).toEqual([]);
});

it('reuses canonical local Scenario history and immutable saved HTML without any remote binary GET', async () => {
  const f = await fixture();
  const project = createGuideProject('Guide', 'guide', 1);
  const before = createScenarioProjectEntry({ project, existing: undefined, updatedAt: 1 });
  const entry = createScenarioProjectEntry({ project, existing: before, updatedAt: 2 });
  const { history, ...portableEntry } = encodePortableScenarioProjectEntry(
    projectScenarioPrivacy(
      entry,
      createMediaHubBackupExportOptions({
        includeDrafts: false,
        includeSourceMetadata: true,
        includeTelemetry: true,
        includeWebSnapshots: false,
      })
    )
  );
  const portableHistory = new Blob([JSON.stringify(history)], { type: 'application/json' });
  const historySha = hashSyncText(JSON.stringify(history));
  const htmlRef = { ...ref('resident-html'), mimeType: 'text/html' };
  const envelope = parseRootEnvelope({
    descriptor: {
      rootKind: 'scenario-project',
      rootId: 'guide',
      metadataPath: 'Metadata/root.json',
      objectCount: 2,
      totalBytes: 3 + portableHistory.size,
    },
    metadata: {
      entry: portableEntry,
      assets: [],
      stepDocuments: [],
      exports: [
        {
          id: 'saved',
          projectId: 'guide',
          format: 'html',
          filename: 'saved.html',
          createdAt: 1,
          size: 3,
          html: { mode: 'guide', objectId: 'html' },
        },
      ],
      exportThumbnails: [],
      historyObjectId: 'history',
    },
    objects: [
      {
        ...object('history', 'history.json'),
        mimeType: 'application/json',
        size: portableHistory.size,
      },
      { ...object('html', 'saved.html'), mimeType: 'text/html' },
    ],
  });
  const operationText = JSON.stringify({
    format: 'sniptale-sync-operation',
    version: 1,
    spaceId: 'space',
    operationId: 'guide-op',
    rootKind: 'scenario-project',
    rootId: 'guide',
    kind: 'edit',
    parents: [],
    dependencies: [],
    envelope,
    objects: [
      { objectId: 'history', sha256: historySha },
      { objectId: 'html', sha256: sha },
    ],
  });
  const physical = await createSyncAttempt(operationText, '10000000-0000-4000-8000-000000000001');
  const selected = { ...(await parseSyncAttemptText(physical.recordText)), operationText };
  io.scenarioExport.mockResolvedValue({
    entry: {
      id: 'saved',
      projectId: 'guide',
      filename: 'saved.html',
      format: 'html',
      createdAt: 1,
      size: 3,
      html: { mode: 'guide', assetId: htmlRef.assetId },
    },
    ref: htmlRef,
    copy: null,
  });
  io.resident.mockResolvedValue({ refs: [htmlRef], inlineOriginals: [], scenarioEntry: entry });
  io.read.mockImplementation(async (reference, filename) =>
    reference.assetId === 'staged-history'
      ? new File([portableHistory], filename, { type: portableHistory.type })
      : new File([new Uint8Array(3)], filename, { type: reference.mimeType })
  );
  io.write.mockImplementation(async (blob) => ({
    ref: { ...ref('generated-history'), size: blob.size, mimeType: blob.type },
  }));
  io.stage.mockImplementation(async (args) => {
    const staged = [];
    for (const object of args.objects) {
      expect(object.objectId).toBe('history');
      expect(args.expectedSha256.get(object.objectId)).toBe(historySha);
      const chunks: BlobPart[] = [];
      await (
        await args.readObject(object)
      ).pipeTo(
        new WritableStream({
          write: (chunk: Uint8Array) => {
            chunks.push(new Uint8Array(chunk));
          },
        })
      );
      expect(await new Blob(chunks).text()).toBe(await portableHistory.text());
      staged.push({
        objectId: object.objectId,
        ref: {
          ...ref('staged-history'),
          size: portableHistory.size,
          mimeType: portableHistory.type,
        },
      });
    }
    return staged;
  });
  const result = await prepareCatalogReplica({
    ...f,
    catalog: { ...f.catalog, ...projectSyncCatalog('space', [selected]) },
    admission: {
      ...f.admission,
      authorization: { incarnation: '10000000-0000-4000-8000-000000000001', revision: 1 },
      expectedLocalGeneration: 1,
      expectedBasis: ['guide-op'],
      expectedWorkspaceRevision: 2,
    },
    rootKind: 'scenario-project',
    rootId: 'guide',
    binaryAdmission: 'resident',
    signal: new AbortController().signal,
  });
  expect(result.payload.kind).toBe('scenario-project');
  if (result.payload.kind !== 'scenario-project') throw new Error('Expected Scenario.');
  expect(result.payload.input.root.historyRef?.assetId).toBe('generated-history');
  expect(result.payload.input.root.exports[0]?.html?.assetId).toBe('resident-html');
  expect(result.payload.input.root.exportRefs).toEqual([htmlRef]);
  expect(result.payload.input.root.deferredExports?.[0]).toMatchObject({
    reuseExisting: true,
    ref: htmlRef,
  });
  expect(f.reads).toEqual([]);
  expect(io.discard.mock.calls).toEqual([['staged-history']]);
});

it('retains verified original bytes when native resident selection refuses before staging', async () => {
  const f = await fixture();
  const retained = ref('retained-original');
  io.predecessor.mockResolvedValue(retained);
  io.resident.mockRejectedValue(new Error('Incoming native admission refused.'));
  await expect(
    prepareCatalogReplica({
      ...f,
      admission: {
        ...f.admission,
        authorization: { incarnation: '10000000-0000-4000-8000-000000000001', revision: 1 },
        expectedLocalGeneration: 1,
        expectedBasis: ['media-op'],
      },
      rootKind: 'media',
      rootId: mediaId,
      binaryAdmission: 'resident',
      signal: new AbortController().signal,
    })
  ).rejects.toThrow('native admission refused');
  expect(f.reads).toEqual([]);
  expect(io.stage).not.toHaveBeenCalled();
  expect(io.journal).not.toHaveBeenCalled();
  expect(io.discard).not.toHaveBeenCalled();
});

it('shares the selected allowance across physical attempt fallback before GET', async () => {
  const f = await fixture(false, true);
  f.data.delete(f.selected.objects[0]!.remoteKey);
  const reservations: number[] = [];
  const allowance = {
    reserveObject: (size: number) => {
      expect(f.reads).toHaveLength(reservations.length);
      reservations.push(size);
    },
  };
  await prepareCatalogReplica({
    ...f,
    rootKind: 'media',
    rootId: mediaId,
    signal: new AbortController().signal,
    downloadAllowance: allowance,
  });
  expect(reservations).toHaveLength(2);
  expect(f.reads).toHaveLength(2);
  expect(reservations[0]).toBe(reservations[1]);
});
it('does not refund the failed physical attempt before the next missing-object GET', async () => {
  const f = await fixture(false, true);
  f.data.delete(f.selected.objects[0]!.remoteKey);
  let charged = 0;
  const allowance = {
    reserveObject: () => {
      if (++charged > 1) throw new Error('Selected download allowance exceeded');
    },
  };
  await expect(
    prepareCatalogReplica({
      ...f,
      rootKind: 'media',
      rootId: mediaId,
      signal: new AbortController().signal,
      downloadAllowance: allowance,
    })
  ).rejects.toThrow('allowance exceeded');
  expect(f.reads).toHaveLength(1);
  expect(io.journal).not.toHaveBeenCalled();
});

it.each([
  { binaryAdmission: undefined, retention: 'new' },
  { binaryAdmission: 'resident', retention: 'new' },
  { binaryAdmission: undefined, retention: 'local' },
  { binaryAdmission: undefined, retention: 'resident-copy' },
  { binaryAdmission: undefined, retention: 'unloaded' },
  { binaryAdmission: undefined, retention: 'wrong-bytes' },
] as const)(
  'prepares deferred Scenario HTML for $retention with binaryAdmission=$binaryAdmission',
  async ({ binaryAdmission, retention }) => {
    const f = await fixture();
    const project = createGuideProject('Guide', 'guide', 1);
    const entry = createScenarioProjectEntry({ project, existing: undefined, updatedAt: 1 });
    const envelope = parseRootEnvelope({
      descriptor: {
        rootKind: 'scenario-project',
        rootId: 'guide',
        metadataPath: 'Metadata/guide.json',
        objectCount: 1,
        totalBytes: 3,
      },
      metadata: {
        entry: encodePortableScenarioProjectEntry(entry),
        assets: [],
        stepDocuments: [],
        exports: [
          {
            id: 'saved',
            projectId: 'guide',
            filename: 'saved.html',
            format: 'html',
            createdAt: 1,
            size: 3,
            html: { mode: 'guide', objectId: 'saved-body' },
          },
        ],
        exportThumbnails: [],
      },
      objects: [{ ...object('saved-body', 'saved.html'), mimeType: 'text/html' }],
    });
    const operationText = JSON.stringify({
      format: 'sniptale-sync-operation',
      version: 1,
      spaceId: 'space',
      operationId: 'guide-op',
      rootKind: 'scenario-project',
      rootId: 'guide',
      kind: 'edit',
      parents: [],
      dependencies: [],
      envelope,
      objects: [{ objectId: 'saved-body', sha256: sha }],
    });
    const physical = await createSyncAttempt(operationText, '10000000-0000-4000-8000-000000000001');
    const selected = { ...(await parseSyncAttemptText(physical.recordText)), operationText };
    const localRef = { ...ref('kept-html'), mimeType: 'text/html' };
    const localEntry = {
      id: 'saved',
      projectId: 'guide',
      filename: 'kept.html',
      format: 'html' as const,
      createdAt: 1,
      size: 3,
      html: { mode: 'guide' as const, assetId: localRef.assetId },
    };
    if (retention !== 'new') {
      const copy: AssetResidencyCopy | null =
        retention === 'resident-copy' || retention === 'unloaded'
          ? {
              version: 1,
              kind: 'copy',
              id: 'copy',
              revision: 1,
              operationId: 'old-op',
              phase: retention === 'unloaded' ? 'unloaded' : 'resident',
              target: { kind: 'opfs', ref: localRef },
              remote: {
                key: 'Files/kept.html',
                sha256: sha,
                binding: {
                  provider: 'webdav',
                  rootUrl: 'https://dav.example/root/',
                  accountId: 'account',
                  spaceId: 'space',
                  connectionGeneration: 7,
                  profileCreatedAt: 1,
                },
              },
              lastUsedAt: 1,
            }
          : null;
      io.scenarioExport.mockResolvedValue({ entry: localEntry, ref: localRef, copy });
      if (retention === 'unloaded')
        io.read.mockRejectedValue(new MissingAssetObjectError(localRef.assetId));
      else
        io.read.mockResolvedValue(
          new File(
            [retention === 'wrong-bytes' ? new Uint8Array([1, 2, 3]) : new Uint8Array(3)],
            'kept.html',
            { type: 'text/html' }
          )
        );
    }
    const preparing = prepareCatalogReplica({
      ...f,
      catalog: { ...f.catalog, ...projectSyncCatalog('space', [selected]) },
      rootKind: 'scenario-project',
      rootId: 'guide',
      ...(binaryAdmission
        ? {
            binaryAdmission,
            admission: {
              ...f.admission,
              authorization: { incarnation: '10000000-0000-4000-8000-000000000001', revision: 1 },
              expectedLocalGeneration: 1,
              expectedBasis: ['guide-op'],
              expectedWorkspaceRevision: 1,
            },
          }
        : {}),
      signal: new AbortController().signal,
    });
    if (retention === 'wrong-bytes') {
      await expect(preparing).rejects.toThrow();
      expect(io.journal).not.toHaveBeenCalled();
      expect(f.reads).toEqual([]);
      return;
    }
    const result = await preparing;
    if (result.payload.kind !== 'scenario-project') throw new Error('Expected Scenario.');
    const root = result.payload.input.root;
    expect(root.exports).toHaveLength(1);
    expect(root.exports[0]).toMatchObject({
      id: 'saved',
      projectId: 'guide',
      filename: retention === 'new' ? 'saved.html' : 'kept.html',
      size: 3,
      html: { mode: 'guide' },
    });
    expect(root.deferredExports).toHaveLength(1);
    expect(root.deferredExports?.[0]).toMatchObject({
      entry: root.exports[0],
      ref: { size: 3, mimeType: 'text/html', sha256: sha },
      remote: {
        key:
          retention === 'resident-copy' || retention === 'unloaded'
            ? 'Files/kept.html'
            : physical.objects[0]!.remoteKey,
        sha256: sha,
      },
    });
    if (retention !== 'new') {
      expect(root.exports[0]).toEqual(localEntry);
      expect(root.deferredExports?.[0]).toMatchObject({ reuseExisting: true, ref: localRef });
    }
    expect(root.exportRefs).toEqual([root.deferredExports![0]!.ref]);
    expect(f.reads).toEqual([]);
    expect(io.stage.mock.calls.every(([args]) => args.objects.length === 0)).toBe(true);
  }
);

it.each([false, true])(
  'reuses a resident imported Image original during automatic zero-GET metadata successor, corrupt=%s',
  async (corrupt) => {
    const f = await fixture();
    const base = mediaEnvelope();
    const localRef = ref('resident-imported-original');
    const workspace = {
      aggregateId: mediaId,
      revision: 1,
      createdAt: 1,
      updatedAt: 2,
      sourceTitle: null,
      sourceUrl: null,
      document: encodePortableEditorDocument({
        document: createPersistedEditorDocumentFixture(
          createEditorDocumentFixture(),
          localRef.assetId
        ),
        objectsByAssetId: new Map([[localRef.assetId, 'original']]),
      }),
    };
    const envelope = parseRootEnvelope({
      ...base.envelope,
      descriptor: { ...base.envelope.descriptor, objectCount: 2, totalBytes: 6 },
      metadata: {
        entry: { ...base.entry, workspaceRevision: 1, imageContentState: 'edited' },
        originalObjectId: 'original',
        projectAsset: { id: 'source', mimeType: 'image/png', size: 3, createdAt: 1 },
        workspace,
        presentation: {
          entry: {
            aggregateId: mediaId,
            aggregateKind: 'image',
            presentationRevision: 1,
            updatedAt: 2,
          },
          thumbnailObjectId: 'preview',
        },
      },
      objects: [object('original', 'original.png'), object('preview', 'preview.png')],
    });
    const selected = await attempt(envelope, 'imported-image-op');
    io.predecessor.mockResolvedValue(localRef);
    io.resident.mockResolvedValue({ refs: [localRef], inlineOriginals: [] });
    io.read.mockResolvedValue(
      new File([corrupt ? 'bad' : new Uint8Array(3)], 'original.png', { type: 'image/png' })
    );
    const args = {
      ...f,
      catalog: { ...f.catalog, ...projectSyncCatalog('space', [selected]) },
      admission: {
        ...f.admission,
        authorization: { incarnation: '10000000-0000-4000-8000-000000000001', revision: 1 },
        expectedLocalGeneration: 1,
        expectedBasis: ['imported-image-op'],
        expectedWorkspaceRevision: 0,
      },
      rootKind: 'media' as const,
      rootId: mediaId,
      binaryAdmission: 'resident' as const,
      signal: new AbortController().signal,
    };
    if (corrupt)
      await expect(prepareCatalogReplica(args)).rejects.toThrow('local verified objects');
    else {
      const result = await prepareCatalogReplica(args);
      if (result.payload.kind !== 'image') throw new Error('Expected Image payload');
      expect(result.payload.input.originalRef).toEqual(localRef);
      expect(result.payload.input.projectAsset?.assetId).toBe(localRef.assetId);
      expect(result.payload.input.workspace?.document.sourceImage.assetId).toBe(localRef.assetId);
      expect(result.payload.input.presentation).toBeNull();
    }
    expect(io.staged).toEqual([]);
    expect(f.reads).toEqual([]);
  }
);

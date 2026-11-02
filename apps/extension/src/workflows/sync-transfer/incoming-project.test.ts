import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import { encodePortableReviewAssetRefs } from '../../composition/persistence/review-workspaces/asset-refs';
import { loadProjectReplicaExport } from '../../composition/persistence/sync-capture/apply-video-project';
vi.mock('../../composition/persistence/sync-capture/apply-video-project', () => ({
  loadProjectReplicaExport: vi.fn(async () => null),
}));
import { beforeEach, expect, it, vi } from 'vitest';

import { parsePortableVideoProjectMetadata } from '../media-hub-backup/v6/root-codecs/projects';
import { parseRootEnvelope } from '../media-hub-backup/v6/codec';
import { projectSyncCatalog } from './catalog-graph';
import { createSyncAttempt, hashSyncText, parseSyncAttemptText } from './wire-record';
import { prepareCatalogReplica } from './incoming';

import {
  object,
  ref,
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
  resident: vi.fn(),
}));
vi.mock('../../composition/persistence/sync-capture/catalog-admission', () => ({
  loadCatalogReplicaResidentCandidates: io.resident,
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
  collectPreparedAssetCleanupFailures: async (assetIds: readonly string[]) => {
    const results = await Promise.allSettled(assetIds.map((id) => io.discard(id)));
    return results.flatMap((result) =>
      result.status === 'rejected' ? [result.reason as unknown] : []
    );
  },
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
  io.resident.mockReset().mockResolvedValue({ refs: [], inlineOriginals: [] });
  vi.mocked(loadProjectReplicaExport).mockResolvedValue(null);
});

it('prepares editing bytes and checks borrowed originals without downloading exports', async () => {
  const f = await fixture(true);
  const journal = await prepareCatalogReplica({
    ...f,
    rootKind: 'video-project',
    rootId: 'project',
    signal: new AbortController().signal,
  });
  expect(journal.payload.kind).toBe('video-project');
  if (journal.payload.kind !== 'video-project') throw new Error('Expected project.');
  expect(journal.payload.input.root.exports).toEqual([
    expect.objectContaining({
      entry: expect.objectContaining({ projectId: 'project' }),
      remote: expect.objectContaining({
        key: f.selected.objects.find((item) => item.objectId === 'export')!.remoteKey,
      }),
    }),
  ]);
  expect(io.staged).toEqual(['private']);
  expect(io.read).toHaveBeenCalledOnce();
  expect(f.reads).toEqual([
    f.selected.objects.find((item) => item.objectId === 'private')!.remoteKey,
  ]);
});
it.each(['new', 'reused', 'conflicting-codec'] as const)(
  'preserves a parameterized saved export MIME during incoming %s admission',
  async (mode) => {
    const f = await fixture(true);
    const envelope = projectEnvelope();
    const metadata = parsePortableVideoProjectMetadata(envelope.metadata);
    const exported = metadata.projectExports[0]!;
    exported.entry.mimeType = 'video/webm;codecs=vp8';
    exported.entry.filename = 'saved.webm';
    const descriptor = envelope.objects.find((item) => item.objectId === exported.objectId)!;
    descriptor.mimeType = 'video/webm';
    descriptor.filename = 'saved.webm';
    descriptor.path = '_sniptale/assets/export/saved.webm';
    envelope.metadata = JSON.parse(JSON.stringify(metadata));
    const selected = await attempt(parseRootEnvelope(envelope), 'codec-project', 4);
    const media = await attempt(mediaEnvelope().envelope, 'media-op');
    for (const object of selected.objects)
      f.data.set(object.remoteKey, new Blob([new Uint8Array(3)]));
    if (mode !== 'new') {
      const mimeType = mode === 'reused' ? exported.entry.mimeType : 'video/webm;codecs=vp9';
      vi.mocked(loadProjectReplicaExport).mockResolvedValue({
        entry: { ...exported.entry, mimeType, assetId: 'retained-codec-export' },
        ref: { ...ref('retained-codec-export'), mimeType },
        copy: null,
      });
    }
    const args = {
      ...f,
      catalog: { ...f.catalog, ...projectSyncCatalog('space', [media, selected]) },
      rootKind: 'video-project' as const,
      rootId: 'project',
      signal: new AbortController().signal,
    };
    if (mode === 'conflicting-codec') {
      await expect(prepareCatalogReplica(args)).rejects.toThrow();
      expect(io.journal).not.toHaveBeenCalled();
      return;
    }
    const journal = await prepareCatalogReplica(args);
    if (journal.payload.kind !== 'video-project') throw new Error('Expected project.');
    const saved = journal.payload.input.root.exports![0]!;
    expect(saved.entry.mimeType).toBe(exported.entry.mimeType);
    expect(saved.ref.mimeType).toBe(exported.entry.mimeType);
    expect(io.staged).toEqual(['private']);
    expect(f.reads).not.toContain(
      selected.objects.find((item) => item.objectId === 'export')!.remoteKey
    );
  }
);

it.each(['new', 'reused'] as const)(
  'receives a saved WebM export without a MIME declaration during %s admission',
  async (mode) => {
    const f = await fixture(true);
    const envelope = projectEnvelope();
    const metadata = parsePortableVideoProjectMetadata(envelope.metadata);
    const exported = metadata.projectExports[0]!;
    delete exported.entry.mimeType;
    exported.entry.filename = 'legacy.webm';
    const descriptor = envelope.objects.find((item) => item.objectId === exported.objectId)!;
    descriptor.mimeType = 'video/webm';
    descriptor.filename = 'legacy.webm';
    descriptor.path = '_sniptale/assets/export/legacy.webm';
    envelope.metadata = JSON.parse(JSON.stringify(metadata));
    const selected = await attempt(parseRootEnvelope(envelope), 'legacy-project', 4);
    const media = await attempt(mediaEnvelope().envelope, 'media-op');
    for (const object of selected.objects)
      f.data.set(object.remoteKey, new Blob([new Uint8Array(3)]));
    if (mode === 'reused') {
      vi.mocked(loadProjectReplicaExport).mockResolvedValue({
        entry: { ...exported.entry, mimeType: 'video/webm', assetId: 'retained-legacy-export' },
        ref: { ...ref('retained-legacy-export'), mimeType: 'video/webm' },
        copy: null,
      });
    }
    const journal = await prepareCatalogReplica({
      ...f,
      catalog: { ...f.catalog, ...projectSyncCatalog('space', [media, selected]) },
      rootKind: 'video-project',
      rootId: 'project',
      signal: new AbortController().signal,
    });
    if (journal.payload.kind !== 'video-project') throw new Error('Expected project.');
    const saved = journal.payload.input.root.exports![0]!;
    expect(saved.entry.mimeType).toBe('video/webm');
    expect(saved.ref.mimeType).toBe('video/webm');
    if (mode === 'reused') expect(saved.ref.assetId).toBe('retained-legacy-export');
    expect(f.reads).not.toContain(
      selected.objects.find((item) => item.objectId === 'export')!.remoteKey
    );
  }
);

it('stages the project preview and thumbnail closure without downloading saved exports', async () => {
  const f = await fixture(true);
  const envelope = projectEnvelope();
  const metadata = parsePortableVideoProjectMetadata(envelope.metadata);
  metadata.thumbnail = { objectId: 'thumbnail', createdAt: 1, updatedAt: 1, width: 1, height: 1 };
  metadata.presentation = {
    entry: {
      aggregateId: 'project',
      aggregateKind: 'video-project',
      presentationRevision: 0,
      updatedAt: 1,
    },
    thumbnailObjectId: 'presentation-thumbnail',
    previewObjectId: 'preview',
  };
  envelope.metadata = JSON.parse(JSON.stringify(metadata));
  envelope.objects.push(
    object('thumbnail', 'thumbnail.png'),
    object('presentation-thumbnail', 'presentation.png'),
    object('preview', 'preview.png')
  );
  envelope.descriptor.objectCount = envelope.objects.length;
  envelope.descriptor.totalBytes = 15;
  const selected = await attempt(parseRootEnvelope(envelope), 'complete-project', 4);
  const media = await attempt(mediaEnvelope().envelope, 'media-op');
  for (const item of selected.objects) f.data.set(item.remoteKey, new Blob([new Uint8Array(3)]));
  const catalog = { ...f.catalog, ...projectSyncCatalog('space', [media, selected]) };
  const args = {
    ...f,
    catalog,
    rootKind: 'video-project' as const,
    rootId: 'project',
    signal: new AbortController().signal,
  };
  const journal = await prepareCatalogReplica(args);
  if (journal.payload.kind !== 'video-project') throw new Error('Expected project.');
  expect(io.staged).toEqual(['private', 'thumbnail', 'presentation-thumbnail', 'preview']);
  expect(f.reads).not.toContain(
    selected.objects.find((item) => item.objectId === 'export')!.remoteKey
  );
  expect(journal.payload.input.root.thumbnail!.ref.assetId).toBe('staged-thumbnail');
  expect(journal.payload.input.root.presentation!.previewRef!.assetId).toBe('staged-preview');
  io.journal.mockRejectedValueOnce(new Error('Native refusal'));
  await expect(prepareCatalogReplica(args)).rejects.toThrow('Native refusal');
  expect(io.discard.mock.calls).toEqual([
    ['staged-private'],
    ['staged-thumbnail'],
    ['staged-presentation-thumbnail'],
    ['staged-preview'],
  ]);
});
it('refuses missing borrowed bytes before staging or publication', async () => {
  const f = await fixture(true);
  io.read.mockRejectedValue(new Error('Missing local original'));
  await expect(
    prepareCatalogReplica({
      ...f,
      rootKind: 'video-project',
      rootId: 'project',
      signal: new AbortController().signal,
    })
  ).rejects.toThrow();
  expect(io.stage).not.toHaveBeenCalled();
  expect(io.journal).not.toHaveBeenCalled();
  expect(f.reads).toEqual([]);
});
it('cleans new staged files when journal admission refuses and preserves the borrowed original', async () => {
  const f = await fixture(true);
  io.journal.mockRejectedValue(new Error('Native refusal'));
  await expect(
    prepareCatalogReplica({
      ...f,
      rootKind: 'video-project',
      rootId: 'project',
      signal: new AbortController().signal,
    })
  ).rejects.toThrow('Native refusal');
  expect(io.discard.mock.calls).toEqual([['staged-private']]);
});
it('stages a mixed fresh editing and reused export mapping without downloading the export', async () => {
  const f = await fixture(true);
  const fresh = await createSyncAttempt(
    f.selected.operationText,
    '00000000-0000-0000-0000-000000000009'
  );
  const mixed = fresh.objects.map((item) =>
    item.objectId === 'export'
      ? f.selected.objects.find((candidate) => candidate.objectId === item.objectId)!
      : item
  );
  const physical = await createSyncAttempt(f.selected.operationText, fresh.attemptId, mixed);
  const selected = {
    ...(await parseSyncAttemptText(physical.recordText)),
    operationText: f.selected.operationText,
  };
  const media = await attempt(mediaEnvelope().envelope, 'media-op');
  const catalog = {
    ...projectSyncCatalog('space', [media, selected]),
    invalid: [],
    metadataBytes: 0,
    pages: 1,
  };
  const privateKey = mixed.find((item) => item.objectId === 'private')!.remoteKey;
  f.data.set(privateKey, new Blob([new Uint8Array(3)]));
  const journal = await prepareCatalogReplica({
    ...f,
    catalog,
    rootKind: 'video-project',
    rootId: 'project',
    signal: new AbortController().signal,
  });
  expect(f.reads).toEqual([privateKey]);
  expect(io.staged).toEqual(['private']);
  expect(journal.payload.kind).toBe('video-project');
});

it.each([
  'new',
  'new-library-mirror',
  'reused',
  'removed-during-download',
  'created-during-download',
] as const)(
  'retains only the Review closure actually admitted when export reuse is %s',
  async (mode) => {
    let reuse = mode === 'reused' || mode === 'removed-during-download';
    const f = await fixture(true);
    const envelope = projectEnvelope();
    const metadata = parsePortableVideoProjectMetadata(envelope.metadata);
    const exported = metadata.projectExports[0]!;
    exported.entry.mimeType = 'video/webm';
    exported.entry.filename = 'saved.webm';
    const exportObject = envelope.objects.find((item) => item.objectId === 'export')!;
    exportObject.mimeType = 'video/webm';
    exportObject.filename = 'saved.webm';
    exportObject.path = '_sniptale/assets/export/saved.webm';
    const advanced = createQuickEditAdvancedState();
    advanced.background = {
      enabled: false,
      rememberedImage: { assetId: 'project-asset:export-review-image', imageFit: 'cover' },
    };
    exported.videoReview = encodePortableReviewAssetRefs({
      workspace: {
        aggregateId: 'export:export',
        formatVersion: 1,
        revision: 1,
        cursor: 0,
        history: [],
        advanced,
        source: { duration: 2, width: 640, height: 360, size: 3, mimeType: 'video/webm' },
        createdAt: 1,
        updatedAt: 1,
      },
      draft: null,
    });
    metadata.projectAssets.push({
      entry: { id: 'export-review-image', mimeType: 'image/png', size: 3, createdAt: 1 },
      filename: 'export-review.png',
      objectId: 'export-review-image',
      ...(mode === 'new-library-mirror'
        ? { libraryMediaId: 'project-asset:export-review-image' }
        : { publishToLibrary: false }),
    });
    envelope.objects.push(object('export-review-image', 'export-review.png'));
    envelope.metadata = JSON.parse(JSON.stringify(metadata));
    envelope.descriptor.objectCount = 3;
    envelope.descriptor.totalBytes = 9;
    const selected = await attempt(parseRootEnvelope(envelope), 'project-op', 2);
    const media = await attempt(mediaEnvelope().envelope, 'media-op');
    const catalog = {
      ...projectSyncCatalog('space', [media, selected]),
      invalid: [],
      metadataBytes: 0,
      pages: 1,
    };
    for (const item of selected.objects) f.data.set(item.remoteKey, new Blob([new Uint8Array(3)]));
    const retained = {
      entry: { ...exported.entry, assetId: 'existing-export-body' },
      ref: { ...ref('existing-export-body'), mimeType: 'video/webm' },
      copy: null,
    };
    if (reuse) vi.mocked(loadProjectReplicaExport).mockResolvedValue(retained);
    const prepare = () =>
      prepareCatalogReplica({
        ...f,
        catalog,
        rootKind: 'video-project',
        rootId: 'project',
        signal: new AbortController().signal,
      });
    if (mode === 'removed-during-download' || mode === 'created-during-download') {
      vi.mocked(loadProjectReplicaExport)
        .mockResolvedValueOnce(reuse ? retained : null)
        .mockResolvedValue(reuse ? null : retained);
      await expect(prepare()).rejects.toThrow('not ready');
      expect(io.discard.mock.calls.map(([id]) => id)).toEqual(
        reuse ? ['staged-private'] : ['staged-private', 'staged-export-review-image']
      );
      expect(io.journal).not.toHaveBeenCalled();
      io.staged.length = 0;
      f.reads.length = 0;
      reuse = !reuse;
    }
    const journal = await prepare();
    if (journal.payload.kind !== 'video-project') throw new Error('Expected project.');
    expect(io.staged).toEqual(reuse ? ['private'] : ['private', 'export-review-image']);
    if (mode === 'new-library-mirror') {
      const resource = journal.payload.input.root.assets.find(
        (asset) => asset.ref.assetId === 'staged-export-review-image'
      );
      expect(resource).toMatchObject({ publishToLibrary: false });
      expect(resource?.entry.id).not.toBe('export-review-image');
      expect(resource?.reusePublished).toBeUndefined();
      expect(journal.payload.input.dependencies.map((item) => item.entry.id)).toEqual([
        'project-asset:source',
      ]);
    } else
      expect(journal.payload.input.root.assets.map((asset) => asset.entry.id)).toEqual(
        reuse ? ['private'] : ['private', 'export-review-image']
      );
    const admittedExport = journal.payload.input.root.exports![0]!;
    expect(admittedExport.reuseExisting).toBe(reuse ? true : undefined);
    expect(Boolean(admittedExport.videoReview)).toBe(!reuse);
    expect(f.reads).not.toContain(
      selected.objects.find((item) => item.objectId === 'export')!.remoteKey
    );
  }
);

it('applies a resident Montage successor with private assets and changed previews without binary GETs', async () => {
  const f = await fixture(true);
  const envelope = projectEnvelope();
  const metadata = parsePortableVideoProjectMetadata(envelope.metadata);
  metadata.thumbnail = { objectId: 'thumbnail', createdAt: 1, updatedAt: 1, width: 1, height: 1 };
  metadata.presentation = {
    entry: {
      aggregateId: 'project',
      aggregateKind: 'video-project',
      presentationRevision: 0,
      updatedAt: 1,
    },
    thumbnailObjectId: 'thumbnail',
    previewObjectId: 'preview',
  };
  envelope.metadata = JSON.parse(JSON.stringify(metadata));
  envelope.objects.push(object('thumbnail', 'thumbnail.png'), object('preview', 'preview.png'));
  envelope.descriptor.objectCount = envelope.objects.length;
  envelope.descriptor.totalBytes = 12;
  const selected = await attempt(parseRootEnvelope(envelope), 'project-op', 4);
  const media = await attempt(mediaEnvelope().envelope, 'media-op');
  const retained = { ...ref('retained-private'), sha256: null };
  io.resident.mockResolvedValue({ refs: [retained], inlineOriginals: [] });
  const result = await prepareCatalogReplica({
    ...f,
    catalog: { ...f.catalog, ...projectSyncCatalog('space', [media, selected]) },
    admission: {
      ...f.admission,
      authorization: { incarnation: '10000000-0000-4000-8000-000000000001', revision: 1 },
      expectedLocalGeneration: 1,
      expectedBasis: ['project-op'],
    },
    rootKind: 'video-project',
    rootId: 'project',
    binaryAdmission: 'resident',
    signal: new AbortController().signal,
  });
  expect(result.payload.kind).toBe('video-project');
  if (result.payload.kind !== 'video-project') throw new Error('Expected project.');
  expect(result.payload.input.root.assets[0]?.ref).toEqual(retained);
  expect(result.payload.input.root.thumbnail).toBeUndefined();
  expect(result.payload.input.root.presentation).toBeUndefined();
  expect(result.payload.input.sourceDigest).toBe(hashSyncText(selected.operationText));
  expect(result.payload.input.root.exports).toHaveLength(1);
  expect(f.reads).toEqual([]);
  expect(io.staged).toEqual([]);
});

import { sha256 } from '@noble/hashes/sha2.js';
import { beforeEach, expect, it, vi } from 'vitest';
import type { AssetRef } from '../../composition/persistence/assets/contracts';
import {
  createGuideProject,
  createGuideStep,
  createGuideImageBlock,
  createTourDocument,
  createTourImageSlide,
} from '../../features/scenario/project/factories';
import { createScenarioProjectEntry } from '../../composition/persistence/scenario/projects/entry';
import { parseScenarioAssetEntry } from '../../composition/persistence/scenario/read-guards';
import { createEditorDocumentFixture } from '../../editor/document/page-session/document.test-support';
import { createPersistedEditorDocumentFixture } from '../../composition/persistence/document-assets/test-support';
import { createMediaLibraryEntry } from '../../composition/persistence/projects/index.test-support';
import {
  parseCapturedScenarioRows,
  type CapturedScenarioRows,
} from '../../composition/persistence/sync-capture/scenario-snapshot';
import {
  parsePreparedScenarioReplicaRoot,
  hydratePreparedScenarioReplicaRoot,
  collectPreparedScenarioReplicaRefs,
} from '../../composition/persistence/sync-capture/prepared-scenario';
import { encodeCapturedScenarioRoot } from './captured-scenario';
import { parsePortableSyncRoot, preparePortableReplica } from './prepared-root';
import {
  createSyncAttempt,
  hashSyncText,
  parseSyncAttemptText,
  parseSyncOperationText,
} from './wire-record';
import { scanSyncCatalog } from './catalog';
import type { SyncRemoteStore } from './remote-store';

const io = vi.hoisted(() => ({ read: vi.fn(), live: vi.fn(), files: new Map<string, Blob>() }));
vi.mock('../../composition/persistence/assets', async (original) => ({
  ...(await original<typeof import('../../composition/persistence/assets')>()),
  readAssetFile: io.read,
}));
vi.mock('../../composition/persistence/infrastructure/indexed-db/core', async (original) => ({
  ...(await original<
    typeof import('../../composition/persistence/infrastructure/indexed-db/core')
  >()),
  initDB: io.live,
}));

beforeEach(() => {
  vi.clearAllMocks();
  io.files.clear();
  io.live.mockRejectedValue(new Error('Frozen Scenario must not read the current database.'));
  io.read.mockImplementation(async (ref: AssetRef, filename: string) => {
    const body = io.files.get(ref.assetId);
    if (!body || body.size !== ref.size || body.type !== ref.mimeType)
      throw new Error('Physical Scenario fixture binding differs.');
    return new File([body], filename, { type: body.type });
  });
});

async function streamedHash(blob: Blob): Promise<string> {
  const hash = sha256.create();
  const reader = blob.stream().getReader();
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      hash.update(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Array.from(hash.digest(), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function retainBytes(assetId: string, blob: Blob): AssetRef {
  io.files.set(assetId, blob);
  return {
    assetId,
    createdAt: 1,
    location: { kind: 'opfs', objectKey: `objects/${assetId}` },
    size: blob.size,
    mimeType: blob.type,
    sha256: null,
  };
}

async function acceptedRows(mode: 'guide' | 'tour' = 'guide'): Promise<CapturedScenarioRows> {
  const project = createGuideProject(`Saved ${mode}`, 'scenario-roundtrip', 1);
  const currentRef = retainBytes(
    'physical-current',
    new Blob(['Current image'], { type: 'image/png' })
  );
  const historicalRef = retainBytes(
    'physical-history',
    new Blob(['Old image'], { type: 'image/png' })
  );
  const html = new Blob([`<html>Immutable saved ${mode} export</html>`], {
    type: 'text/html;charset=utf-8',
  });
  const htmlRef = retainBytes('physical-html', html);
  const assets = [currentRef, historicalRef].map((ref, index) => {
    const entry = parseScenarioAssetEntry({
      id: index === 0 ? 'current-image' : 'historical-image',
      projectId: project.id,
      assetId: ref.assetId,
      galleryAssetId: null,
      mimeType: ref.mimeType,
      size: ref.size,
      width: 100,
      height: 80,
      createdAt: 1,
    });
    if (!entry) throw new Error('Invalid native Scenario resource fixture.');
    return entry;
  });
  const image = createGuideImageBlock({
    id: 'image-block',
    assetId: assets[0]!.id,
    width: 100,
    height: 80,
    editDocumentId: 'image-document',
    source: { kind: 'import', filename: 'original.png' },
  });
  const step = createGuideStep('Current step', 'step');
  step.blocks.push(image);
  project.items.push(step);
  if (mode === 'tour') {
    project.tour = createTourDocument('saved-tour');
    const slide = createTourImageSlide('slide');
    slide.image = {
      assetId: assets[0]!.id,
      galleryAssetId: null,
      editDocumentId: 'image-document',
      width: 100,
      height: 80,
      alt: 'Retained Tour image',
      source: image.source,
    };
    project.tour.slides.push(slide);
  }
  const historical = structuredClone(project);
  historical.name = `Previous ${mode}`;
  const oldStep = createGuideStep('Historical step', 'old-step');
  oldStep.blocks.push(
    createGuideImageBlock({
      id: 'old-image',
      assetId: assets[1]!.id,
      width: 100,
      height: 80,
      source: { kind: 'import', filename: 'old.png' },
    })
  );
  historical.items = [oldStep];
  const historyBlob = new Blob(
    [JSON.stringify([{ revision: 1, savedAt: 1, project: historical }])],
    { type: 'application/json' }
  );
  const thumbnail = new Blob(['Cover'], { type: 'image/png' });
  const entry = createScenarioProjectEntry({ project, existing: undefined, updatedAt: 3 });
  const rows = parseCapturedScenarioRows({
    entry: { ...entry, workspaceRevision: 2 },
    history: { blob: historyBlob, sha256: await streamedHash(historyBlob) },
    assets,
    documents: [
      {
        projectId: project.id,
        stepId: 'image-document',
        createdAt: 1,
        updatedAt: 2,
        document: createPersistedEditorDocumentFixture(
          createEditorDocumentFixture(),
          currentRef.assetId
        ),
      },
    ],
    exports: [
      {
        id: 'saved-html',
        projectId: project.id,
        filename: `renamed-${mode}.html`,
        format: 'html',
        createdAt: 2,
        size: html.size,
        html: { mode, assetId: htmlRef.assetId },
      },
    ],
    refs: [currentRef, historicalRef, htmlRef],
    media: [],
    mediaDependencies: [],
    thumbnails: [
      {
        assetId: `scenario:${project.id}`,
        blob: thumbnail,
        width: 100,
        height: 80,
        createdAt: 1,
        updatedAt: 2,
      },
      {
        assetId: 'scenario-export:saved-html',
        blob: thumbnail,
        width: 100,
        height: 80,
        createdAt: 1,
        updatedAt: 2,
      },
    ],
    presentation: {
      aggregateKind: 'scenario',
      aggregateId: project.id,
      presentationRevision: 2,
      updatedAt: 3,
      thumbnailBlob: thumbnail,
      previewBlob: new Blob(['Preview'], { type: 'image/png' }),
    },
  });
  if (!rows) throw new Error('Invalid accepted Scenario fixture.');
  return rows;
}

async function wireRoundtrip(rows: CapturedScenarioRows) {
  const portable = await encodeCapturedScenarioRoot(rows);
  const objects = await Promise.all(
    portable.objects.map(async (object) => ({
      objectId: object.ref.objectId,
      sha256: await streamedHash(object.blob),
    }))
  );
  const text = JSON.stringify({
    format: 'sniptale-sync-operation',
    version: 1,
    spaceId: 'space',
    operationId: 'scenario-operation',
    rootKind: 'scenario-project',
    rootId: rows.entry.id,
    kind: 'edit',
    parents: [],
    dependencies: portable.dependencies.map(({ mediaId, basis }) => ({ mediaId, basis })),
    envelope: portable.envelope,
    objects,
  });
  const wire = await parseSyncOperationText(text);
  if (!wire.envelope) throw new Error('Missing Scenario wire envelope.');
  return { portable, wire, text };
}

async function prepareOwned(rows: CapturedScenarioRows) {
  const { portable, wire, text } = await wireRoundtrip(rows);
  const verified = new Map<string, AssetRef>();
  for (const object of portable.objects) {
    const staged = new Blob([object.blob], { type: object.ref.mimeType });
    const ref = retainBytes(`received-${object.ref.objectId}`, staged);
    verified.set(object.ref.objectId, { ...ref, sha256: await streamedHash(object.blob) });
  }
  const payload = await preparePortableReplica({
    envelope: wire.envelope,
    verifiedObjects: verified,
    senderDependencies: wire.dependencies,
    admission: {
      spaceId: 'space',
      profileCreatedAt: 1,
      connectionGeneration: 1,
      operationId: wire.operationId,
      sourceDigest: hashSyncText(text),
      expectedLocalGeneration: 0,
      expectedBasis: [],
      expectedWorkspaceRevision: null,
      dependencies: [],
    },
    stageNativeMetadata: async (blob) => retainBytes('received-native-history', blob),
  });
  if (payload.kind !== 'scenario-project')
    throw new Error('Expected native Scenario journal payload.');
  return { portable, wire, verified, root: payload.input.root };
}

it.each(['guide', 'tour'] as const)(
  'round trips a frozen %s editing graph and immutable HTML export',
  async (mode) => {
    const rows = await acceptedRows(mode);
    const { portable, wire, verified, root } = await prepareOwned(rows);
    const parsed = await parsePortableSyncRoot(portable.envelope);
    if (parsed.kind !== 'scenario-project') throw new Error('Expected portable Scenario.');
    expect(wire.objects).toHaveLength(portable.objects.length);
    for (const object of portable.objects) {
      expect(wire.objects.find((item) => item.objectId === object.ref.objectId)?.sha256).toBe(
        await streamedHash(object.blob)
      );
    }
    const saved = parsed.metadata.exports.find((item) => item.id === 'saved-html');
    const htmlObject = portable.objects.find((item) => item.ref.objectId === saved?.html?.objectId);
    expect(htmlObject?.ref.filename).toBe(`renamed-${mode}.html`);
    expect(htmlObject?.ref.path).toContain(`/Exports/renamed-${mode}.html`);
    expect(await htmlObject?.blob.text()).toBe(`<html>Immutable saved ${mode} export</html>`);
    const current = parsed.metadata.assets.find((item) => item.entry.id === 'current-image');
    const original = portable.objects.find((item) => item.ref.objectId === current?.objectId);
    expect(original?.ref.filename).toMatch(/\.png$/u);
    expect(await original?.blob.text()).toBe('Current image');
    expect(io.read).toHaveBeenCalledWith(
      rows.refs.find((ref) => ref.assetId === 'physical-current'),
      expect.any(String)
    );
    expect(io.read).toHaveBeenCalledWith(
      rows.refs.find((ref) => ref.assetId === 'physical-html'),
      `renamed-${mode}.html`
    );
    expect(JSON.stringify(portable.envelope.metadata)).not.toContain('physical-');
    expect(parsePreparedScenarioReplicaRoot(root)).toEqual(root);
    const editingRefs = [...verified]
      .filter(([id]) => id !== parsed.metadata.historyObjectId)
      .map(([, ref]) => ref);
    expect(collectPreparedScenarioReplicaRefs(root)).toEqual(expect.arrayContaining(editingRefs));
    expect(root.historyRef?.sha256).toBe(
      await streamedHash(io.files.get('received-native-history')!)
    );
    const hydrated = await hydratePreparedScenarioReplicaRoot(root);
    expect(hydrated.entry.id).toBe(rows.entry.id);
    expect(hydrated.entry.project.name).toBe(`Saved ${mode}`);
    expect(hydrated.entry.history?.[0]?.project.name).toBe(`Previous ${mode}`);
    expect(hydrated.assets.map((item) => item.entry.id)).toEqual([
      'current-image',
      'historical-image',
    ]);
    expect(hydrated.stepDocuments[0]?.entry.document.sourceImage.assetId).toMatch(/^received-/u);
    expect(hydrated.exports[0]).toMatchObject({ filename: `renamed-${mode}.html`, html: { mode } });
    expect(hydrated.thumbnail?.blob.type).toBe('image/png');
    expect(hydrated.exportThumbnails).toHaveLength(1);
    expect(await hydrated.presentation?.previewBlob?.text()).toBe('Preview');
    if (mode === 'tour')
      expect(hydrated.entry.project.tour?.slides[0]).toMatchObject({
        image: { assetId: 'current-image', editDocumentId: 'image-document' },
      });
    expect(io.live).not.toHaveBeenCalled();
  }
);

it.each(['temporary', 'step-template'] as const)(
  'prepares a %s Scenario prerequisite',
  async (kind) => {
    const project = createGuideProject('Empty prerequisite', 'prerequisite', 1);
    if (kind === 'step-template') {
      project.purpose = 'step-template';
      project.items = [createGuideStep('Template step', 'template-step')];
    }
    const entry = createScenarioProjectEntry({ project, existing: undefined, updatedAt: 3 });
    if (kind === 'temporary')
      entry.lifecycle = { storageClass: 'temporary', savedAt: null, updatedAt: 3 };
    const rows = parseCapturedScenarioRows({
      entry,
      assets: [],
      documents: [],
      exports: [],
      refs: [],
      media: [],
      thumbnails: [],
      presentation: null,
      mediaDependencies: [],
    });
    if (!rows) throw new Error('Invalid native prerequisite fixture.');
    const { root } = await prepareOwned(rows);
    expect(root.entry.lifecycle?.storageClass).toBe(rows.entry.lifecycle?.storageClass);
    expect(root.entry.project.purpose).toBe(rows.entry.project.purpose);
    expect(collectPreparedScenarioReplicaRefs(root)).toEqual([]);
    expect(io.read).not.toHaveBeenCalled();
    expect(io.live).not.toHaveBeenCalled();
  }
);

it('preserves borrowed declarations and refuses absent receiver admission before database access', async () => {
  const rows = await acceptedRows();
  const ref = rows.refs.find((item) => item.assetId === rows.assets[0]!.assetId)!;
  const media = createMediaLibraryEntry({
    id: 'borrowed-source',
    kind: 'image',
    source: { kind: 'stored-asset', assetId: ref.assetId },
    size: ref.size,
    mimeType: ref.mimeType,
    filename: 'library-original.png',
    lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: 1 },
  });
  rows.assets[0] = { ...rows.assets[0]!, galleryAssetId: media.id, borrowedMediaId: media.id };
  rows.media = [media];
  rows.mediaDependencies = [{ mediaId: media.id, generation: 2, basis: ['source-head'] }];
  const { portable, wire } = await wireRoundtrip(rows);
  const parsed = await parsePortableSyncRoot(portable.envelope);
  if (parsed.kind !== 'scenario-project') throw new Error('Expected portable Scenario.');
  expect(parsed.metadata.assets[0]?.entry).toMatchObject({
    borrowedMediaId: media.id,
    galleryAssetId: media.id,
  });
  expect(wire.dependencies).toEqual([{ mediaId: media.id, basis: ['source-head'] }]);
  await expect(
    preparePortableReplica({
      envelope: wire.envelope,
      verifiedObjects: new Map(),
      senderDependencies: wire.dependencies,
      admission: {
        spaceId: 'space',
        profileCreatedAt: 1,
        connectionGeneration: 1,
        operationId: 'refused',
        sourceDigest: 'a'.repeat(64),
        expectedLocalGeneration: 0,
        expectedBasis: [],
        expectedWorkspaceRevision: null,
        dependencies: [],
      },
    })
  ).rejects.toThrow('dependency');
  expect(io.live).not.toHaveBeenCalled();
});

it('rejects changed history bytes, missing historical resources and invalid frozen declarations', async () => {
  const rows = await acceptedRows();
  await expect(
    encodeCapturedScenarioRoot({ ...rows, history: { ...rows.history!, sha256: '0'.repeat(64) } })
  ).rejects.toThrow('fingerprint');
  const historical = rows.assets[1]!;
  await expect(
    encodeCapturedScenarioRoot({
      ...rows,
      assets: rows.assets.filter((item) => item.id !== historical.id),
      refs: rows.refs.filter((item) => item.assetId !== historical.assetId),
    })
  ).rejects.toThrow('history resource');
  const { mediaDependencies: _dependencies, ...undeclared } = rows;
  await expect(encodeCapturedScenarioRoot(undeclared)).rejects.toThrow('Invalid captured');
  const invalidHistory = new Blob(['{}'], { type: 'application/json' });
  await expect(
    encodeCapturedScenarioRoot({
      ...rows,
      history: { blob: invalidHistory, sha256: await streamedHash(invalidHistory) },
    })
  ).rejects.toThrow('history is invalid');
  expect(io.read).not.toHaveBeenCalled();
  expect(io.live).not.toHaveBeenCalled();
});

it('round trips a retained Scenario inventory above 64 objects through physical manifests and catalog', async () => {
  const project = createGuideProject('Many retained resources', 'large-scenario', 1);
  const refs: AssetRef[] = [];
  const assets: CapturedScenarioRows['assets'] = [];
  for (let index = 0; index < 65; index++) {
    const ref = retainBytes(
      `native-image-${index}`,
      new Blob([`image-${index}`], { type: 'image/png' })
    );
    const asset = parseScenarioAssetEntry({
      id: `image-${index}`,
      projectId: project.id,
      assetId: ref.assetId,
      galleryAssetId: null,
      mimeType: ref.mimeType,
      size: ref.size,
      width: 100,
      height: 80,
      createdAt: 1,
    });
    if (!asset) throw new Error('Invalid native resource.');
    const step = createGuideStep(`Step ${index}`, `step-${index}`);
    step.blocks.push(
      createGuideImageBlock({
        id: `block-${index}`,
        assetId: asset.id,
        width: 100,
        height: 80,
        source: { kind: 'import', filename: `image-${index}.png` },
      })
    );
    project.items.push(step);
    refs.push(ref);
    assets.push(asset);
  }
  const rows = parseCapturedScenarioRows({
    entry: createScenarioProjectEntry({ project, existing: undefined, updatedAt: 2 }),
    assets,
    refs,
    documents: [],
    exports: [],
    media: [],
    mediaDependencies: [],
    thumbnails: [],
    presentation: null,
  });
  if (!rows) throw new Error('Invalid native Scenario inventory.');
  const { wire, text } = await wireRoundtrip(rows);
  expect(wire.objects).toHaveLength(65);
  const attempt = await createSyncAttempt(text, '00000000-0000-0000-0000-000000000065');
  expect((await parseSyncAttemptText(attempt.recordText)).operation).toEqual(wire);
  const body = new Blob([attempt.recordText]);
  const reads: string[] = [];
  const remote: SyncRemoteStore = {
    list: async () => ({
      objects: [{ key: attempt.recordKey, size: body.size }],
      prefixes: [],
      nextCursor: null,
    }),
    read: async (key) => {
      reads.push(key);
      if (key !== attempt.recordKey) throw new Error('Catalog read original bytes.');
      return body.stream();
    },
    stat: async () => {
      throw new Error('Catalog stat original bytes.');
    },
    write: async () => {
      throw new Error('Catalog wrote remote bytes.');
    },
  };
  const catalog = await scanSyncCatalog(remote, 'space', new AbortController().signal);
  expect(catalog.invalid).toEqual([]);
  expect(catalog.pending).toEqual([]);
  expect(catalog.operations.get(wire.operationId)?.operation).toEqual(wire);
  expect(reads).toEqual([attempt.recordKey]);
  expect(io.live).not.toHaveBeenCalled();
});

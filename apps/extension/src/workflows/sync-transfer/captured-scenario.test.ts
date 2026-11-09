import { readArchiveRootObjectSource } from '../media-hub-backup/v6/object-source.test-support';
import { createScenarioReplicaFixture } from '../../composition/persistence/sync-capture/test-support/scenario-replica.test-support';
import { applyPreparedScenarioReplica } from '../../composition/persistence/sync-capture/apply-scenario';
import { commitProjectAggregatePresentation } from '../../composition/persistence/aggregate-presentations';
import { sha256 } from '@noble/hashes/sha2.js';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  assetResidencyCopyId,
  type AssetResidencyCopy,
} from '../../composition/persistence/assets/residency-records';
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
import { preparePortableScenarioRoot } from './prepared-scenario';
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
  listReadyJournals: vi.fn(async () => []),
  completePhysicalDeleteOperation: vi.fn(async () => undefined),
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
      sha256: await streamedHash(await readArchiveRootObjectSource(object)),
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
  const { portable, wire } = await wireRoundtrip(rows);
  const verified = new Map<string, AssetRef>();
  for (const object of portable.objects) {
    const staged = new Blob([await readArchiveRootObjectSource(object)], {
      type: object.ref.mimeType,
    });
    const ref = retainBytes(`received-${object.ref.objectId}`, staged);
    verified.set(object.ref.objectId, {
      ...ref,
      sha256: await streamedHash(await readArchiveRootObjectSource(object)),
    });
  }
  const parsed = await parsePortableSyncRoot(wire.envelope);
  if (parsed.kind !== 'scenario-project') throw new Error('Expected portable Scenario.');
  // This full-body roundtrip deliberately models materialized archive decoding, not editing-only incoming.
  const root = await preparePortableScenarioRoot({
    metadata: parsed.metadata,
    admission: { expectedWorkspaceRevision: null, dependencies: [] },
    objectIds: [...verified.keys()],
    refFor(id) {
      const ref = verified.get(id);
      if (!ref) throw new Error('Missing materialized fixture object.');
      return ref;
    },
    stageNativeMetadata: async (blob) => retainBytes('received-native-history', blob),
  });
  if (!root) throw new Error('Expected native Scenario journal root.');
  return { portable, wire, verified, root };
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
        await streamedHash(await readArchiveRootObjectSource(object))
      );
    }
    const saved = parsed.metadata.exports.find((item) => item.id === 'saved-html');
    const htmlObject = portable.objects.find((item) => item.ref.objectId === saved?.html?.objectId);
    expect(htmlObject?.ref.filename).toBe(`renamed-${mode}.html`);
    expect(htmlObject?.ref.path).toContain(`/Exports/renamed-${mode}.html`);
    expect(htmlObject && (await (await readArchiveRootObjectSource(htmlObject)).text())).toBe(
      `<html>Immutable saved ${mode} export</html>`
    );
    const current = parsed.metadata.assets.find((item) => item.entry.id === 'current-image');
    const original = portable.objects.find((item) => item.ref.objectId === current?.objectId);
    expect(original?.ref.filename).toMatch(/\.png$/u);
    expect(original && (await (await readArchiveRootObjectSource(original)).text())).toBe(
      'Current image'
    );
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
    expect(hydrated.thumbnail?.blob?.type).toBe('image/png');
    expect(hydrated.exportThumbnails).toHaveLength(1);
    expect(await hydrated.presentation?.previewBlob?.text()).toBe('Preview');
    if (mode === 'tour')
      expect(hydrated.entry.project.tour?.slides[0]).toMatchObject({
        image: { assetId: 'current-image', editDocumentId: 'image-document' },
      });
    expect(io.live).not.toHaveBeenCalled();
  }
);

it.each(['guide', 'tour'] as const)(
  'binds exact native files for %s without staging copies',
  async (mode) => {
    const rows = await acceptedRows(mode);
    const document = rows.documents[0]!.document;
    document.frame.backgroundImage = { ...document.sourceImage };
    document.assets.push({ ...document.sourceImage, role: 'frame-background' });
    const before = structuredClone(rows);
    const portable = await encodeCapturedScenarioRoot(rows);
    const parsed = await parsePortableSyncRoot(portable.envelope);
    if (parsed.kind !== 'scenario-project') throw new Error('Expected portable Scenario.');
    const bound = new Map(portable.bindings.map(({ objectId, ref }) => [objectId, ref]));
    for (const asset of parsed.metadata.assets) {
      const native = rows.assets.find((item) => item.id === asset.entry.id)!;
      expect(bound.get(asset.objectId)).toEqual(
        rows.refs.find((ref) => ref.assetId === native.assetId)
      );
    }
    for (const asset of parsed.metadata.stepDocuments[0]!.document.assets)
      expect(bound.get(asset.objectId)).toEqual(rows.refs[0]);
    const html = parsed.metadata.exports[0]!.html!;
    expect(bound.get(html.objectId)).toEqual(rows.refs[2]);
    expect(bound.get(html.objectId)?.mimeType).toBe('text/html;charset=utf-8');
    expect(portable.bindings).toHaveLength(4);
    expect(bound.has(parsed.metadata.historyObjectId!)).toBe(false);
    expect(bound.has(parsed.metadata.thumbnail!.objectId)).toBe(false);
    for (const object of portable.objects) {
      const ref = bound.get(object.ref.objectId);
      if (ref)
        expect(await (await readArchiveRootObjectSource(object)).text()).toBe(
          await io.files.get(ref.assetId)!.text()
        );
    }
    const repeated = await encodeCapturedScenarioRoot(rows);
    expect(repeated.bindings).toEqual(portable.bindings);
    expect(repeated.envelope).toEqual(portable.envelope);
    expect(rows).toEqual(before);
    expect(io.live).not.toHaveBeenCalled();
  }
);

it('detaches native bindings before asynchronous reads', async () => {
  const rows = await acceptedRows();
  let resume!: () => void;
  let started!: () => void;
  const gate = new Promise<void>((resolve) => {
    resume = resolve;
  });
  const reading = new Promise<void>((resolve) => {
    started = resolve;
  });
  const originalRead = io.read.getMockImplementation()!;
  io.read.mockImplementationOnce(async (...args: [AssetRef, string]) => {
    started();
    await gate;
    return originalRead(...args);
  });
  const pending = encodeCapturedScenarioRoot(rows);
  await reading;
  rows.refs[0]!.assetId = 'replacement';
  rows.assets[0]!.assetId = 'replacement';
  resume();
  const encoded = await pending;
  expect(encoded.bindings.some(({ ref }) => ref.assetId === 'physical-current')).toBe(true);
  expect(encoded.bindings.some(({ ref }) => ref.assetId === 'replacement')).toBe(false);
});

it.each(['size', 'mime'] as const)(
  'rejects a native reader result with mismatched %s',
  async (field) => {
    const rows = await acceptedRows();
    io.read.mockImplementationOnce(
      async (ref: AssetRef, filename: string) =>
        new File([field === 'size' ? 'wrong size' : io.files.get(ref.assetId)!], filename, {
          type: field === 'mime' ? 'audio/mpeg' : ref.mimeType,
        })
    );
    await expect(encodeCapturedScenarioRoot(rows)).rejects.toThrow('native reference');
  }
);

it('refuses unavailable or changed native bytes and permits retry', async () => {
  const rows = await acceptedRows();
  const native = io.files.get('physical-current')!;
  io.files.delete('physical-current');
  await expect(encodeCapturedScenarioRoot(rows)).rejects.toThrow();
  io.files.set('physical-current', new Blob(['wrong'], { type: 'audio/mpeg' }));
  await expect(encodeCapturedScenarioRoot(rows)).rejects.toThrow();
  io.files.set('physical-current', native);
  const encoded = await encodeCapturedScenarioRoot(rows);
  expect(encoded.bindings.some(({ ref }) => ref.assetId === 'physical-current')).toBe(true);
});

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

it('applies a document fallback without waiting for a later presentation', async () => {
  const rows = await acceptedRows();
  rows.presentation = null;
  const frozen = structuredClone(rows);
  const before = await wireRoundtrip(rows);
  const { root } = await prepareOwned(rows);
  const fixture = createScenarioReplicaFixture();
  // The generic fixture lacks the native stepId key path. Adapt that store only.
  io.live.mockResolvedValue({
    ...fixture.database,
    transaction(names: string[], mode: string) {
      const tx = fixture.database.transaction(names, mode);
      return {
        ...tx,
        objectStore(name: string) {
          const store = tx.objectStore(name);
          if (name !== 'scenario_step_editor_documents') return store;
          return {
            ...store,
            put: (value: { stepId: string }) => store.put({ ...value, id: value.stepId }),
          };
        },
      };
    },
  });
  const input = {
    ...fixture.input,
    root,
    operationId: before.wire.operationId,
    sourceDigest: hashSyncText(before.text),
  };
  await expect(applyPreparedScenarioReplica(input)).resolves.toMatchObject({ status: 'applied' });
  const native = await hydratePreparedScenarioReplicaRoot(root);
  expect(native.entry.project.items).toEqual(rows.entry.project.items);
  expect(native.stepDocuments[0]?.entry.document.sourceImage.assetId).toMatch(/^received-/u);
  expect(native.presentation).toBeUndefined();
  const stored = fixture.fixture.rows.get('scenario_projects')!.get(rows.entry.id) as {
    workspaceRevision: number;
  };
  await commitProjectAggregatePresentation({
    ref: { kind: 'scenario', id: rows.entry.id },
    expectedWorkspaceRevision: stored.workspaceRevision,
    previewBlob: new Blob(['late-preview'], { type: 'image/png' }),
    thumbnailBlob: new Blob(['late-thumbnail'], { type: 'image/png' }),
  });
  expect(rows).toEqual(frozen);
  expect((await wireRoundtrip(rows)).text).toBe(before.text);
  expect(
    [...fixture.fixture.rows.get('sync_capture')!.values()].filter(
      (row) =>
        (row as { kind?: string }).kind === 'sync-operation' ||
        (row as { kind?: string }).kind === 'pending-checkpoint'
    )
  ).toEqual([]);
  await expect(applyPreparedScenarioReplica(input)).resolves.toMatchObject({ status: 'duplicate' });
});

async function unloadedHtml(rows: CapturedScenarioRows) {
  const exported = rows.exports[0]!;
  const ref = rows.refs.find((item) => item.assetId === exported.html?.assetId)!;
  const body = io.files.get(ref.assetId)!;
  const copy: AssetResidencyCopy = {
    version: 1,
    kind: 'copy',
    id: assetResidencyCopyId({ kind: 'opfs', ref }),
    revision: 1,
    operationId: 'accepted-remote',
    phase: 'unloaded',
    target: { kind: 'opfs', ref },
    lastUsedAt: 1,
    remote: {
      binding: {
        provider: 'webdav',
        rootUrl: 'https://dav.test/root/',
        accountId: 'user',
        spaceId: 'space',
        profileCreatedAt: 1,
        connectionGeneration: 1,
      },
      key: `Files/${hashSyncText('space')}/00000000-0000-0000-0000-000000000001/saved-body/original.html`,
      sha256: await streamedHash(body),
    },
  };
  io.files.delete(ref.assetId);
  return { ref, body, copy };
}

it.each(['guide', 'tour'] as const)(
  'retains unloaded %s historical HTML after a metadata rename without reading or replacing bytes',
  async (mode) => {
    const rows = await acceptedRows(mode);
    const { ref, copy } = await unloadedHtml(rows);
    rows.exports[0]!.filename = 'new user chosen name.html';
    rows.exports[0]!.trashState = { updatedAt: 4, trashedAt: 4 };
    const before = structuredClone(rows);
    const encoded = await encodeCapturedScenarioRoot(rows, new Map([[ref.assetId, copy]]));
    const parsed = await parsePortableSyncRoot(encoded.envelope);
    if (parsed.kind !== 'scenario-project') throw new Error('Expected Scenario.');
    const exported = parsed.metadata.exports[0]!;
    expect(exported).toMatchObject({
      filename: 'new user chosen name.html',
      trashState: { updatedAt: 4, trashedAt: 4 },
      html: { mode },
    });
    const descriptor = encoded.envelope.objects.find(
      (item) => item.objectId === exported.html!.objectId
    )!;
    expect(descriptor).toMatchObject({
      filename: 'original.html',
      size: ref.size,
      mimeType: 'text/html',
    });
    expect(encoded.objects.some((item) => item.ref.objectId === descriptor.objectId)).toBe(false);
    expect(encoded.retainedObjects).toEqual([
      { objectId: descriptor.objectId, remoteKey: copy.remote.key, sha256: copy.remote.sha256 },
    ]);
    expect(encoded.bindings.find((item) => item.objectId === descriptor.objectId)?.ref).toEqual(
      ref
    );
    expect(encoded.envelope.descriptor.objectCount).toBe(encoded.objects.length + 1);
    expect(io.read.mock.calls.some(([readRef]) => readRef.assetId === ref.assetId)).toBe(false);
    const repeated = await encodeCapturedScenarioRoot(
      rows,
      new Map([[ref.assetId, structuredClone(copy)]])
    );
    expect(repeated.envelope).toEqual(encoded.envelope);
    expect(repeated.retainedObjects).toEqual(encoded.retainedObjects);
    expect(rows).toEqual(before);
    expect(io.live).not.toHaveBeenCalled();
  }
);

it.each(['target', 'scope', 'digest', 'not-export'] as const)(
  'refuses a corrupt deferred HTML %s without reading the historical body',
  async (kind) => {
    const rows = await acceptedRows();
    const { ref, copy } = await unloadedHtml(rows);
    if (kind === 'target' && copy.target.kind === 'opfs')
      copy.target.ref = { ...ref, size: ref.size + 1 };
    if (kind === 'scope')
      copy.remote.key = copy.remote.key.replace(hashSyncText('space'), hashSyncText('foreign'));
    if (kind === 'digest') copy.remote.sha256 = 'not-a-digest';

    await expect(
      encodeCapturedScenarioRoot(
        rows,
        new Map([[kind === 'not-export' ? 'foreign' : ref.assetId, copy]])
      )
    ).rejects.toThrow('Deferred');
    expect(io.read.mock.calls.some(([readRef]) => readRef.assetId === ref.assetId)).toBe(false);
  }
);

function verifiedDeferredCopy(ref: AssetRef, index = 0): AssetResidencyCopy {
  return {
    version: 1,
    kind: 'copy',
    id: assetResidencyCopyId({ kind: 'opfs', ref }),
    revision: 1,
    operationId: 'accepted-copy',
    phase: 'unloaded',
    lastUsedAt: 1,
    target: { kind: 'opfs', ref },
    remote: {
      binding: {
        provider: 'webdav',
        rootUrl: 'https://dav.test/root/',
        accountId: 'user',
        spaceId: 'space',
        connectionGeneration: 1,
        profileCreatedAt: 1,
      },
      key: `Files/${hashSyncText('space')}/00000000-0000-0000-0000-000000000001/native-${index}/original-${index}.bin`,
      sha256: ref.sha256 ?? String(index % 10).repeat(64),
    },
  };
}

it(
  'retains Scenario editing assets document roles and saved HTML while history and ' +
    'presentation stay local',
  async () => {
    const rows = await acceptedRows();
    const copies = new Map(
      rows.refs.map((ref, index) => [ref.assetId, verifiedDeferredCopy(ref, index)])
    );
    io.read.mockRejectedValue(new Error('Unloaded Scenario resource must not be read.'));
    const encoded = await encodeCapturedScenarioRoot(rows, copies);
    const parsed = await parsePortableSyncRoot(encoded.envelope);
    if (parsed.kind !== 'scenario-project') throw new Error('Expected Scenario.');
    expect(encoded.retainedObjects).toHaveLength(rows.refs.length);
    const current = parsed.metadata.assets.find((asset) => asset.entry.id === 'current-image')!;
    expect(parsed.metadata.stepDocuments[0]!.document.assets[0]!.objectId).toBe(current.objectId);
    expect(
      encoded.objects.find((object) => object.ref.objectId === parsed.metadata.historyObjectId)
        ?.blob?.type
    ).toBe('application/json');
    expect(encoded.objects.some((object) => object.ref.objectId === current.objectId)).toBe(false);
    expect(encoded.envelope.descriptor.objectCount).toBe(encoded.objects.length + rows.refs.length);
    expect(io.read).not.toHaveBeenCalled();
    expect(io.live).not.toHaveBeenCalled();
  }
);

it('detaches verified copied bindings before frozen Scenario inventory yields', async () => {
  const rows = await acceptedRows();
  const { ref, copy } = await unloadedHtml(rows);
  const originalKey = copy.remote.key;
  const copies = new Map([[ref.assetId, copy]]);
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const read = io.read.getMockImplementation()!;
  io.read.mockImplementationOnce(async (...args: [AssetRef, string]) => {
    entered();
    await gate;
    return read(...args);
  });
  const pending = encodeCapturedScenarioRoot(rows, copies);
  await started;
  copy.remote.key = 'changed-live-key';
  copies.clear();
  release();
  const encoded = await pending;
  expect(encoded.retainedObjects?.[0]?.remoteKey).toBe(originalKey);
});

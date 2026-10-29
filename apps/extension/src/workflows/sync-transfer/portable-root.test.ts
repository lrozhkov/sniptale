import { beforeEach, expect, it, vi } from 'vitest';
import {
  createMediaLibraryEntry,
  createProjectExportEntry,
} from '../../composition/persistence/projects/index.test-support';
import { type CapturedMediaRows } from '../../composition/persistence/sync-capture/contracts';
import type { AssetRef } from '../../composition/persistence/assets';
import { parseCapturedVideoProjectRows } from '../../composition/persistence/sync-capture/guards';
import { encodeCapturedPortableRoot } from './captured-root';
import {
  parsePortableSyncRoot,
  portableSyncEditingObjectIds,
  preparePortableReplica,
} from './prepared-root';
import { parsePortableVideoProjectMetadata } from '../media-hub-backup/v6/root-codecs/projects';

import {
  EFFECT_BUNDLE_CORPUS,
  readEffectBundleCorpusArchive,
} from '../../../../../tooling/test/support/effect-v1-corpus.test-support';
import { importEffectBundleZip } from '../../features/video/project/effect-bundle/import/zip';

import { ref, mediaRows, capture, admission, projectRows } from './portable-root.test-support';

const io = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('../../composition/persistence/assets', async (original) => ({
  ...(await original<typeof import('../../composition/persistence/assets')>()),
  readAssetFile: io.read,
}));
beforeEach(() => {
  vi.clearAllMocks();
  io.read.mockImplementation(
    async (ref: AssetRef, name: string) =>
      new File([new Uint8Array(ref.size)], name, { type: ref.mimeType })
  );
});
it('binds portable effect slots to staged refs while retaining only native JSON snapshot metadata', async () => {
  const corpus = EFFECT_BUNDLE_CORPUS.find(
    ({ accepted, artifact }) => accepted && artifact.includes('asset-bearing-conformance')
  );
  if (!corpus) throw new Error('Missing asset-bearing effect fixture.');
  const imported = await importEffectBundleZip(readEffectBundleCorpusArchive(corpus));
  if (!imported.ok) throw new Error('Invalid effect fixture.');
  const document = imported.bundle.documents[0]!;
  const encoded = await encodeCapturedPortableRoot(
    capture({ kind: 'video-project', rows: projectRows() })
  );
  const metadata = parsePortableVideoProjectMetadata(encoded.envelope.metadata);
  const snapshotId = `effect:${document.sha256}`;
  metadata.entry.project.effectSnapshots = [
    {
      id: snapshotId,
      documentId: document.document.id,
      kind: document.document.kind,
      schemaVersion: 'sniptale.effect.v1',
      sha256: document.sha256,
      source: document.source,
      retainedByteLength:
        new TextEncoder().encode(document.source).byteLength +
        document.assets.reduce((sum, asset) => sum + asset.byteLength, 0),
      assets: document.assets.map((asset, index) => ({
        objectId: `effect-${index}`,
        id: asset.id,
        kind: asset.kind,
        byteLength: asset.byteLength,
        mimeType: asset.mimeType,
        sha256: asset.sha256,
      })),
    },
  ];
  const effectObjects = document.assets.map((asset, index) => ({
    objectId: `effect-${index}`,
    path: `_sniptale/assets/effect-${index}/effect.bin`,
    filename: 'effect.bin',
    mimeType: asset.mimeType,
    size: asset.byteLength,
  }));
  const envelope = {
    ...encoded.envelope,
    metadata: JSON.parse(JSON.stringify(metadata)),
    objects: [...encoded.envelope.objects, ...effectObjects],
    descriptor: {
      ...encoded.envelope.descriptor,
      objectCount: 1 + effectObjects.length,
      totalBytes: 1024 + effectObjects.reduce((sum, object) => sum + object.size, 0),
    },
  };
  const sourceObjectId = encoded.envelope.objects[0]!.objectId;
  const verifiedObjects = new Map([
    [sourceObjectId, ref('native-source')],
    ...effectObjects.map((object): [string, AssetRef] => [
      object.objectId,
      {
        ...ref(`staged-${object.objectId}`),
        size: object.size,
        mimeType: object.mimeType,
        sha256: null,
      },
    ]),
  ]);
  const parsed = await parsePortableSyncRoot(envelope);
  expect(portableSyncEditingObjectIds(parsed)).toEqual([
    sourceObjectId,
    ...effectObjects.map((object) => object.objectId),
  ]);
  const args = { envelope, verifiedObjects, senderDependencies: [], admission: admission() };
  const payload = await preparePortableReplica(args);
  if (payload.kind !== 'video-project') throw new Error('Expected project.');
  expect(payload.input.root.snapshotRefs).toEqual(
    document.assets.map((asset, index) => ({
      snapshotId,
      assetId: asset.id,
      ref: verifiedObjects.get(`effect-${index}`),
    }))
  );
  const slots = payload.input.root.entry.project.effectSnapshots![0]!.assets;
  expect(slots).toEqual(
    document.assets.map((asset) => ({
      id: asset.id,
      kind: asset.kind,
      byteLength: asset.byteLength,
      mimeType: asset.mimeType,
      sha256: asset.sha256,
    }))
  );
  expect(JSON.stringify(payload.input.root.entry)).not.toContain('"objectId"');
  expect(slots.every((asset) => !('blob' in asset))).toBe(true);
  verifiedObjects.delete(effectObjects[0]!.objectId);
  await expect(preparePortableReplica(args)).rejects.toThrow('binding');
});
it('encodes a frozen original and binds verified target bytes through the existing native row parser', async () => {
  const original = mediaRows();
  const result = await encodeCapturedPortableRoot(capture({ kind: 'media', rows: original }));
  const local = ref('target-bytes');
  const payload = await preparePortableReplica({
    envelope: result.envelope,
    verifiedObjects: new Map([[result.envelope.objects[0]!.objectId, local]]),
    senderDependencies: [],
    admission: admission(),
  });
  expect(payload.kind).toBe('media');
  if (payload.kind !== 'media') throw new Error('Expected media.');
  if (!('projectAsset' in payload.input.rows)) throw new Error('Expected project asset.');
  expect(payload.input.rows.projectAsset.assetId).toBe(local.assetId);
  expect(payload.input.connectionGeneration).toBe(3);
  expect(result.objects[0]!.blob).toBeInstanceOf(File);
  expect(JSON.stringify(result.envelope)).not.toContain('"assetId"');
  expect(io.read).toHaveBeenCalledWith(original.ref, original.media.filename);
});
it('detaches caller metadata before an asynchronous captured byte read', async () => {
  let finish: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  io.read.mockImplementationOnce(async (source: AssetRef, name: string) => {
    await gate;
    return new File([new Uint8Array(source.size)], name, { type: source.mimeType });
  });
  const draft = capture({ kind: 'media', rows: mediaRows() });
  const pending = encodeCapturedPortableRoot(draft);
  if (draft.change.kind === 'media') draft.change.rows.media.tags.push('late mutation');
  finish!();
  const encoded = await pending;
  expect(JSON.stringify(encoded.envelope)).not.toContain('late mutation');
});
it('keeps private project sources and opens without downloading saved export bytes', async () => {
  const rows = projectRows();
  const exported = createProjectExportEntry({
    id: 'saved',
    projectId: rows.project.id,
    assetId: 'export-bytes',
    mimeType: 'video/webm',
    size: 1024,
  });
  rows.exports.push(exported);
  rows.refs.push(ref(exported.assetId));
  expect(parseCapturedVideoProjectRows(rows)).not.toBeNull();
  const encoded = await encodeCapturedPortableRoot(capture({ kind: 'video-project', rows }));
  expect(encoded.envelope.objects).toHaveLength(2);
  const payload = await preparePortableReplica({
    envelope: encoded.envelope,
    verifiedObjects: new Map([[encoded.envelope.objects[0]!.objectId, ref('private-target')]]),
    senderDependencies: encoded.dependencies,
    admission: admission(),
  });
  if (payload.kind !== 'video-project') throw new Error('Expected project.');
  expect(payload.input.root.assets[0]!.publishToLibrary).toBe(false);
  expect(payload.input.root.entry.project.clips).toEqual(rows.project.project.clips);
  expect(payload.input.root).not.toHaveProperty('exports');
});
it('binds borrowed sources to target admission by basis rather than sender generation', async () => {
  const rows = projectRows(true);
  const encoded = await encodeCapturedPortableRoot(capture({ kind: 'video-project', rows }));
  const local = ref('admitted-target');
  const context = admission();
  context.dependencies = [
    { entry: rows.media[0]!, ref: local, expectedGeneration: 7, expectedBasis: ['source-op'] },
  ];
  const args = {
    envelope: encoded.envelope,
    verifiedObjects: new Map([[encoded.envelope.objects[0]!.objectId, local]]),
    senderDependencies: encoded.dependencies,
    admission: context,
  };
  const payload = await preparePortableReplica(args);
  if (payload.kind !== 'video-project') throw new Error('Expected project.');
  expect(payload.input.root.assets[0]!.reusePublished).toBe(true);
  expect(payload.input.dependencies[0]!.expectedGeneration).toBe(7);
  context.dependencies[0]!.expectedBasis = ['other-op'];
  await expect(preparePortableReplica(args)).rejects.toThrow('causal dependency');
  context.dependencies[0]!.expectedBasis = ['source-op'];
  args.verifiedObjects.set(encoded.envelope.objects[0]!.objectId, ref('arbitrary-bytes'));
  await expect(preparePortableReplica(args)).rejects.toThrow('admitted target bytes');
});
it('rejects size, MIME, missing and extra inventory and unsupported metadata before native effects', async () => {
  const encoded = await encodeCapturedPortableRoot(capture({ kind: 'media', rows: mediaRows() }));
  const object = encoded.envelope.objects[0]!;
  const args = {
    envelope: encoded.envelope,
    verifiedObjects: new Map([[object.objectId, ref('target')]]),
    senderDependencies: [],
    admission: admission(),
  };
  for (const bad of [
    { ...ref(), size: 1 },
    { ...ref(), mimeType: 'image/png' },
  ]) {
    await expect(
      preparePortableReplica({ ...args, verifiedObjects: new Map([[object.objectId, bad]]) })
    ).rejects.toThrow();
  }
  await expect(preparePortableReplica({ ...args, verifiedObjects: new Map() })).rejects.toThrow();
  await expect(
    preparePortableReplica({
      ...args,
      verifiedObjects: new Map([...args.verifiedObjects, ['extra', ref()]]),
    })
  ).rejects.toThrow();
  const metadata = encoded.envelope.metadata;
  await expect(
    preparePortableReplica({
      ...args,
      envelope: {
        ...encoded.envelope,
        metadata: { ...Object(metadata), thumbnail: { objectId: 'other' } },
      },
    })
  ).rejects.toThrow();
  await expect(
    preparePortableReplica({ ...args, envelope: { ...encoded.envelope, objects: [] } })
  ).rejects.toThrow();
});

it('keeps a borrowed Library original as an independent media root with no project byte substitution', async () => {
  const rows = projectRows(true);
  rows.project.project.assets[0]!.source = { kind: 'library-asset', mediaId: rows.media[0]!.id };
  expect(parseCapturedVideoProjectRows(rows)).not.toBeNull();
  const encoded = await encodeCapturedPortableRoot(capture({ kind: 'video-project', rows }));
  expect(encoded.objects).toEqual([]);
  const local = ref('independent-media-body');
  const context = admission();
  context.dependencies = [
    { entry: rows.media[0]!, ref: local, expectedGeneration: 9, expectedBasis: ['source-op'] },
  ];
  const payload = await preparePortableReplica({
    envelope: encoded.envelope,
    verifiedObjects: new Map(),
    senderDependencies: encoded.dependencies,
    admission: context,
  });
  if (payload.kind !== 'video-project') throw new Error('Expected project.');
  expect(payload.input.root.assets).toEqual([]);
  expect(payload.input.root.entry.project.assets[0]!.source).toEqual({
    kind: 'library-asset',
    mediaId: rows.media[0]!.id,
  });
  expect(payload.input.dependencies[0]!.ref).toEqual(local);
});
it('rejects an unused declared object even when descriptor totals are internally consistent', async () => {
  const encoded = await encodeCapturedPortableRoot(capture({ kind: 'media', rows: mediaRows() }));
  const first = encoded.envelope.objects[0]!;
  const extra = {
    ...first,
    objectId: 'unused',
    path: `_sniptale/assets/unused/${first.filename}`,
  };
  await expect(
    preparePortableReplica({
      envelope: {
        ...encoded.envelope,
        descriptor: {
          ...encoded.envelope.descriptor,
          objectCount: 2,
          totalBytes: first.size + extra.size,
        },
        objects: [first, extra],
      },
      verifiedObjects: new Map([[first.objectId, ref('target')]]),
      senderDependencies: [],
      admission: admission(),
    })
  ).rejects.toThrow('unused objects');
});

it('preserves the target native predecessor when preparing a later media original', async () => {
  const encoded = await encodeCapturedPortableRoot(capture({ kind: 'media', rows: mediaRows() }));
  const local = {
    ...admission(),
    expectedLocalGeneration: 8,
    expectedBasis: ['admitted-original'],
  };
  const payload = await preparePortableReplica({
    envelope: encoded.envelope,
    verifiedObjects: new Map([[encoded.envelope.objects[0]!.objectId, ref('later-target')]]),
    senderDependencies: [],
    admission: local,
  });
  expect(payload.kind).toBe('media');
  expect(payload.input).toMatchObject({
    expectedLocalGeneration: 8,
    expectedBasis: ['admitted-original'],
    spaceId: local.spaceId,
    profileCreatedAt: local.profileCreatedAt,
  });
});
it.each([false, true])(
  'preserves original-only media lifecycle metadata for trashed=%s',
  async (trashed) => {
    const rows = mediaRows();
    rows.media.lifecycle = {
      storageClass: 'library',
      savedAt: 1,
      updatedAt: 2,
      ...(trashed ? { trashedAt: 2 } : {}),
    };
    rows.media.tags = ['retained-tag'];
    const encoded = await encodeCapturedPortableRoot(capture({ kind: 'media', rows }));
    const payload = await preparePortableReplica({
      envelope: encoded.envelope,
      verifiedObjects: new Map([[encoded.envelope.objects[0]!.objectId, ref('retained-original')]]),
      senderDependencies: [],
      admission: admission(),
    });
    if (payload.kind !== 'media') throw new Error('Expected media.');
    expect(payload.input.rows.media.lifecycle).toEqual(rows.media.lifecycle);
    expect(payload.input.rows.media.tags).toEqual(['retained-tag']);
  }
);
it('preserves a trashed manual project and its exact known trashed dependency', async () => {
  const rows = projectRows(true);
  const lifecycle = { storageClass: 'library' as const, savedAt: 1, updatedAt: 2, trashedAt: 2 };
  rows.project.lifecycle = lifecycle;
  rows.media[0]!.lifecycle = lifecycle;
  const encoded = await encodeCapturedPortableRoot(capture({ kind: 'video-project', rows }));
  const local = ref('retained-source');
  const context = admission();
  context.dependencies = [
    {
      entry: rows.media[0]!,
      ref: local,
      expectedGeneration: 7,
      expectedBasis: ['source-op'],
    },
  ];
  const payload = await preparePortableReplica({
    envelope: encoded.envelope,
    verifiedObjects: new Map([[encoded.envelope.objects[0]!.objectId, local]]),
    senderDependencies: encoded.dependencies,
    admission: context,
  });
  if (payload.kind !== 'video-project') throw new Error('Expected project.');
  expect(payload.input.root.entry.lifecycle).toEqual(lifecycle);
  expect(payload.input.dependencies).toEqual(context.dependencies);
  expect(payload.input.root.assets[0]!.reusePublished).toBe(true);
});

it('rebinds a later portable private source without overwriting the predecessor child identity', async () => {
  const rows = projectRows();
  const encoded = await encodeCapturedPortableRoot(capture({ kind: 'video-project', rows }));
  const objectId = encoded.envelope.objects[0]!.objectId;
  const first = await preparePortableReplica({
    envelope: encoded.envelope,
    verifiedObjects: new Map([[objectId, ref('first-local-body')]]),
    senderDependencies: encoded.dependencies,
    admission: admission(),
  });
  const local = admission();
  local.operationId = 'next-revision';
  local.expectedLocalGeneration = 1;
  local.expectedBasis = ['op'];
  const second = await preparePortableReplica({
    envelope: encoded.envelope,
    verifiedObjects: new Map([[objectId, ref('next-local-body')]]),
    senderDependencies: encoded.dependencies,
    admission: local,
  });
  if (first.kind !== 'video-project' || second.kind !== 'video-project')
    throw new Error('Expected project.');
  const firstAsset = first.input.root.assets[0]!;
  const nextAsset = second.input.root.assets[0]!;
  expect(nextAsset.entry.id).not.toBe(firstAsset.entry.id);
  expect(nextAsset.ref.assetId).toBe('next-local-body');
  expect(second.input.root.entry.project.assets[0]!.source).toEqual({
    kind: 'project-asset',
    projectAssetId: nextAsset.entry.id,
  });
  expect(second.input.root.entry.project.clips).toEqual(first.input.root.entry.project.clips);
});

it.each(['video/webm', 'image/png'])(
  'round-trips an independent %s created export through the existing backup codec',
  async (mimeType) => {
    const original = { ...ref('export-bytes'), mimeType };
    const projectExport = createProjectExportEntry({
      id: 'standalone',
      projectId: 'parent',
      assetId: original.assetId,
      mimeType,
      size: original.size,
      filename: mimeType === 'image/png' ? 'saved.png' : 'saved.webm',
    });
    const rows: CapturedMediaRows = {
      ref: original,
      projectExport,
      media: createMediaLibraryEntry({
        id: 'export:standalone',
        kind: 'export',
        source: { kind: 'project-export', projectId: 'parent', exportId: 'standalone' },
        mimeType,
        size: original.size,
        filename: projectExport.filename,
        workspaceRevision: 0,
        lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: 1 },
      }),
    };
    const encoded = await encodeCapturedPortableRoot(capture({ kind: 'media', rows }));
    expect(encoded.objects).toHaveLength(1);
    expect(encoded.objects[0]?.blob.type).toBe(mimeType);
    const prepared = await preparePortableReplica({
      envelope: encoded.envelope,
      verifiedObjects: new Map(encoded.bindings.map((binding) => [binding.objectId, binding.ref])),
      senderDependencies: [],
      admission: admission(),
    });
    expect(prepared.kind).toBe('media');
    if (prepared.kind !== 'media') throw new Error('Expected standalone export publication');
    expect(prepared.input.rows.media.source).toEqual(rows.media.source);
    expect(prepared.input.rows.ref).toEqual(original);
    expect('projectExport' in prepared.input.rows && prepared.input.rows.projectExport.id).toBe(
      projectExport.id
    );
  }
);

import { beforeEach, expect, it, vi } from 'vitest';
import {
  createMediaLibraryEntry,
  createProjectExportEntry,
  createVideoProjectEntryWithMediaClip,
} from '../../composition/persistence/projects/index.test-support';
import {
  captureRootKey,
  type CapturedChange,
  type CapturedMediaRows,
  type CapturedVideoProjectRows,
} from '../../composition/persistence/sync-capture/contracts';
import type { AssetRef } from '../../composition/persistence/assets';
import { parseCapturedVideoProjectRows } from '../../composition/persistence/sync-capture/guards';
import { encodeCapturedPortableRoot } from './captured-root';
import { preparePortableReplica, type PortableReplicaAdmission } from './prepared-root';

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
function ref(assetId = 'sender-bytes'): AssetRef {
  return {
    assetId,
    createdAt: 1,
    location: { kind: 'opfs', objectKey: `objects/${assetId}` },
    mimeType: 'video/webm',
    size: 1024,
    sha256: 'a'.repeat(64),
  };
}
function mediaRows(): CapturedMediaRows {
  const original = ref();
  return {
    ref: original,
    projectAsset: {
      id: 'source',
      assetId: original.assetId,
      mimeType: original.mimeType,
      size: original.size,
      createdAt: 1,
    },
    media: createMediaLibraryEntry({
      id: 'project-asset:source',
      source: { kind: 'project-asset', projectAssetId: 'source' },
      mimeType: original.mimeType,
      size: original.size,
      workspaceRevision: 0,
      lifecycle: { savedAt: 1, storageClass: 'library', updatedAt: 1 },
    }),
  };
}
function capture(change: CapturedChange['change']): CapturedChange {
  const rootKind = change.kind === 'media' ? 'media' : 'video-project';
  const rootId =
    change.kind === 'media'
      ? change.rows.media.id
      : change.kind === 'video-project'
        ? change.rows.project.id
        : 'deleted';
  const rootKey = captureRootKey('space', rootKind, rootId);
  return {
    version: 1,
    kind: 'captured-change',
    key: JSON.stringify(['captured-change', 'op']),
    createdAt: 1,
    spaceId: 'space',
    connectionGeneration: 19,
    rootKind,
    rootId,
    rootKey,
    generation: 4,
    operationId: 'op',
    basis: [],
    origin: 'local-edit',
    publicationId: null,
    change,
  };
}
function admission(): PortableReplicaAdmission {
  return {
    operationId: 'remote-operation',
    sourceDigest: 'b'.repeat(64),
    connectionGeneration: 3,
    expectedLocalGeneration: 0,
    expectedWorkspaceRevision: null,
    dependencies: [],
  };
}
function projectRows(borrowed = false): CapturedVideoProjectRows {
  const rows = mediaRows();
  const project = createVideoProjectEntryWithMediaClip({ id: 'project' });
  project.project.assets[0]!.source = {
    kind: 'project-asset',
    projectAssetId: rows.projectAsset.id,
  };
  return {
    project,
    assets: [rows.projectAsset],
    refs: [rows.ref],
    exports: [],
    media: borrowed ? [rows.media] : [],
    mediaDependencies: borrowed
      ? [{ mediaId: rows.media.id, generation: 22, basis: ['source-op'] }]
      : [],
  };
}
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
    path: first.path.replace(first.objectId, 'unused'),
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

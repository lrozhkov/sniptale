import { beforeEach, expect, it, vi } from 'vitest';
import {
  EFFECT_BUNDLE_CORPUS,
  readEffectBundleCorpusArchive,
} from '../../../../../tooling/test/support/effect-v1-corpus.test-support';
import type { AssetRef } from '../../composition/persistence/assets';
import type { CapturedVideoProjectRows } from '../../composition/persistence/sync-capture/contracts';
import {
  createProjectAssetEntry,
  createProjectExportEntry,
  createVideoProjectEntryWithMediaClip,
} from '../../composition/persistence/projects/index.test-support';
import { importEffectBundleZip } from '../../features/video/project/effect-bundle/import/zip';
import { parsePortableVideoProjectMetadata } from '../media-hub-backup/v6/root-codecs/projects';
import { encodeCapturedProjectRoot } from './captured-project';
import { parsePortableSyncRoot, preparePortableReplica } from './prepared-root';
import { workspace as reviewWorkspace } from '../../composition/persistence/review-workspaces/backup-restore.test-support';
import { parseVideoWorkspace } from '../../composition/persistence/review-workspaces/parser';
import { createQuickEditWebcam } from '../../features/video/review/advanced/webcam';

const io = vi.hoisted(() => ({ read: vi.fn(), files: new Map<string, File>() }));
vi.mock('../../composition/persistence/assets', async (original) => ({
  ...(await original<typeof import('../../composition/persistence/assets')>()),
  readAssetFile: io.read,
}));
beforeEach(() => {
  vi.clearAllMocks();
  io.files.clear();
  io.read.mockImplementation(async (ref: AssetRef, filename: string) => {
    const file = new File([new Uint8Array(ref.size)], filename, { type: ref.mimeType });
    io.files.set(ref.assetId, file);
    return file;
  });
});

function projectRows(): CapturedVideoProjectRows {
  const project = createVideoProjectEntryWithMediaClip({
    id: 'project-one',
    name: 'Frozen project',
  });
  const asset = createProjectAssetEntry({
    id: 'project-asset-1',
    assetId: 'source-original',
    mimeType: 'video/webm',
    size: 1024,
  });
  const exported = createProjectExportEntry({
    id: 'export-one',
    projectId: project.id,
    assetId: 'export-original',
    // Identical names, MIME and sizes must not substitute one native binding for another.
    filename: 'Asset 001.webm',
    mimeType: asset.mimeType,
    size: asset.size,
  });
  return {
    project,
    assets: [asset],
    exports: [exported],
    media: [],
    refs: [asset, exported].map((entry) => ({
      assetId: entry.assetId,
      createdAt: entry.createdAt,
      location: { kind: 'opfs', objectKey: `objects/${entry.assetId}` },
      mimeType: entry.mimeType ?? 'video/webm',
      size: entry.size,
      sha256: null,
    })),
    mediaDependencies: [],
  };
}

it('uses backup project inventory and binds exact native originals without copying their files', async () => {
  const rows = projectRows();
  const result = await encodeCapturedProjectRoot(rows);
  const metadata = parsePortableVideoProjectMetadata(result.envelope.metadata);
  const source = metadata.projectAssets[0]!;
  const exported = metadata.projectExports[0]!;
  expect(result.bindings).toEqual([
    { objectId: source.objectId, ref: rows.refs[0] },
    { objectId: exported.objectId, ref: rows.refs[1] },
  ]);
  expect(result.objects.map((object) => object.ref.filename)).toEqual([
    'Asset 001.webm',
    'Asset 001.webm',
  ]);
  for (const binding of result.bindings)
    expect(result.objects.find((object) => object.ref.objectId === binding.objectId)!.blob).toBe(
      io.files.get(binding.ref.assetId)
    );
  expect(source.publishToLibrary).toBe(false);
  expect(result.dependencies).toEqual([]);
  expect(JSON.stringify(result.envelope)).not.toContain('source-original');
  expect(JSON.stringify(result.envelope)).not.toContain('export-original');
  expect(result.envelope.descriptor.totalBytes).toBe(2048);
});

it('detaches the complete project before the first asynchronous source read', async () => {
  const rows = projectRows();
  let entered!: () => void;
  let release!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  io.read.mockImplementationOnce(async (ref: AssetRef, filename: string) => {
    entered();
    await gate;
    return new File([new Uint8Array(ref.size)], filename, { type: ref.mimeType });
  });
  const pending = encodeCapturedProjectRoot(rows);
  await started;
  rows.project.project.name = 'Live replacement';
  rows.assets[0]!.assetId = 'live-replacement';
  rows.refs[0]!.assetId = 'live-replacement';
  release();
  const result = await pending;
  expect(JSON.stringify(result.envelope)).not.toContain('Live replacement');
  expect(result.bindings[0]!.ref.assetId).toBe('source-original');
});

it('keeps effect binary objects unbound while preserving the complete backup snapshot metadata', async () => {
  const corpus = EFFECT_BUNDLE_CORPUS.find(
    ({ accepted, artifact }) => accepted && artifact.includes('asset-bearing-conformance')
  );
  if (!corpus) throw new Error('Missing asset-bearing effect fixture.');
  const imported = await importEffectBundleZip(readEffectBundleCorpusArchive(corpus));
  if (!imported.ok) throw new Error('Invalid effect fixture.');
  const document = imported.bundle.documents[0]!;
  const rows = projectRows();
  rows.project.project.effectSnapshots = [
    {
      id: `effect:${document.sha256}`,
      documentId: document.document.id,
      kind: document.document.kind,
      schemaVersion: 'sniptale.effect.v1',
      sha256: document.sha256,
      source: document.source,
      retainedByteLength:
        new TextEncoder().encode(document.source).byteLength +
        document.assets.reduce((sum, asset) => sum + asset.byteLength, 0),
      assets: document.assets.map((asset) => ({
        blob: new Blob([Uint8Array.from(asset.bytes).buffer], { type: asset.mimeType }),
        id: asset.id,
        kind: asset.kind,
        byteLength: asset.byteLength,
        mimeType: asset.mimeType,
        sha256: asset.sha256,
      })),
    },
  ];
  const result = await encodeCapturedProjectRoot(rows);
  const metadata = parsePortableVideoProjectMetadata(result.envelope.metadata);
  const snapshots = metadata.entry.project.effectSnapshots!;
  expect(snapshots[0]!.source).toBe(document.source);
  expect(result.objects).toHaveLength(2 + document.assets.length);
  expect(result.bindings).toHaveLength(2);
  for (const asset of snapshots[0]!.assets) {
    expect(asset).not.toHaveProperty('blob');
    expect(result.bindings.some((binding) => binding.objectId === asset.objectId)).toBe(false);
    const object = result.objects.find((object) => object.ref.objectId === asset.objectId)!;
    expect(object.ref.size).toBe(asset.byteLength);
    expect(object.ref.filename).not.toContain(':');
  }
});

it('refuses missing dependency evidence and changed native file metadata', async () => {
  const rows = projectRows();
  delete rows.mediaDependencies;
  await expect(encodeCapturedProjectRoot(rows)).rejects.toThrow('dependency evidence');
  expect(io.read).not.toHaveBeenCalled();
  rows.mediaDependencies = [];
  io.read.mockResolvedValue(new File(['short'], 'Asset 001.webm', { type: 'video/webm' }));
  await expect(encodeCapturedProjectRoot(rows)).rejects.toThrow('native reference');
});

it.each([false, true])(
  'preserves recursive reviews through encoding and replica preparation (cycle=%s)',
  async (cycle) => {
    const rows = projectRows();
    const source = rows.assets[0]!;
    const camera = createProjectAssetEntry({
      id: 'camera-b',
      assetId: 'camera-b-original',
      mimeType: 'video/webm',
      size: 6,
    });
    const nested = createProjectAssetEntry({
      id: 'camera-c',
      assetId: 'camera-c-original',
      mimeType: 'video/webm',
      size: 6,
    });
    rows.assets.push(camera, nested);
    for (const asset of [camera, nested])
      rows.refs.push({
        assetId: asset.assetId,
        createdAt: asset.createdAt,
        location: { kind: 'opfs', objectKey: `objects/${asset.assetId}` },
        mimeType: asset.mimeType,
        size: asset.size,
        sha256: null,
      });
    rows.reviews = [
      { source, supplementary: camera },
      { source: camera, supplementary: nested },
      ...(cycle ? [{ source: nested, supplementary: camera }] : []),
    ].map(({ source: owner, supplementary }) => {
      const workspace = parseVideoWorkspace({
        ...reviewWorkspace,
        aggregateId: `project-asset:${owner.id}`,
        sourceAssetId: owner.assetId,
        source: { ...reviewWorkspace.source, size: owner.size, mimeType: owner.mimeType },
        history: [],
        cursor: 0,
        advanced: {
          ...reviewWorkspace.advanced,
          webcam: createQuickEditWebcam(
            `project-asset:${supplementary.id}`,
            reviewWorkspace.source,
            reviewWorkspace.source
          ),
        },
      });
      if (!workspace) throw new Error('Expected valid native recursive review fixture.');
      return { workspace, draft: null };
    });
    const encoded = await encodeCapturedProjectRoot(rows);
    const parsed = await parsePortableSyncRoot(encoded.envelope);
    expect(parsed.kind).toBe('video-project');
    const verifiedObjects = new Map(
      encoded.objects.map((object): [string, AssetRef] => [
        object.ref.objectId,
        {
          assetId: `received-${object.ref.objectId}`,
          createdAt: 1,
          location: { kind: 'opfs', objectKey: `objects/received-${object.ref.objectId}` },
          mimeType: object.ref.mimeType,
          size: object.ref.size,
          sha256: null,
        },
      ])
    );
    const payload = await preparePortableReplica({
      envelope: encoded.envelope,
      verifiedObjects,
      senderDependencies: encoded.dependencies,
      admission: {
        operationId: 'recursive-review-operation',
        sourceDigest: 'a'.repeat(64),
        connectionGeneration: 1,
        spaceId: 'space',
        profileCreatedAt: 1,
        expectedLocalGeneration: 1,
        expectedBasis: ['previous-project'],
        expectedWorkspaceRevision: 0,
        dependencies: [],
      },
    });
    if (payload.kind !== 'video-project') throw new Error('Expected project replica.');
    const restored = payload.input.root.assets;
    expect(restored).toHaveLength(3);
    const expectedRefs = rows.assets.map((asset) => {
      const binding = encoded.bindings.find((item) => item.ref.assetId === asset.assetId);
      if (!binding) throw new Error(`Missing encoded original: ${asset.id}.`);
      return verifiedObjects.get(binding.objectId)!.assetId;
    });
    expect(new Set(restored.map((asset) => asset.ref.assetId))).toEqual(new Set(expectedRefs));
    const [restoredSource, restoredCamera, restoredNested] = expectedRefs.map((assetId) =>
      restored.find((asset) => asset.ref.assetId === assetId)!
    );
    expect(restored.filter((asset) => asset.videoReview)).toHaveLength(cycle ? 3 : 2);
    for (const [owner, supplementary] of [
      [restoredSource!, restoredCamera!],
      [restoredCamera!, restoredNested!],
      ...(cycle ? [[restoredNested!, restoredCamera!]] : []),
    ]) {
      expect(owner!.videoReview!.workspace.aggregateId).toBe(`project-asset:${owner!.entry.id}`);
      expect(owner!.videoReview!.workspace.sourceAssetId).toBe(owner!.ref.assetId);
      expect(owner!.videoReview!.workspace.advanced.webcam!.assetId).toBe(
        `project-asset:${supplementary!.entry.id}`
      );
    }
    expect(restored.map((asset) => asset.entry.id)).not.toEqual(
      rows.assets.map((asset) => asset.id)
    );
    expect(payload.input.dependencies).toEqual([]);
  }
);

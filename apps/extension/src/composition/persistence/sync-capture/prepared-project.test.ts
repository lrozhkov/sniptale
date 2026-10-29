import { beforeEach, expect, it, vi } from 'vitest';
import {
  EFFECT_BUNDLE_CORPUS,
  readEffectBundleCorpusArchive,
} from '../../../../../../tooling/test/support/effect-v1-corpus.test-support';
import { importEffectBundleZip } from '../../../features/video/project/effect-bundle/import/zip';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { createProjectExportEntry } from '../projects/index.test-support';
import { parseVideoProjectEntry } from '../projects/read-guards';
import { annotation, workspace } from '../review-workspaces/backup-restore.test-support';
import type { AssetRef } from '../assets';
import {
  collectPreparedProjectReplicaRefs,
  hydratePreparedVideoProjectReplicaRoot,
  parsePreparedVideoProjectReplicaRoot,
  type PreparedVideoProjectReplicaRoot,
} from './prepared-project';

const io = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('../assets', async (original) => ({
  ...(await original<typeof import('../assets')>()),
  readAssetFile: io.read,
}));
beforeEach(() => vi.clearAllMocks());

async function setup() {
  const corpus = EFFECT_BUNDLE_CORPUS.find(
    ({ accepted, artifact }) => accepted && artifact.includes('asset-bearing-conformance')
  );
  if (!corpus) throw new Error('Missing asset-bearing effect corpus');
  const imported = await importEffectBundleZip(readEffectBundleCorpusArchive(corpus));
  if (!imported.ok) throw new Error('Expected valid corpus');
  const document = imported.bundle.documents[0]!;
  const files = new Map<string, File>();
  function staged(assetId: string, bytes: Uint8Array, mimeType: string): AssetRef {
    files.set(assetId, new File([Uint8Array.from(bytes).buffer], assetId, { type: mimeType }));
    return {
      assetId,
      createdAt: 1,
      location: { kind: 'opfs', objectKey: `objects/${assetId}` },
      mimeType,
      size: bytes.byteLength,
      sha256: null,
    };
  }
  io.read.mockImplementation(async (ref: AssetRef) => {
    const file = files.get(ref.assetId);
    if (!file) throw new Error('Missing staged file');
    return file;
  });
  const snapshotId = `effect:${document.sha256}`;
  const project = createEmptyVideoProject('Prepared effect graph');
  const root: PreparedVideoProjectReplicaRoot = {
    entry: {
      id: project.id,
      createdAt: 1,
      updatedAt: 2,
      workspaceRevision: 3,
      project: {
        ...project,
        effectSnapshots: [
          {
            assets: document.assets.map((asset) => ({
              id: asset.id,
              byteLength: asset.byteLength,
              kind: asset.kind,
              mimeType: asset.mimeType,
              sha256: asset.sha256,
            })),
            documentId: document.document.id,
            id: snapshotId,
            kind: document.document.kind,
            retainedByteLength:
              new TextEncoder().encode(document.source).byteLength +
              document.assets.reduce((size, asset) => size + asset.byteLength, 0),
            schemaVersion: 'sniptale.effect.v1',
            sha256: document.sha256,
            source: document.source,
          },
        ],
      },
    },
    assets: [],
    snapshotRefs: document.assets.map((asset, index) => ({
      snapshotId,
      assetId: asset.id,
      ref: staged(`effect-${index}`, asset.bytes, asset.mimeType),
    })),
  };
  return { root, files, staged };
}

it('hydrates the asset-bearing effect corpus and detaches bytes before staging invalidation', async () => {
  const data = await setup();
  const before = JSON.stringify(data.root);
  const parsed = parsePreparedVideoProjectReplicaRoot(data.root);
  expect(JSON.stringify(data.root)).toBe(before);
  expect(collectPreparedProjectReplicaRefs(parsed)).toEqual(
    data.root.snapshotRefs!.map((binding) => binding.ref)
  );
  const hydrated = await hydratePreparedVideoProjectReplicaRoot(parsed);
  expect(parseVideoProjectEntry(hydrated.entry)).not.toBeNull();
  data.files.clear();
  const assets = hydrated.entry.project.effectSnapshots![0]!.assets;
  expect(assets.length).toBeGreaterThan(0);
  expect((await assets[0]!.blob.arrayBuffer()).byteLength).toBe(assets[0]!.byteLength);
  expect(JSON.stringify(data.root)).toBe(before);
});

it.each(['missing', 'extra', 'duplicate', 'wrong-slot', 'size', 'mime', 'digest'] as const)(
  'refuses inexact effect binding closure: %s',
  async (change) => {
    const { root } = await setup();
    const binding = root.snapshotRefs![0]!;
    if (change === 'missing') root.snapshotRefs = [];
    if (change === 'extra') root.snapshotRefs!.push({ ...binding, assetId: 'undeclared' });
    if (change === 'duplicate') root.snapshotRefs!.push(binding);
    if (change === 'wrong-slot') binding.snapshotId = 'different-snapshot';
    if (change === 'size') binding.ref.size++;
    if (change === 'mime') binding.ref.mimeType = 'image/jpeg';
    if (change === 'digest') binding.ref.sha256 = '0'.repeat(64);
    expect(() => parsePreparedVideoProjectReplicaRoot(root)).toThrow('invalid');
    expect(io.read).not.toHaveBeenCalled();
  }
);

it.each(['missing', 'corrupt', 'size', 'mime'] as const)(
  'refuses missing or changed staged effect bytes: %s',
  async (change) => {
    const { root, files } = await setup();
    const ref = root.snapshotRefs![0]!.ref;
    if (change === 'missing') files.delete(ref.assetId);
    else
      files.set(
        ref.assetId,
        new File([new Uint8Array(change === 'size' ? ref.size + 1 : ref.size)], 'changed', {
          type: change === 'mime' ? 'image/jpeg' : ref.mimeType,
        })
      );
    await expect(hydratePreparedVideoProjectReplicaRoot(root)).rejects.toThrow();
  }
);

it('rejects Blob and class instances at the staged JSON boundary', async () => {
  const { root } = await setup();
  expect(() =>
    parsePreparedVideoProjectReplicaRoot({ ...root, extra: new Blob(['bytes']) })
  ).toThrow('invalid');
  expect(() => parsePreparedVideoProjectReplicaRoot({ ...root, extra: new Date() })).toThrow(
    'invalid'
  );
  const asset = root.entry.project.effectSnapshots![0]!.assets[0]!;
  expect(() =>
    parsePreparedVideoProjectReplicaRoot({
      ...root,
      entry: {
        ...root.entry,
        project: {
          ...root.entry.project,
          effectSnapshots: [
            {
              ...root.entry.project.effectSnapshots![0]!,
              assets: [{ ...asset, blob: new Blob(['hidden']) }],
            },
          ],
        },
      },
    })
  ).toThrow('invalid');
});

it('hydrates associated presentation and thumbnail sidecars and deduplicates physical claims', async () => {
  const data = await setup();
  const ref = data.staged('shared-thumbnail', new Uint8Array([1, 2]), 'image/png');
  const previewRef = data.staged('preview', new Uint8Array([3]), 'image/png');
  data.root.thumbnail = {
    entry: {
      assetId: `video-project:${data.root.entry.id}`,
      createdAt: 1,
      updatedAt: 2,
      width: 8,
      height: 8,
    },
    ref,
  };
  data.root.presentation = {
    entry: {
      aggregateId: data.root.entry.id,
      aggregateKind: 'video-project',
      presentationRevision: 3,
      updatedAt: 2,
    },
    thumbnailRef: ref,
    previewRef,
  };
  expect(
    collectPreparedProjectReplicaRefs(data.root).filter((item) => item.assetId === ref.assetId)
  ).toHaveLength(1);
  const hydrated = await hydratePreparedVideoProjectReplicaRoot(data.root);
  data.files.clear();
  expect(await hydrated.thumbnail!.blob.arrayBuffer()).toEqual(new Uint8Array([1, 2]).buffer);
  expect(await hydrated.presentation!.previewBlob!.arrayBuffer()).toEqual(
    new Uint8Array([3]).buffer
  );
  expect(hydrated.presentation!.aggregateId).toBe(data.root.entry.id);
});

it('refuses inconsistent physical claims and unrelated sidecars', async () => {
  const data = await setup();
  const ref = data.root.snapshotRefs![0]!.ref;
  data.root.thumbnail = {
    entry: {
      assetId: `video-project:${data.root.entry.id}`,
      createdAt: 1,
      updatedAt: 2,
      width: 8,
      height: 8,
    },
    ref: { ...ref, createdAt: 99 },
  };
  expect(() => collectPreparedProjectReplicaRefs(data.root)).toThrow('invalid');
  data.root.thumbnail.ref = ref;
  data.root.thumbnail.entry.assetId = 'unrelated';
  expect(() => parsePreparedVideoProjectReplicaRoot(data.root)).toThrow('invalid');
});

it('retains native private source reviews and refuses changed workspace or draft associations', async () => {
  const data = await setup();
  const ref = data.staged('review-source', new Uint8Array(6), 'video/webm');
  data.root.assets = [
    {
      entry: {
        id: 'private',
        assetId: ref.assetId,
        createdAt: 1,
        mimeType: ref.mimeType,
        size: ref.size,
      },
      filename: 'source.webm',
      publishToLibrary: false,
      ref,
      videoReview: {
        workspace: {
          ...workspace,
          aggregateId: 'project-asset:private',
          sourceAssetId: ref.assetId,
        },
        draft: {
          aggregateId: 'project-asset:private',
          revision: 3,
          annotation,
          before: null,
          updatedAt: 2,
        },
      },
    },
  ];
  const expected = structuredClone(data.root.assets[0]!.videoReview);
  expect(parsePreparedVideoProjectReplicaRoot(data.root).assets[0]!.videoReview).toEqual(expected);
  expect((await hydratePreparedVideoProjectReplicaRoot(data.root)).assets[0]!.videoReview).toEqual(
    expected
  );
  const review = data.root.assets[0]!.videoReview!;
  review.draft!.aggregateId = 'foreign';
  expect(() => parsePreparedVideoProjectReplicaRoot(data.root)).toThrow('invalid');
  review.draft!.aggregateId = 'project-asset:private';
  review.workspace.sourceAssetId = 'changed-source';
  expect(() => parsePreparedVideoProjectReplicaRoot(data.root)).toThrow('invalid');
});

it('refuses duplicate declared effect slots and omitted required bindings', async () => {
  const { root } = await setup();
  const snapshot = root.entry.project.effectSnapshots![0]!;
  const originalBytes = snapshot.retainedByteLength;
  snapshot.assets.push(snapshot.assets[0]!);
  snapshot.retainedByteLength += snapshot.assets[0]!.byteLength;
  expect(() => parsePreparedVideoProjectReplicaRoot(root)).toThrow('invalid');
  snapshot.assets.pop();
  snapshot.retainedByteLength = originalBytes;
  delete root.snapshotRefs;
  expect(() => parsePreparedVideoProjectReplicaRoot(root)).toThrow('invalid');
});

it('refuses prepared child rows that disagree with their immutable ref', async () => {
  const { root, staged } = await setup();
  const ref = staged('private-bytes', new Uint8Array(6), 'video/webm');
  root.assets = [
    {
      entry: {
        id: 'private',
        assetId: 'foreign-bytes',
        createdAt: 1,
        mimeType: ref.mimeType,
        size: ref.size,
      },
      filename: 'source.webm',
      ref,
    },
  ];
  expect(() => parsePreparedVideoProjectReplicaRoot(root)).toThrow('invalid');
});

it('keeps a deferred saved export out of physical staging claims and hydration reads', async () => {
  const f = await setup();
  const ref: AssetRef = {
    assetId: 'deferred-export',
    createdAt: 1,
    location: { kind: 'opfs', objectKey: 'objects/deferred-export' },
    size: 100,
    mimeType: 'video/webm',
    sha256: 'b'.repeat(64),
  };
  const entry = createProjectExportEntry({
    id: 'deferred-export',
    projectId: f.root.entry.id,
    assetId: ref.assetId,
    size: ref.size,
    mimeType: ref.mimeType,
  });
  f.root.exports = [
    { entry, ref, remote: { key: 'Files/project/export.webm', sha256: ref.sha256! } },
  ];
  expect(collectPreparedProjectReplicaRefs(f.root).map((item) => item.assetId)).not.toContain(
    ref.assetId
  );
  const hydrated = await hydratePreparedVideoProjectReplicaRoot(f.root);
  expect(hydrated.exports?.[0]?.ref).toEqual(ref);
  expect(io.read.mock.calls.some(([read]) => read.assetId === ref.assetId)).toBe(false);
});

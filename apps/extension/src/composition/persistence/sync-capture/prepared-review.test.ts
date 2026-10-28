import {
  EFFECT_BUNDLE_CORPUS,
  readEffectBundleCorpusArchive,
} from '../../../../../../tooling/test/support/effect-v1-corpus.test-support';
import { importEffectBundleZip } from '../../../features/video/project/effect-bundle/import/zip';
import { beforeEach, expect, it, vi } from 'vitest';
import { workspace as template } from '../review-workspaces/backup-restore.test-support';
import { materializeVideoWorkspaceProject } from '../review-workspaces/project-metadata';
import { updateQuickEditBackground } from '../../../features/video/review/advanced/background';
import { createProjectAssetEntry } from '../projects/index.test-support';
import type { AssetRef } from '../assets/contracts';
import {
  parsePreparedVideoReviewReplicaRoot,
  collectPreparedVideoReviewReplicaRefs,
  hydratePreparedVideoReviewReplicaRoot,
  type PreparedVideoReviewReplicaRoot,
} from './prepared-review';

const io = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('../assets/opfs-store', async (original) => ({
  ...(await original<typeof import('../assets/opfs-store')>()),
  readAssetFile: io.read,
}));
beforeEach(() => vi.clearAllMocks());
function reference(assetId: string, mimeType = 'image/png'): AssetRef {
  return {
    assetId,
    mimeType,
    size: 6,
    createdAt: 1,
    sha256: null,
    location: { kind: 'opfs', objectKey: `objects/${assetId}` },
  };
}
function root(): PreparedVideoReviewReplicaRoot {
  return {
    sourceMediaId: 'project-asset:original',
    assets: [],
    review: {
      draft: null,
      workspace: materializeVideoWorkspaceProject(
        {
          ...structuredClone(template),
          aggregateId: 'project-asset:original',
          sourceAssetId: 'original-bytes',
          history: [],
          cursor: 0,
        },
        'Review'
      ),
    },
  };
}
function withResource(value = root(), id = 'image') {
  const ref = reference(`bytes-${id}`);
  value.assets.push({
    entry: createProjectAssetEntry({
      id,
      assetId: ref.assetId,
      size: ref.size,
      mimeType: ref.mimeType,
    }),
    ref,
    filename: 'image.png',
  });
  value.review.workspace.advanced.background = updateQuickEditBackground(
    value.review.workspace.advanced.background,
    { enabled: true, type: 'image', assetId: `project-asset:${id}` }
  );
  return value;
}
it('preserves default and archived identities without a source row and detaches parser output', () => {
  const value = root();
  value.review.workspace.aggregateId = 'project-asset:quick-project:archive';
  value.review.workspace.sourceMediaId = value.sourceMediaId;
  const parsed = parsePreparedVideoReviewReplicaRoot(value);
  value.review.workspace.project!.name = 'Later';
  expect(parsed.review.workspace.project!.name).toBe('Review');
  expect(parsed.sourceMediaId).toBe('project-asset:original');
  expect(collectPreparedVideoReviewReplicaRefs(parsed)).toEqual([]);
});
it('rejects missing, extra, duplicate and inconsistent resource bindings', () => {
  const value = withResource();
  expect(() => parsePreparedVideoReviewReplicaRoot({ ...value, assets: [] })).toThrow();
  expect(() =>
    parsePreparedVideoReviewReplicaRoot({ ...value, assets: [...value.assets, value.assets[0]] })
  ).toThrow();
  expect(() => parsePreparedVideoReviewReplicaRoot({ ...root(), assets: value.assets })).toThrow();
  expect(() =>
    parsePreparedVideoReviewReplicaRoot({ ...value, sourceMediaId: 'foreign' })
  ).toThrow();
  expect(() =>
    parsePreparedVideoReviewReplicaRoot({
      ...value,
      assets: [{ ...value.assets[0], ref: { ...value.assets[0]!.ref, assetId: 'foreign-bytes' } }],
    })
  ).toThrow();
});
it('retains private nested review resources and terminates their cycle', () => {
  const value = withResource(root(), 'first');
  const first = value.assets[0]!;
  first.entry.mimeType = first.ref.mimeType = 'video/webm';
  const nested = withResource(root(), 'second');
  const second = nested.assets[0]!;
  second.entry.mimeType = second.ref.mimeType = 'video/webm';
  first.videoReview = {
    ...nested.review,
    workspace: {
      ...nested.review.workspace,
      aggregateId: 'project-asset:first',
      sourceAssetId: first.ref.assetId,
    },
  };
  const back = withResource(root(), 'first');
  second.videoReview = {
    ...back.review,
    workspace: {
      ...back.review.workspace,
      aggregateId: 'project-asset:second',
      sourceAssetId: second.ref.assetId,
    },
  };
  value.assets.push(second);
  expect(parsePreparedVideoReviewReplicaRoot(value).assets).toHaveLength(2);
  expect(() =>
    parsePreparedVideoReviewReplicaRoot({
      ...value,
      assets: [{ ...first, reusePublished: true }, second],
    })
  ).toThrow();
});
it('hydrates only the detached thumbnail and rejects mismatched bytes before publication', async () => {
  const value = root();
  value.thumbnail = {
    entry: {
      assetId: value.review.workspace.aggregateId,
      width: 60,
      height: 40,
      createdAt: 1,
      updatedAt: 1,
    },
    ref: reference('thumbnail'),
  };
  io.read.mockResolvedValue(new File(['123456'], 'thumbnail', { type: 'image/png' }));
  expect((await hydratePreparedVideoReviewReplicaRoot(value)).thumbnail?.blob.size).toBe(6);
  io.read.mockResolvedValue(new File(['changed'], 'thumbnail', { type: 'image/png' }));
  await expect(hydratePreparedVideoReviewReplicaRoot(value)).rejects.toThrow();
});
it('refuses foreign thumbnail association and undeclared binary slots', () => {
  const value = root();
  expect(() =>
    parsePreparedVideoReviewReplicaRoot({
      ...value,
      thumbnail: {
        entry: {
          assetId: 'foreign',
          width: 1,
          height: 1,
          createdAt: 1,
          updatedAt: 1,
        },
        ref: reference('thumbnail'),
      },
    })
  ).toThrow();
  expect(() => parsePreparedVideoReviewReplicaRoot({ ...value, extra: new Blob() })).toThrow();
});

it('verifies every retained annotation effect resource before native publication', async () => {
  const corpus = EFFECT_BUNDLE_CORPUS.find(
    (item) => item.accepted && item.artifact.includes('asset-bearing-conformance')
  );
  if (!corpus) throw new Error('Missing effect corpus');
  const imported = await importEffectBundleZip(readEffectBundleCorpusArchive(corpus));
  if (!imported.ok) throw new Error('Invalid effect corpus');
  const document = imported.bundle.documents.find((item) => item.document.kind === 'standalone');
  if (!document) throw new Error('Missing standalone effect');
  const value = root();
  const files = new Map<string, File>();
  value.assets = document.assets.map((asset, index) => {
    const id = `effect-resource-${index}`;
    const ref: AssetRef = {
      ...reference(`bytes-${id}`, asset.mimeType),
      size: asset.byteLength,
      sha256: asset.sha256,
    };
    files.set(
      ref.assetId,
      new File([Uint8Array.from(asset.bytes).buffer], id, { type: asset.mimeType })
    );
    return {
      entry: createProjectAssetEntry({
        id,
        assetId: ref.assetId,
        size: ref.size,
        mimeType: ref.mimeType,
      }),
      ref,
      filename: id,
    };
  });
  value.review.workspace.effectSnapshots = [
    {
      id: `effect:${document.sha256}`,
      schemaVersion: 'sniptale.effect.v1',
      kind: 'standalone',
      documentId: document.document.id,
      sha256: document.sha256,
      source: document.source,
      retainedByteLength:
        new TextEncoder().encode(document.source).byteLength +
        document.assets.reduce((size, asset) => size + asset.byteLength, 0),
      assets: document.assets.map((asset, index) => {
        if (asset.kind === 'audio') throw new Error('Annotation fixture must use visual resources');
        return {
          id: asset.id,
          kind: asset.kind,
          mimeType: asset.mimeType,
          byteLength: asset.byteLength,
          sha256: asset.sha256,
          assetId: `project-asset:${value.assets[index]!.entry.id}`,
        };
      }),
    },
  ];
  io.read.mockImplementation(async (ref: AssetRef) => {
    const file = files.get(ref.assetId);
    if (!file) throw new Error('Missing test file');
    return file;
  });
  expect(
    (await hydratePreparedVideoReviewReplicaRoot(value)).review.workspace.effectSnapshots
  ).toEqual(value.review.workspace.effectSnapshots);
  const first = value.assets[0]!;
  files.set(
    first.ref.assetId,
    new File([new Uint8Array(first.ref.size)], 'corrupted', { type: first.ref.mimeType })
  );
  await expect(hydratePreparedVideoReviewReplicaRoot(value)).rejects.toThrow();
});

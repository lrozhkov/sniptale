import { readValidAnimationSnapshot } from '../effect-bundles/fixture.test-support';
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

it('verifies self-contained annotation sources before native publication', async () => {
  const value = root(),
    snapshot = await readValidAnimationSnapshot();
  value.review.workspace.effectSnapshots = [snapshot];
  expect(
    (await hydratePreparedVideoReviewReplicaRoot(value)).review.workspace.effectSnapshots
  ).toEqual([snapshot]);
  snapshot.sha256 = '0'.repeat(64);
  await expect(hydratePreparedVideoReviewReplicaRoot(value)).rejects.toThrow();
});

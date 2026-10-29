import { expect, it } from 'vitest';
import { createReviewWorkspaceStoreFixture } from '../review-workspaces/store.test-support';
import { annotation, workspace } from '../review-workspaces/backup-restore.test-support';
import { withReviewWorkspaceUsage } from '../media-library/usage-index-keys';
import {
  createMediaLibraryEntry,
  createProjectExportEntry,
  createVideoProjectEntryWithMediaClip,
} from './index.test-support';
import {
  publishPreparedVideoProjectRevisionInTransaction,
  publishPreparedVideoProjectSidecarsInTransaction,
  type PreparedVideoProjectRevision,
  type VideoProjectRevisionPublicationStores,
} from './revision-publication';

type Fixture = ReturnType<typeof createReviewWorkspaceStoreFixture>;
type Transaction = ReturnType<Fixture['database']['transaction']>;

function publicationStores(tx: Transaction): VideoProjectRevisionPublicationStores {
  return {
    projects: tx.objectStore('video_projects'),
    assets: tx.objectStore('project_assets'),
    refs: tx.objectStore('asset_refs'),
    owners: tx.objectStore('asset_owners'),
    media: tx.objectStore('media_library'),
    videoWorkspaces: tx.objectStore('video_workspaces'),
    videoDrafts: tx.objectStore('video_workspace_drafts'),
    thumbnails: tx.objectStore('thumbnails'),
    presentations: tx.objectStore('aggregate_presentations'),
  };
}

function prepared(): PreparedVideoProjectRevision {
  const entry = createVideoProjectEntryWithMediaClip({ id: 'accepted-project' });
  entry.lifecycle = { savedAt: null, storageClass: 'temporary', updatedAt: 12 };
  const asset = {
    entry: {
      id: 'project-asset-1',
      assetId: 'prepared-body',
      createdAt: 1,
      mimeType: 'video/webm',
      size: 6,
    },
    filename: 'accepted.webm',
    ref: {
      assetId: 'prepared-body',
      createdAt: 1,
      location: { kind: 'opfs' as const, objectKey: 'objects/prepared-body' },
      mimeType: 'video/webm',
      sha256: null,
      size: 6,
    },
    videoReview: {
      workspace: {
        ...workspace,
        aggregateId: 'project-asset:project-asset-1',
        sourceAssetId: 'prepared-body',
      },
      draft: null,
    },
  };
  return {
    entry,
    assets: [asset],
    thumbnail: {
      assetId: `video-project:${entry.id}`,
      blob: new Blob(['thumbnail']),
      createdAt: 1,
      updatedAt: 1,
      width: 10,
      height: 10,
    },
    presentation: {
      aggregateId: entry.id,
      aggregateKind: 'video-project',
      presentationRevision: 400,
      thumbnailBlob: new Blob(['presentation']),
      updatedAt: 1,
    },
  };
}

it('publishes accepted project and prepared assets without changing independent exports', async () => {
  const fixture = createReviewWorkspaceStoreFixture(() => false);
  const root = prepared();
  const published = root.assets[0]!;
  const privateId = 'private-membership';
  root.assets.push({
    ...published,
    entry: { ...published.entry, id: privateId, originMediaId: 'independent-media' },
    publishToLibrary: false,
    videoReview: {
      workspace: { ...workspace, aggregateId: `project-asset:${privateId}` },
      draft: {
        aggregateId: `project-asset:${privateId}`,
        revision: 4,
        annotation,
        before: null,
        updatedAt: 3,
      },
    },
  });
  const reused = {
    ...published,
    entry: { ...published.entry, id: 'borrowed' },
    reusePublished: true,
  };
  root.assets.push(reused);
  fixture.rows.get('project_assets')!.set(reused.entry.id, reused.entry);
  const independentExport = createProjectExportEntry({ projectId: root.entry.id });
  const independentMedia = createMediaLibraryEntry({ id: 'independent-media' });
  fixture.rows.get('project_exports')!.set(independentExport.id, independentExport);
  fixture.rows.get('media_library')!.set(independentMedia.id, independentMedia);
  fixture.rows.get('video_workspace_drafts')!.set(published.videoReview!.workspace.aggregateId, {
    aggregateId: published.videoReview!.workspace.aggregateId,
    revision: 1,
  });
  const beforeExports = structuredClone(fixture.rows.get('project_exports'));
  const beforeMedia = structuredClone(fixture.rows.get('media_library'));
  const tx = fixture.database.transaction([...fixture.rows.keys()], 'readwrite');
  await publishPreparedVideoProjectRevisionInTransaction({
    root,
    stores: publicationStores(tx),
    workspaceRevision: 9,
  });
  await tx.done;
  expect(fixture.rows.get('video_projects')!.get(root.entry.id)).toMatchObject({
    ...root.entry,
    workspaceRevision: 9,
    lifecycle: { savedAt: 12, storageClass: 'library', updatedAt: 12 },
    usageReferenceKeys: expect.arrayContaining(['indexed:v2']),
  });
  expect(fixture.rows.get('asset_refs')!.get(published.ref.assetId)).toEqual(published.ref);
  expect(fixture.rows.get('project_assets')!.get(published.entry.id)).toEqual(published.entry);
  expect([...fixture.rows.get('asset_owners')!.values()]).toEqual([
    ...[published, root.assets[1]!].map((asset) => ({
      assetId: asset.ref.assetId,
      ownerId: asset.entry.id,
      ownerKind: 'project-asset',
      role: 'body',
    })),
  ]);
  expect(
    fixture.rows.get('video_workspaces')!.get(published.videoReview!.workspace.aggregateId)
  ).toEqual(withReviewWorkspaceUsage(published.videoReview!.workspace));
  expect(
    fixture.rows.get('video_workspace_drafts')!.has(published.videoReview!.workspace.aggregateId)
  ).toBe(false);
  expect(fixture.rows.get('video_workspace_drafts')!.get(`project-asset:${privateId}`)).toEqual(
    root.assets[1]!.videoReview!.draft
  );
  expect(fixture.rows.get('project_exports')).toEqual(beforeExports);
  for (const [id, row] of beforeMedia!)
    expect(fixture.rows.get('media_library')!.get(id)).toEqual(row);
  expect(fixture.rows.get('media_library')!.size).toBe(beforeMedia!.size + 1);
  expect(
    fixture.rows.get('media_library')!.get(`project-asset:${published.entry.id}`)
  ).toMatchObject({
    filename: published.filename,
    originalFilename: published.filename,
  });
  expect(fixture.rows.get('project_assets')!.get(reused.entry.id)).toEqual(reused.entry);
});

it('publishes sidecars after the caller phase with the assigned local revision', async () => {
  const fixture = createReviewWorkspaceStoreFixture(() => false);
  const root = prepared();
  const tx = fixture.database.transaction([...fixture.rows.keys()], 'readwrite');
  const stores = publicationStores(tx);
  const args = { root, stores, workspaceRevision: 9 };
  await publishPreparedVideoProjectRevisionInTransaction(args);
  expect(await tx.objectStore('video_projects').get(root.entry.id)).toMatchObject({
    workspaceRevision: 9,
  });
  expect(await tx.objectStore('thumbnails').get(root.thumbnail!.assetId)).toBeUndefined();
  expect(await tx.objectStore('aggregate_presentations').get(root.entry.id)).toBeUndefined();
  await tx.objectStore('sync_capture').put({ key: 'caller-phase', kind: 'apply-receipt' });
  await publishPreparedVideoProjectSidecarsInTransaction(args);
  expect(await tx.objectStore('sync_capture').get('caller-phase')).toEqual({
    key: 'caller-phase',
    kind: 'apply-receipt',
  });
  await tx.done;
  expect(fixture.rows.get('thumbnails')!.get(root.thumbnail!.assetId)).toEqual(root.thumbnail);
  expect(fixture.rows.get('aggregate_presentations')!.get(root.entry.id)).toEqual({
    ...root.presentation,
    presentationRevision: 9,
  });
  expect(root.presentation!.presentationRevision).toBe(400);
});

it('rolls project asset and sidecar publication back when the caller aborts', async () => {
  let failReceipt = true;
  const fixture = createReviewWorkspaceStoreFixture(
    (name) => failReceipt && name === 'sync_capture'
  );
  const root = prepared();
  const before = structuredClone(fixture.rows);
  const original = structuredClone(root);
  const apply = async () => {
    const tx = fixture.database.transaction([...fixture.rows.keys()], 'readwrite');
    const args = { root, stores: publicationStores(tx), workspaceRevision: 9 };
    try {
      await publishPreparedVideoProjectRevisionInTransaction(args);
      await publishPreparedVideoProjectSidecarsInTransaction(args);
      await tx.objectStore('sync_capture').put({ key: 'receipt', kind: 'apply-receipt' });
      await tx.done;
    } catch (error) {
      tx.abort();
      await expect(tx.done).rejects.toThrow('Aborted');
      throw error;
    }
  };
  await expect(apply()).rejects.toThrow('No space');
  expect(fixture.rows).toEqual(before);
  expect(root).toEqual(original);
  failReceipt = false;
  await apply();
  expect(fixture.rows.get('video_projects')!.get(root.entry.id)).toMatchObject({
    workspaceRevision: 9,
  });
  expect(fixture.rows.get('project_assets')!.get(root.assets[0]!.entry.id)).toEqual(
    root.assets[0]!.entry
  );
  expect(fixture.rows.get('thumbnails')!.get(root.thumbnail!.assetId)).toEqual(root.thumbnail);
  expect(fixture.rows.get('aggregate_presentations')!.get(root.entry.id)).toMatchObject({
    presentationRevision: 9,
  });
  expect(fixture.rows.get('sync_capture')!.size).toBe(1);
});

import { expect, it } from 'vitest';
import { createReviewWorkspaceStoreFixture } from '../review-workspaces/store.test-support';
import { createMediaLibraryEntry, createProjectExportEntry } from '../projects/index.test-support';
import {
  publishPreparedMediaSourceInTransaction,
  publishPreparedMediaProjectChildInTransaction,
  type PreparedMediaSourcePublication,
} from './source-publication';

type Transaction = ReturnType<
  ReturnType<typeof createReviewWorkspaceStoreFixture>['database']['transaction']
>;
function stores(tx: Transaction) {
  return {
    media: tx.objectStore('media_library'),
    refs: tx.objectStore('asset_refs'),
    owners: tx.objectStore('asset_owners'),
    projectAssets: tx.objectStore('project_assets'),
    projectExports: tx.objectStore('project_exports'),
  };
}
function prepared(): PreparedMediaSourcePublication {
  const ref = {
    assetId: 'body',
    createdAt: 1,
    location: { kind: 'opfs' as const, objectKey: 'objects/body' },
    mimeType: 'image/png',
    sha256: null,
    size: 6,
  };
  return {
    media: createMediaLibraryEntry({
      id: 'project-asset:source',
      size: ref.size,
      mimeType: ref.mimeType,
      source: { kind: 'project-asset', projectAssetId: 'source' },
    }),
    original: { ref },
    projectAsset: {
      id: 'source',
      assetId: ref.assetId,
      size: ref.size,
      mimeType: ref.mimeType,
      createdAt: 1,
    },
    projectExport: null,
  };
}
function transaction(fixture: ReturnType<typeof createReviewWorkspaceStoreFixture>) {
  return fixture.database.transaction(
    [
      'media_library',
      'asset_refs',
      'asset_owners',
      'project_assets',
      'project_exports',
      'thumbnails',
    ],
    'readwrite'
  );
}

it('publishes the project child after the caller thumbnail phase', async () => {
  const events: string[] = [];
  const fixture = createReviewWorkspaceStoreFixture((name) => {
    events.push(name ?? '');
    return false;
  });
  const tx = transaction(fixture);
  const source = prepared();
  await publishPreparedMediaSourceInTransaction(source, stores(tx));
  expect(await tx.objectStore('project_assets').get('source')).toBeUndefined();
  await tx.objectStore('thumbnails').put({ assetId: source.media.id });
  await publishPreparedMediaProjectChildInTransaction(source, stores(tx));
  await tx.done;
  expect(events).toEqual([
    'media_library',
    'thumbnails',
    'asset_refs',
    'asset_owners',
    'project_assets',
  ]);
  expect(fixture.rows.get('project_assets')!.get('source')).toEqual(source.projectAsset);
  expect(fixture.rows.get('project_exports')!.size).toBe(0);
});

it('publishes stored originals without requiring a project child', async () => {
  const fixture = createReviewWorkspaceStoreFixture(() => false);
  const tx = transaction(fixture);
  const source = prepared();
  source.media.source = { kind: 'stored-asset', assetId: source.original.ref.assetId };
  source.projectAsset = null;
  await publishPreparedMediaSourceInTransaction(source, stores(tx));
  await publishPreparedMediaProjectChildInTransaction(source, stores(tx));
  await tx.done;
  expect(fixture.rows.get('asset_refs')!.get('body')).toEqual(source.original.ref);
  expect([...fixture.rows.get('asset_owners')!.values()]).toEqual([
    { assetId: 'body', ownerId: source.media.id, ownerKind: 'media-library', role: 'source' },
  ]);
  expect(fixture.rows.get('project_assets')!.size).toBe(0);
});

it('publishes an independent export with its existing body owner', async () => {
  const fixture = createReviewWorkspaceStoreFixture(() => false);
  const tx = transaction(fixture);
  const source = prepared();
  const child = createProjectExportEntry({ id: 'export', assetId: 'body' });
  source.projectAsset = null;
  source.projectExport = child;
  source.media.source = { kind: 'project-export', projectId: child.projectId, exportId: child.id };
  await publishPreparedMediaSourceInTransaction(source, stores(tx));
  await publishPreparedMediaProjectChildInTransaction(source, stores(tx));
  await tx.done;
  expect(fixture.rows.get('project_exports')!.get(child.id)).toEqual(child);
  expect([...fixture.rows.get('asset_owners')!.values()]).toEqual([
    { assetId: child.assetId, ownerId: child.id, ownerKind: 'project-export', role: 'body' },
  ]);
});

it('rolls source and project child phases back when the caller aborts', async () => {
  const fixture = createReviewWorkspaceStoreFixture(() => false);
  const before = structuredClone(fixture.rows);
  const tx = transaction(fixture);
  await publishPreparedMediaSourceInTransaction(prepared(), stores(tx));
  await publishPreparedMediaProjectChildInTransaction(prepared(), stores(tx));
  tx.abort();
  await expect(tx.done).rejects.toThrow();
  expect(fixture.rows).toEqual(before);
});

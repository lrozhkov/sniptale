import { expect, it } from 'vitest';
import { createReviewWorkspaceStoreFixture } from '../review-workspaces/store.test-support';
import {
  createMediaLibraryEntry,
  createVideoProjectEntryWithMediaClip,
} from '../projects/index.test-support';
import { admitKnownLibraryPublication } from '../projects/known-library-source';
import { SupersededAssetPublicationError } from '../assets/publication';
import { readDeletionDependencyRows } from './deletion-index';

const stores = [
  'media_library',
  'project_assets',
  'project_exports',
  'recordings',
  'asset_refs',
  'asset_owners',
  'video_projects',
  'scenario_assets',
  'video_workspaces',
  'video_workspace_history',
];
function fixture() {
  const fixture = createReviewWorkspaceStoreFixture(() => false);
  for (const rows of fixture.rows.values()) rows.clear();
  return fixture;
}

it('protects a private acquisition before an editor session or placement exists', async () => {
  const f = fixture();
  f.rows.get('project_assets')!.set('private', {
    id: 'private',
    assetId: 'bytes',
    originMediaId: 'origin',
    createdAt: 1,
    mimeType: 'video/webm',
    size: 5,
  });
  const tx = f.database.transaction(stores, 'readonly');
  const matches = await readDeletionDependencyRows(tx, {
    id: 'origin',
    source: { kind: 'screenshot' },
  });
  expect(matches.target.privateProjectAssetIds).toEqual(new Set(['private']));
  expect(matches.projectAssets).toHaveLength(1);
  expect(matches.videos).toEqual([]);
});

it('refuses a delayed dependency write after source deletion without recreating a claim', async () => {
  const f = fixture();
  const ref = {
    assetId: 'bytes',
    mimeType: 'video/webm',
    size: 5,
    createdAt: 1,
    sha256: null,
    location: { kind: 'opfs' as const, objectKey: 'objects/bytes' },
  };
  const media = createMediaLibraryEntry({
    id: 'recording:origin',
    kind: 'recording',
    source: { kind: 'recording', recordingId: 'origin' },
    mimeType: ref.mimeType,
    size: ref.size,
  });
  f.rows.get('media_library')!.set(media.id, media);
  f.rows.get('recordings')!.set('origin', {
    id: 'origin',
    assetId: ref.assetId,
    createdAt: 1,
    filename: 'source.webm',
    mimeType: ref.mimeType,
    size: ref.size,
  });
  f.rows.get('asset_refs')!.set(ref.assetId, ref);
  const claim = {
    mediaId: media.id,
    source: { kind: 'recording' as const, recordingId: 'origin' },
  };
  const entry = {
    id: 'private',
    assetId: ref.assetId,
    originMediaId: media.id,
    createdAt: 1,
    mimeType: ref.mimeType,
    size: ref.size,
  };
  const before = f.database.transaction(stores, 'readonly');
  expect(
    await admitKnownLibraryPublication({
      claim,
      entry,
      ref,
      read: (store, key) => before.objectStore(store).get(key),
    })
  ).toBe('fresh');
  const deletion = f.database.transaction(stores, 'readwrite');
  await deletion.objectStore('media_library').delete(media.id);
  await deletion.done;
  const delayed = f.database.transaction(stores, 'readonly');
  await expect(
    admitKnownLibraryPublication({
      claim,
      entry,
      ref,
      read: (store, key) => delayed.objectStore(store).get(key),
    })
  ).rejects.toBeInstanceOf(SupersededAssetPublicationError);
  expect(f.rows.get('project_assets')!.size).toBe(0);
  expect((await readDeletionDependencyRows(delayed, media)).projectAssets).toEqual([]);
});

it('finds matching locators despite unrelated presentation errors and includes unknown envelopes', async () => {
  const f = fixture();
  const unrelated = createVideoProjectEntryWithMediaClip({ id: 'unrelated' });
  unrelated.project.assets[0]!.source = { kind: 'library-asset', mediaId: 'other' };
  f.rows.get('video_projects')!.set(unrelated.id, { ...unrelated, invalidPresentation: true });
  f.rows.get('video_projects')!.set('unknown', { id: 'unknown', project: { unknownSource: true } });
  const matches = await readDeletionDependencyRows(f.database.transaction(stores, 'readonly'), {
    id: 'target',
    source: { kind: 'screenshot' },
  });
  expect(matches.videos).toEqual([{ id: 'unknown', project: { unknownSource: true } }]);
});

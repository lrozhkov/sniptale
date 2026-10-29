import { createLibraryLifecycle } from '../library-lifecycle/contracts';
import { createReviewWorkspaceStoreFixture } from '../review-workspaces/store.test-support';
import {
  createVideoProjectEntryWithMediaClip,
  createMediaLibraryEntry,
} from '../projects/index.test-support';
import type { AssetRef } from '../assets';
import { captureRootKey, type SyncCaptureRootState } from './contracts';
import type { ApplyPreparedVideoProjectRevisionInput } from './apply-video-project';

export const spaceId = 'admitted-space';
export const sourceId = 'source-media';
export const projectId = 'admitted-project';
const digest = 'a'.repeat(64);

export function mediaState(generation = 7, basis = ['accepted-source']): SyncCaptureRootState {
  const rootKey = captureRootKey(spaceId, 'media', sourceId);
  return {
    version: 1,
    kind: 'root-state',
    key: JSON.stringify(['root-state', rootKey]),
    createdAt: 1,
    spaceId,
    rootKind: 'media',
    rootId: sourceId,
    rootKey,
    generation,
    basis,
  };
}

export function createVideoProjectReplicaFixture(
  setDatabase: (database: ReturnType<typeof createReviewWorkspaceStoreFixture>['database']) => void,
  trashed = false
) {
  let failReceipt = false;
  let captureWrites = 0;
  const fixture = createReviewWorkspaceStoreFixture((name) => {
    if (name !== 'sync_capture') return false;
    captureWrites++;
    return failReceipt && captureWrites === 2;
  });
  const table = (name: string) => fixture.rows.get(name)!;
  setDatabase(fixture.database);
  table('sync_capture').set('profile', {
    version: 1,
    kind: 'profile',
    key: 'profile',
    createdAt: 1,
    enabled: true,
    spaceId,
    connectionGeneration: 3,
  });
  const state = mediaState();
  table('sync_capture').set(state.key, state);
  const ref: AssetRef = {
    assetId: 'source-bytes',
    createdAt: 1,
    location: { kind: 'opfs', objectKey: 'objects/source-bytes' },
    mimeType: 'video/webm',
    sha256: 'b'.repeat(64),
    size: 1024,
  };
  const media = createMediaLibraryEntry({
    id: sourceId,
    source: { kind: 'stored-asset', assetId: ref.assetId },
    mimeType: ref.mimeType,
    size: ref.size,
    lifecycle: { ...createLibraryLifecycle('library', 1), ...(trashed ? { trashedAt: 2 } : {}) },
  });
  table('media_library').set(media.id, media);
  table('asset_refs').set(ref.assetId, ref);
  const entry = createVideoProjectEntryWithMediaClip({ id: projectId });
  if (trashed && media.lifecycle) entry.lifecycle = media.lifecycle;
  entry.project.assets[0]!.source = { kind: 'library-asset', mediaId: sourceId };
  const input: ApplyPreparedVideoProjectRevisionInput = {
    root: { entry, assets: [] },
    operationId: 'accepted-project-operation',
    sourceDigest: digest,
    connectionGeneration: 3,
    spaceId: spaceId,
    profileCreatedAt: 1,
    expectedBasis: [],
    expectedLocalGeneration: 0,
    expectedWorkspaceRevision: null,
    dependencies: [
      { entry: media, ref, expectedGeneration: 7, expectedBasis: ['accepted-source'] },
    ],
  };
  return {
    ...fixture,
    table,
    input,
    ref,
    media,
    failReceipt() {
      failReceipt = true;
      captureWrites = 0;
    },
    allowWrites() {
      failReceipt = false;
      captureWrites = 0;
    },
  };
}

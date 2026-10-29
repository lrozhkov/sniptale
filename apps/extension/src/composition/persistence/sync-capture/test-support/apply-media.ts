import { createReviewWorkspaceStoreFixture } from '../../review-workspaces/store.test-support';
import { createMediaLibraryEntry } from '../../projects/index.test-support';
import { captureRootKey } from '../contracts';
import type { ApplyPreparedMediaReplicaInput } from '../apply-media';

export type ProjectAssetInput = ApplyPreparedMediaReplicaInput & {
  rows: Extract<ApplyPreparedMediaReplicaInput['rows'], { projectAsset: unknown }>;
};

export function createMediaReplicaFixture() {
  let failReceipt = false;
  let writes = 0;
  const fixture = createReviewWorkspaceStoreFixture(
    (name) => name === 'sync_capture' && ++writes === 2 && failReceipt
  );
  fixture.rows.set('web_snapshots', new Map());
  const table = (name: string) => fixture.rows.get(name)!;
  table('sync_capture').set('profile', {
    version: 1,
    kind: 'profile',
    key: 'profile',
    createdAt: 1,
    enabled: true,
    spaceId: 'space',
    connectionGeneration: 3,
  });
  const ref = {
    assetId: 'local-body',
    createdAt: 1,
    location: { kind: 'opfs' as const, objectKey: 'objects/local-body' },
    mimeType: 'image/png',
    sha256: 'b'.repeat(64),
    size: 6,
  };
  const media = createMediaLibraryEntry({
    id: 'project-asset:source',
    source: { kind: 'project-asset', projectAssetId: 'source' },
    mimeType: ref.mimeType,
    size: ref.size,
    lifecycle: { savedAt: 1, storageClass: 'library', updatedAt: 1 },
  });
  const input: ProjectAssetInput = {
    operationId: 'source-op',
    sourceDigest: 'a'.repeat(64),
    connectionGeneration: 3,
    spaceId: 'space',
    profileCreatedAt: 1,
    expectedBasis: [],
    expectedLocalGeneration: 0,
    rows: {
      media,
      ref,
      projectAsset: {
        id: 'source',
        assetId: ref.assetId,
        mimeType: ref.mimeType,
        size: ref.size,
        createdAt: 1,
      },
    },
  };
  const rootKey = captureRootKey('space', 'media', media.id);
  return {
    ...fixture,
    table,
    input,
    rootKey,
    stateKey: JSON.stringify(['root-state', rootKey]),
    failReceipt() {
      failReceipt = true;
      writes = 0;
    },
    allowWrites() {
      failReceipt = false;
      writes = 0;
    },
  };
}

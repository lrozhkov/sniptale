import { createNativeCapture } from '../../composition/persistence/sync-capture/test-support/frozen-snapshot-database';

import {
  createMediaLibraryEntry,
  createVideoProjectEntryWithMediaClip,
} from '../../composition/persistence/projects/index.test-support';
import {
  captureRootKey,
  type CapturedChange,
  type CapturedMediaRows,
  type CapturedVideoProjectRows,
} from '../../composition/persistence/sync-capture/contracts';
import type { AssetRef } from '../../composition/persistence/assets';

import type { PortableReplicaAdmission } from './prepared-root';

export function ref(assetId = 'sender-bytes'): AssetRef {
  return {
    assetId,
    createdAt: 1,
    location: { kind: 'opfs', objectKey: `objects/${assetId}` },
    mimeType: 'video/webm',
    size: 1024,
    sha256: 'a'.repeat(64),
  };
}
export function mediaRows(): Extract<CapturedMediaRows, { projectAsset: unknown }> {
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
export function capture(change: CapturedChange['change']): CapturedChange {
  const rootKind =
    change.kind === 'video-review'
      ? 'video-review'
      : change.kind === 'media'
        ? 'media'
        : 'video-project';
  const rootId =
    change.kind === 'media'
      ? change.rows.media.id
      : change.kind === 'video-review'
        ? change.rows.review.workspace.aggregateId
        : change.kind === 'video-project'
          ? change.rows.project.id
          : 'deleted';
  const rootKey = captureRootKey('space', rootKind, rootId);
  return createNativeCapture({
    version: 1,
    kind: 'sync-operation',
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
  });
}
export function admission(): PortableReplicaAdmission {
  return {
    operationId: 'remote-operation',
    sourceDigest: 'b'.repeat(64),
    connectionGeneration: 3,
    spaceId: 'space',
    profileCreatedAt: 1,
    expectedBasis: [],
    expectedLocalGeneration: 0,
    expectedWorkspaceRevision: null,
    dependencies: [],
  };
}
export function projectRows(borrowed = false): CapturedVideoProjectRows {
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

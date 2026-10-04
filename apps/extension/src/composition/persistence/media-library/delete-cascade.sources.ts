import { collectReviewAssetReferences } from '../review-workspaces/asset-refs';
import { parseImageWorkspaceEntry } from '../image-workspaces/parser';
import { removeEditorDocumentOwnership } from '../document-assets';
import { createAggregatePresentationKey } from '../aggregate-presentations';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { AssetReadyJournal } from '../assets';
import { recoverRecordingAssetPublications } from '../recordings/asset-publication';
import type { MediaDependencyTarget } from './dependencies';
import {
  scenarioChildIsUnrelated,
  videoEntryIsUnrelated,
  reviewWorkspaceUsesMedia,
} from './dependencies';
import { parseVideoWorkspace } from '../review-workspaces/parser';
import { createProjectAssetMediaId } from '../../../features/media-hub/media-id';
import type { PhysicalDeleteAssetOperation } from '../assets';
import { MediaAssetDeletionBlockedError } from './deletion-errors';
import {
  IMAGE_WORKSPACES_STORE,
  AGGREGATE_PRESENTATIONS_STORE,
  THUMBNAILS_STORE,
  VIDEO_WORKSPACE_DRAFTS_STORE,
  ASSET_OWNERS_STORE,
  ASSET_REFS_STORE,
  STORE_NAME,
  RECORDING_TELEMETRY_STORE,
  PROJECT_ASSETS_STORE,
  PROJECT_EXPORTS_STORE,
  WEB_SNAPSHOTS_STORE,
  MEDIA_LIBRARY_STORE,
  SCENARIO_ASSETS_STORE,
  VIDEO_PROJECTS_STORE,
  VIDEO_WORKSPACES_STORE,
} from '../infrastructure/indexed-db/core';
import { parseRecordingEntry } from '../recordings/index.guards';
import { parseProjectAssetEntry, parseProjectExportEntry } from '../projects/read-guards';
import { parseStoredWebSnapshotRecord } from '../web-snapshots/guards';
import {
  recoverProjectMediaPublications,
  PROJECT_EXPORT_OWNER_KIND,
  PROJECT_MEDIA_ASSET_ROLE,
} from '../projects/asset-publication';
import {
  recoverWebSnapshotPublications,
  WEB_SNAPSHOT_OWNER_KIND,
  WEB_SNAPSHOT_PACKAGE_ROLE,
  WEB_SNAPSHOT_SCREENSHOT_ROLE,
} from '../web-snapshots/publication';

type CascadeTransaction = ReturnType<
  Awaited<ReturnType<typeof import('../infrastructure/indexed-db/core').initDB>>['transaction']
>;
type PhysicalDelete = PhysicalDeleteAssetOperation;

/** Drain the source owner's ready publications before its root is removed. */
export async function recoverMediaSourcePublications(media: MediaDependencyTarget): Promise<void> {
  if (media.source.kind === 'project-export' || media.source.kind === 'project-asset')
    await recoverProjectMediaPublications();
  if (media.source.kind === 'recording') await recoverRecordingAssetPublications();
  if (media.source.kind === 'web-snapshot') await recoverWebSnapshotPublications();
}

function unhandledSource(_source: never): never {
  throw new MediaAssetDeletionBlockedError('unsupported-source');
}

async function releaseAssetOwner(args: {
  assetId: string;
  ownerId: string;
  ownerKind: string;
  role: string;
  tx: CascadeTransaction;
  physicalDelete: PhysicalDelete;
}): Promise<void> {
  const owners = args.tx.objectStore(ASSET_OWNERS_STORE);
  await owners.delete!([args.ownerKind, args.ownerId, args.role]);
  if ((await owners.index('assetId').count(args.assetId)) === 0) {
    await args.tx.objectStore(ASSET_REFS_STORE).delete!(args.assetId);
    args.physicalDelete.assetIds.push(args.assetId);
  }
}

/** Release only source-specific records and byte owners in the caller transaction. */
export async function releaseMediaSource(
  tx: CascadeTransaction,
  media: MediaDependencyTarget,
  physicalDelete: PhysicalDelete
): Promise<void> {
  switch (media.source.kind) {
    case 'screenshot':
      return;
    case 'recording':
      await releaseBodyRecord({
        tx,
        physicalDelete,
        id: media.source.recordingId,
        store: STORE_NAME,
        ownerKind: 'recording',
        parse: parseRecordingEntry,
      });
      await tx.objectStore(RECORDING_TELEMETRY_STORE).delete!(media.source.recordingId);
      return;
    case 'project-asset':
      return releaseBodyRecord({
        tx,
        physicalDelete,
        id: media.source.projectAssetId,
        store: PROJECT_ASSETS_STORE,
        ownerKind: 'project-asset',
        parse: parseProjectAssetEntry,
      });
    case 'stored-asset': {
      await releaseAssetOwner({
        assetId: media.source.assetId,
        ownerId: media.id,
        ownerKind: 'media-library',
        role: 'source',
        tx,
        physicalDelete,
      });
      return;
    }
    case 'project-export': {
      const source = media.source;
      return releaseBodyRecord({
        tx,
        physicalDelete,
        id: source.exportId,
        store: PROJECT_EXPORTS_STORE,
        ownerKind: PROJECT_EXPORT_OWNER_KIND,
        parse: (raw) => {
          const entry = parseProjectExportEntry(raw);
          return entry?.projectId === source.projectId ? entry : null;
        },
      });
    }
    case 'web-snapshot':
      return releaseWebSnapshotSource(tx, media.source.snapshotId, physicalDelete);
    default:
      return unhandledSource(media.source);
  }
}

export async function deleteMediaSidecars(
  tx: CascadeTransaction,
  mediaId: string,
  physicalDelete: PhysicalDelete
): Promise<Set<string>> {
  const review = parseVideoWorkspace(await tx.objectStore(VIDEO_WORKSPACES_STORE).get(mediaId));
  const privateCandidates = new Set(
    [...(review ? collectReviewAssetReferences(review) : [])].map((id) =>
      id.slice('project-asset:'.length)
    )
  );
  const imageWorkspace = parseImageWorkspaceEntry(
    await tx.objectStore(IMAGE_WORKSPACES_STORE).get(mediaId)
  );
  if (imageWorkspace) {
    await removeEditorDocumentOwnership({
      document: imageWorkspace.document,
      ownerId: mediaId,
      ownerKind: 'image-workspace',
      physicalDelete,
      stores: {
        owners: tx.objectStore(ASSET_OWNERS_STORE),
        refs: tx.objectStore(ASSET_REFS_STORE),
      },
    });
  }
  await tx.objectStore(IMAGE_WORKSPACES_STORE).delete!(mediaId);
  await tx.objectStore(AGGREGATE_PRESENTATIONS_STORE).delete!(
    createAggregatePresentationKey({ id: mediaId, kind: 'image' })
  );
  await tx.objectStore(THUMBNAILS_STORE).delete!(mediaId);
  await tx.objectStore(MEDIA_LIBRARY_STORE).delete!(mediaId);
  await tx.objectStore(VIDEO_WORKSPACES_STORE).delete!(mediaId);
  await tx.objectStore(VIDEO_WORKSPACE_DRAFTS_STORE).delete!(mediaId);
  return privateCandidates;
}

/** Release detached private representations after every aggregate mutation has committed to this transaction. */
export async function releaseUnpublishedProjectAssets(
  tx: CascadeTransaction,
  candidates: ReadonlySet<string>,
  physicalDelete: PhysicalDelete
): Promise<string[]> {
  if (candidates.size === 0) return [];
  const [videos, children, reviews] = await Promise.all([
    tx.objectStore(VIDEO_PROJECTS_STORE).getAll(),
    tx.objectStore(SCENARIO_ASSETS_STORE).getAll(),
    tx.objectStore(VIDEO_WORKSPACES_STORE).getAll(),
  ]);
  const deletedIds: string[] = [];
  const pending = [...candidates];
  const visited = new Set<string>();
  const removedWorkspaces = new Set<string>();
  const deferred = new Set<string>();
  for (const projectAssetId of pending) {
    if (visited.has(projectAssetId)) continue;
    const id = createProjectAssetMediaId(projectAssetId);
    const asset = parseProjectAssetEntry(
      await tx.objectStore(PROJECT_ASSETS_STORE).get(projectAssetId)
    );
    if (
      (await tx.objectStore(MEDIA_LIBRARY_STORE).get(id)) !== undefined ||
      !asset ||
      asset.id !== projectAssetId
    ) {
      visited.add(projectAssetId);
      continue;
    }
    const target: MediaDependencyTarget = { id, source: { kind: 'project-asset', projectAssetId } };
    if (
      children.some((child) => !scenarioChildIsUnrelated(child, target)) ||
      videos.some((video) => !videoEntryIsUnrelated(video, target, new Set())) ||
      reviews.some((raw) => {
        if (
          isRecord(raw) &&
          typeof raw['aggregateId'] === 'string' &&
          removedWorkspaces.has(raw['aggregateId'])
        )
          return false;
        const workspace = parseVideoWorkspace(raw);
        return !workspace || reviewWorkspaceUsesMedia(workspace, target);
      })
    ) {
      deferred.add(projectAssetId);
      continue;
    }
    visited.add(projectAssetId);
    const auxiliaries = await deleteMediaSidecars(tx, id, physicalDelete);
    removedWorkspaces.add(id);
    pending.push(...auxiliaries, ...deferred);
    deferred.clear();
    await releaseMediaSource(tx, target, physicalDelete);
    deletedIds.push(projectAssetId);
  }
  return deletedIds;
}

/** A selected root cannot be purged while a ready publication can recreate its source or sidecar. */
export function mediaHasPendingPublication(
  journal: Pick<AssetReadyJournal, 'domain' | 'payload'>,
  target: Pick<MediaDependencyTarget, 'id'> & Partial<Pick<MediaDependencyTarget, 'source'>>
): boolean {
  const payload = journal.payload;
  if (!isRecord(payload)) return false;
  if (journal.domain === 'image-workspace') return payload['aggregateId'] === target.id;
  if (
    journal.domain === 'project-assets' &&
    isRecord(payload['entry']) &&
    payload['entry']['originMediaId'] === target.id
  )
    return true;
  const source = target.source;
  if (!source) return false;
  if (
    (source.kind === 'project-asset' && journal.domain === 'project-assets') ||
    (source.kind === 'project-export' && journal.domain === 'project-exports')
  ) {
    const entry = payload['entry'];
    return (
      !isRecord(entry) ||
      typeof entry['id'] !== 'string' ||
      entry['id'] === (source.kind === 'project-asset' ? source.projectAssetId : source.exportId)
    );
  }
  if (source.kind === 'recording' && journal.domain === 'recording-assets') {
    const entries = payload['entries'];
    return (
      !Array.isArray(entries) ||
      entries.some(
        (entry) =>
          !isRecord(entry) || typeof entry['id'] !== 'string' || entry['id'] === source.recordingId
      )
    );
  }
  if (source.kind === 'web-snapshot' && journal.domain === 'web-snapshot-assets') {
    const snapshot = payload['snapshot'];
    const media = payload['mediaEntry'];
    return (
      !isRecord(snapshot) ||
      typeof snapshot['id'] !== 'string' ||
      snapshot['id'] === source.snapshotId ||
      (isRecord(media) && media['id'] === target.id)
    );
  }
  return false;
}

async function releaseWebSnapshotSource(
  tx: CascadeTransaction,
  snapshotId: string,
  physicalDelete: PhysicalDelete
): Promise<void> {
  const entry = parseStoredWebSnapshotRecord(
    await tx.objectStore(WEB_SNAPSHOTS_STORE).get(snapshotId)
  );
  if (!entry || entry.id !== snapshotId)
    throw new MediaAssetDeletionBlockedError('source-unavailable');
  for (const [assetId, role] of [
    [entry.packageAssetId, WEB_SNAPSHOT_PACKAGE_ROLE],
    [entry.screenshotAssetId, WEB_SNAPSHOT_SCREENSHOT_ROLE],
  ] as const) {
    await releaseAssetOwner({
      assetId,
      ownerId: entry.id,
      ownerKind: WEB_SNAPSHOT_OWNER_KIND,
      role,
      tx,
      physicalDelete,
    });
  }
  await tx.objectStore(WEB_SNAPSHOTS_STORE).delete!(entry.id);
}

async function releaseBodyRecord(args: {
  tx: CascadeTransaction;
  physicalDelete: PhysicalDelete;
  id: string;
  store: typeof STORE_NAME | typeof PROJECT_ASSETS_STORE | typeof PROJECT_EXPORTS_STORE;
  ownerKind: string;
  parse(raw: unknown): { id: string; assetId: string } | null;
}): Promise<void> {
  const store = args.tx.objectStore(args.store);
  const entry = args.parse(await store.get(args.id));
  if (!entry || entry.id !== args.id)
    throw new MediaAssetDeletionBlockedError('source-unavailable');
  await store.delete!(entry.id);
  await releaseAssetOwner({
    assetId: entry.assetId,
    ownerId: entry.id,
    ownerKind: args.ownerKind,
    role: PROJECT_MEDIA_ASSET_ROLE,
    tx: args.tx,
    physicalDelete: args.physicalDelete,
  });
}

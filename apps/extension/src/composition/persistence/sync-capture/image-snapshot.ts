import { imageWorkspaceAssetBindings } from '../image-workspaces/assets';
import type { IDBPTransaction } from 'idb';
import { sha256 } from '@noble/hashes/sha2.js';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { readAssetResidencyCopyInTransaction } from '../assets/residency';
import {
  assetResidencyCopyId,
  type AssetResidencyCopy,
  type AssetResidencyTarget,
} from '../assets/residency-records';
import type { SyncCaptureRootState } from './contracts';
import { parseAssetRef, parseAssetOwner } from '../assets/guards';
import type { MediaLibraryEntry } from '../media-library/contracts';
import { parseProjectAssetEntry } from '../projects/read-guards';
import { parseMediaLibraryEntry, withoutLocalOriginalClaim } from '../media-library/read-guards';
import { parseImageWorkspaceEntry } from '../image-workspaces/parser';
import { parseAggregatePresentationEntry } from '../aggregate-presentations/parser';
import {
  ASSET_REFS_STORE,
  ASSET_OWNERS_STORE,
  SYNC_CAPTURE_STORE,
  MEDIA_LIBRARY_STORE,
  PROJECT_ASSETS_STORE,
  IMAGE_WORKSPACES_STORE,
  AGGREGATE_PRESENTATIONS_STORE,
} from '../infrastructure/indexed-db/core.stores';
import { MAX_CAPTURE_METADATA_BYTES, MAX_CAPTURE_ROWS, type CapturedImageRows } from './contracts';

/** A linked document owns its revision. Its original remains a separate media root. */
export function imageCaptureIdentity(rows: Pick<CapturedImageRows, 'workspace' | 'media'>) {
  if (rows.workspace?.sourceMediaId !== undefined)
    return {
      rootKind: 'image-project' as const,
      rootId: rows.workspace.aggregateId,
      revision: rows.workspace.revision,
    };
  return {
    rootKind: 'media' as const,
    rootId: rows.media.id,
    revision: rows.media.workspaceRevision ?? 0,
  };
}

/** Blob descriptors identify immutable slots; they do not attest binary content. */
export function describeImageMetadata(value: unknown): unknown {
  if (value instanceof Blob) return { binarySlot: 'blob', size: value.size, mimeType: value.type };
  if (Array.isArray(value)) return value.map(describeImageMetadata);
  if (isRecord(value))
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, describeImageMetadata(value[key])])
    );
  return value;
}

/** Bound native metadata without reading binary bytes or serializing class instances. */
export function isBoundedImageMetadata(value: unknown, allowBlobs = true): boolean {
  return isBoundedCaptureMetadata(value, { allowBlobs, allowNullPrototype: false });
}

/** Bound capture metadata with the source family's binary and object-prototype policy. */
export function isBoundedCaptureMetadata(
  value: unknown,
  policy: { allowBlobs: boolean; allowNullPrototype: boolean }
): boolean {
  const active = new WeakSet<object>();
  let nodes = 0;
  let characters = 0;
  function visit(item: unknown, depth: number): boolean {
    if (++nodes > 100_000 || depth > 64) return false;
    if (item instanceof Blob) return policy.allowBlobs && Number.isSafeInteger(item.size);
    if (typeof item === 'string') {
      characters += item.length;
      return characters <= MAX_CAPTURE_METADATA_BYTES;
    }
    if (item === undefined || item === null || typeof item === 'boolean') return true;
    if (typeof item === 'number') return Number.isFinite(item);
    if (typeof item !== 'object' || active.has(item)) return false;
    if (
      !Array.isArray(item) &&
      Object.getPrototypeOf(item) !== Object.prototype &&
      !(policy.allowNullPrototype && Object.getPrototypeOf(item) === null)
    )
      return false;
    active.add(item);
    const valid = Object.entries(item).every(([key, child]) => {
      characters += key.length;
      return characters <= MAX_CAPTURE_METADATA_BYTES && visit(child, depth + 1);
    });
    active.delete(item);
    return valid;
  }
  return (
    visit(value, 0) &&
    new TextEncoder().encode(
      JSON.stringify(policy.allowNullPrototype ? value : describeImageMetadata(value))
    ).byteLength <= MAX_CAPTURE_METADATA_BYTES
  );
}

/** Source families whose native Image workspace belongs to this media identity. */
export function isImageCaptureSource(media: MediaLibraryEntry): boolean {
  return (
    (media.kind === 'image' || media.kind === 'screenshot') &&
    media.mimeType.startsWith('image/') &&
    (media.source.kind === 'screenshot' ||
      media.source.kind === 'stored-asset' ||
      media.source.kind === 'project-asset')
  );
}

/** Admit one image aggregate and its exact persisted document asset closure. */
function parseImageRows(
  value: unknown,
  unloaded?: Extract<AssetResidencyTarget, { kind: 'inline-image' }>
): CapturedImageRows | null {
  if (!isRecord(value) || !isBoundedImageMetadata(value)) return null;
  if (
    Object.keys(value).some(
      (key) =>
        ![
          'media',
          'workspace',
          'presentation',
          'refs',
          'originalRef',
          'projectAsset',
          'savedIndependently',
        ].includes(key)
    )
  )
    return null;
  const entry = parseMediaLibraryEntry(value['media']);
  if (!entry) return null;
  const media = withoutLocalOriginalClaim(entry);
  const savedIndependently = value['savedIndependently'];
  if (
    savedIndependently !== undefined &&
    (typeof savedIndependently !== 'boolean' || media.lifecycle?.storageClass !== 'library')
  )
    return null;
  const originalRef =
    value['originalRef'] === undefined ? undefined : parseAssetRef(value['originalRef']);
  const projectAsset =
    value['projectAsset'] === undefined ? undefined : parseProjectAssetEntry(value['projectAsset']);
  const workspace =
    value['workspace'] === null ? null : parseImageWorkspaceEntry(value['workspace']);
  const presentation =
    value['presentation'] === null ? null : parseAggregatePresentationEntry(value['presentation']);
  const rawRefs = value['refs'];
  if (
    !isImageCaptureSource(media) ||
    (value['projectAsset'] !== undefined && !projectAsset) ||
    (media.source.kind === 'project-asset' ? !projectAsset : projectAsset !== undefined) ||
    (media.source.kind === 'project-asset' &&
      (media.blob !== undefined ||
        !originalRef ||
        !projectAsset ||
        projectAsset.originMediaId !== undefined ||
        media.id !== `project-asset:${projectAsset.id}` ||
        media.source.projectAssetId !== projectAsset.id ||
        projectAsset.assetId !== originalRef.assetId ||
        projectAsset.size !== originalRef.size ||
        media.size !== originalRef.size ||
        projectAsset.mimeType !== originalRef.mimeType ||
        media.mimeType !== originalRef.mimeType)) ||
    (media.source.kind === 'screenshot' &&
      (unloaded
        ? media.blob !== undefined ||
          originalRef !== undefined ||
          media.id !== unloaded.mediaId ||
          media.createdAt !== unloaded.createdAt ||
          media.workspaceRevision !== unloaded.workspaceRevision ||
          media.size !== unloaded.size ||
          media.mimeType !== unloaded.mimeType
        : !(media.blob instanceof Blob) ||
          media.blob.size !== media.size ||
          (media.blob.type && media.blob.type !== media.mimeType) ||
          originalRef !== undefined)) ||
    (media.source.kind === 'stored-asset' &&
      (media.blob !== undefined ||
        !originalRef ||
        originalRef.assetId !== media.source.assetId ||
        originalRef.size !== media.size ||
        originalRef.mimeType !== media.mimeType)) ||
    !Number.isSafeInteger(media.workspaceRevision) ||
    media.recordingMetadata ||
    media.recordingGroup ||
    (value['workspace'] !== null && !workspace) ||
    (value['presentation'] !== null && !presentation) ||
    !Array.isArray(rawRefs) ||
    rawRefs.length > MAX_CAPTURE_ROWS
  )
    return null;
  const refs = rawRefs.map(parseAssetRef);
  if (refs.some((ref) => ref === null)) return null;
  const admittedRefs = refs.filter((ref) => ref !== null);
  const ids = new Set(admittedRefs.map((ref) => ref.assetId));
  const required = new Set(
    workspace ? imageWorkspaceAssetBindings(workspace).map((asset) => asset.assetId) : []
  );
  if (
    ids.size !== admittedRefs.length ||
    ids.size !== required.size ||
    [...required].some((id) => !ids.has(id))
  )
    return null;
  const identity = imageCaptureIdentity({ workspace, media });
  if (
    workspace &&
    (!Number.isSafeInteger(workspace.revision) ||
      (workspace.sourceMediaId === undefined
        ? workspace.aggregateId !== media.id || workspace.revision !== media.workspaceRevision
        : workspace.sourceMediaId !== media.id ||
          workspace.aggregateId === media.id ||
          media.lifecycle?.storageClass !== 'library' ||
          savedIndependently !== undefined))
  )
    return null;
  if (
    presentation &&
    (presentation.aggregateId !== identity.rootId ||
      presentation.aggregateKind !== 'image' ||
      !Number.isSafeInteger(presentation.presentationRevision) ||
      presentation.presentationRevision > identity.revision)
  )
    return null;
  let portableWorkspace = workspace;
  if (workspace) {
    const { publicationId: _publicationId, ...entry } = workspace;
    portableWorkspace = entry;
  }
  return {
    media,
    ...(savedIndependently === undefined ? {} : { savedIndependently }),
    workspace: portableWorkspace,
    presentation,
    refs: admittedRefs,
    ...(originalRef ? { originalRef } : {}),
    ...(projectAsset ? { projectAsset } : {}),
  };
}

/** Capture admission always requires the actual inline original bytes. */
export function parseCapturedImageRows(value: unknown): CapturedImageRows | null {
  return parseImageRows(value);
}

/** Read the accepted after-image exclusively through the writer's live transaction. */
async function readImageRowsInTransaction(
  tx: IDBPTransaction<unknown, string[], 'readonly' | 'readwrite'>,
  mediaId: string
) {
  const rawWorkspace: unknown = await tx.objectStore(IMAGE_WORKSPACES_STORE).get(mediaId);
  const workspace = parseImageWorkspaceEntry(rawWorkspace);
  const sourceId = workspace?.sourceMediaId ?? mediaId;
  const mediaStore = tx.objectStore(MEDIA_LIBRARY_STORE);
  const media = parseMediaLibraryEntry(await mediaStore.get(sourceId));
  if (sourceId !== mediaId && (await mediaStore.get(mediaId)) !== undefined)
    throw new Error('Image project ID is already used by a media original.');
  let originalRef: unknown;
  let projectAsset: unknown;
  if (media?.source.kind === 'project-asset') {
    const child = parseProjectAssetEntry(
      await tx.objectStore(PROJECT_ASSETS_STORE).get(media.source.projectAssetId)
    );
    if (!child || child.id !== media.source.projectAssetId)
      throw new Error('Invalid project image source.');
    const owner = parseAssetOwner(
      await tx.objectStore(ASSET_OWNERS_STORE).get(['project-asset', child.id, 'body'])
    );
    if (
      !owner ||
      owner.ownerKind !== 'project-asset' ||
      owner.ownerId !== child.id ||
      owner.role !== 'body' ||
      owner.assetId !== child.assetId
    )
      throw new Error('Invalid project image source ownership.');
    projectAsset = child;
    originalRef = await tx.objectStore(ASSET_REFS_STORE).get(child.assetId);
  }
  if (media?.source.kind === 'stored-asset') {
    originalRef = await tx.objectStore(ASSET_REFS_STORE).get(media.source.assetId);
    const owner = parseAssetOwner(
      await tx.objectStore(ASSET_OWNERS_STORE).get(['media-library', sourceId, 'source'])
    );
    if (
      !owner ||
      owner.ownerKind !== 'media-library' ||
      owner.ownerId !== sourceId ||
      owner.role !== 'source' ||
      owner.assetId !== media.source.assetId
    )
      throw new Error('Invalid stored image source ownership.');
  }
  const document = await readImageDocumentRows(tx, mediaId, rawWorkspace);
  return {
    media,
    ...document,
    ...(originalRef === undefined ? {} : { originalRef }),
    ...(projectAsset === undefined ? {} : { projectAsset }),
  };
}

type ImageSnapshotTransaction = IDBPTransaction<unknown, string[], 'readonly' | 'readwrite'>;
async function readImageDocumentRows(
  tx: ImageSnapshotTransaction,
  id: string,
  rawWorkspace: unknown
) {
  const workspace = parseImageWorkspaceEntry(rawWorkspace);
  const presentation: unknown = await tx
    .objectStore(AGGREGATE_PRESENTATIONS_STORE)
    .get(['image', id]);
  const refs: unknown[] = [];
  for (const id of new Set(
    workspace ? imageWorkspaceAssetBindings(workspace).map((asset) => asset.assetId) : []
  ))
    refs.push(await tx.objectStore(ASSET_REFS_STORE).get(id));
  return {
    workspace: rawWorkspace ?? null,
    presentation: presentation ?? null,
    refs,
  };
}

type CapturedImageProject = Pick<CapturedImageRows, 'presentation' | 'refs'> & {
  workspace: NonNullable<CapturedImageRows['workspace']>;
};

/** Read the project document without requiring its separately managed original to be resident. */
export async function readImageProjectSnapshot(
  tx: ImageSnapshotTransaction,
  id: string
): Promise<CapturedImageProject> {
  const raw: unknown = await tx.objectStore(IMAGE_WORKSPACES_STORE).get(id);
  const workspace = parseImageWorkspaceEntry(raw);
  if (!workspace?.sourceMediaId || workspace.aggregateId !== id || workspace.sourceMediaId === id)
    throw new Error('Invalid linked image project snapshot.');
  const document = await readImageDocumentRows(tx, id, raw);
  const presentation = parseAggregatePresentationEntry(document.presentation);
  const refs = document.refs.map(parseAssetRef);
  if (
    !isBoundedImageMetadata(document) ||
    refs.some((ref) => ref === null) ||
    (document.presentation !== null &&
      (!presentation ||
        presentation.aggregateKind !== 'image' ||
        presentation.aggregateId !== id ||
        presentation.presentationRevision > workspace.revision))
  )
    throw new Error('Invalid linked image project snapshot.');
  const { publicationId: _publicationId, ...portableWorkspace } = workspace;
  return { workspace: portableWorkspace, presentation, refs: refs.filter((ref) => ref !== null) };
}

function digestImageMetadata(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(describeImageMetadata(value)));
  return Array.from(sha256(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function digestImageProjectSnapshot(rows: CapturedImageProject): string {
  return digestImageMetadata({
    workspace: rows.workspace,
    presentation: rows.presentation,
    refs: rows.refs,
  });
}

/** Read a complete publishable after-image without admitting missing inline bytes. */
export async function freezeImageInTransaction(
  tx: IDBPTransaction<unknown, string[], 'readonly' | 'readwrite'>,
  mediaId: string
): Promise<CapturedImageRows> {
  const raw = await readImageRowsInTransaction(tx, mediaId);
  const rows = parseCapturedImageRows({
    ...raw,
    ...(raw.media?.savedIndependently === undefined ||
    parseImageWorkspaceEntry(raw.workspace)?.sourceMediaId !== undefined
      ? {}
      : { savedIndependently: raw.media.savedIndependently }),
  });
  if (!rows || imageCaptureIdentity(rows).rootId !== mediaId)
    throw new Error('Unsupported screenshot aggregate snapshot.');
  return structuredClone(rows);
}

/** Synchronous metadata digest keeps the native IDB transaction live. */
export function digestCapturedImageRows(rows: CapturedImageRows): string {
  const accepted = parseCapturedImageRows(rows);
  if (!accepted) throw new Error('Invalid image snapshot.');
  // Visibility follows the causal operation. Keep original-only evidence compatible with old heads.
  const { savedIndependently: _claim, ...original } = accepted;
  return accepted.workspace?.sourceMediaId === undefined
    ? digestImageMetadata(original)
    : digestImageProjectSnapshot({ ...accepted, workspace: accepted.workspace });
}

function describedSlot(
  source: Record<string, unknown>,
  name: string,
  size: number,
  mimeType: string
) {
  const keys = [...new Set([...Object.keys(source), name])].sort();
  return Object.fromEntries(
    keys.map((key) => [key, key === name ? { binarySlot: 'blob', size, mimeType } : source[key]])
  );
}

/** Hash a checked unloaded after-image without fabricating the missing original bytes. */
export function digestUnloadedImageReplicaRows(
  value: unknown,
  target: Extract<AssetResidencyTarget, { kind: 'inline-image' }>
): string {
  const rows = parseImageRows(value, target);
  if (!rows) throw new Error('Unloaded image metadata is invalid.');
  const descriptor = target.duplicatePreview;
  if (
    descriptor &&
    (!rows.presentation ||
      rows.presentation.previewBlob !== undefined ||
      rows.presentation.presentationRevision !== descriptor.presentationRevision)
  )
    throw new Error('Unloaded image preview changed.');
  const metadata = describeImageMetadata(rows);
  if (!isRecord(metadata) || !isRecord(metadata['media']))
    throw new Error('Unloaded image metadata is invalid.');
  metadata['media'] = describedSlot(metadata['media'], 'blob', target.size, target.blobType);
  if (descriptor) {
    if (!isRecord(metadata['presentation'])) throw new Error('Unloaded image metadata is invalid.');
    metadata['presentation'] = describedSlot(
      metadata['presentation'],
      'previewBlob',
      target.size,
      descriptor.blobType
    );
  }
  const digest = Array.from(sha256(new TextEncoder().encode(JSON.stringify(metadata))), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
  return digest;
}

/** Metadata-only predecessor evidence. These rows cannot pass capture admission without their real bytes. */
export async function readImageReplicaPredecessorInTransaction(
  tx: IDBPTransaction<unknown, string[], 'readonly' | 'readwrite'>,
  mediaId: string,
  state: SyncCaptureRootState
): Promise<{ rows: CapturedImageRows; digest: string; unloadedCopy: AssetResidencyCopy | null }> {
  const raw = await readImageRowsInTransaction(tx, mediaId);
  const complete = parseCapturedImageRows(raw);
  if (complete)
    return { rows: complete, digest: digestCapturedImageRows(complete), unloadedCopy: null };
  const copy = await readAssetResidencyCopyInTransaction(
    tx,
    assetResidencyCopyId({ kind: 'inline-image', mediaId })
  );
  const profile: unknown = await tx.objectStore(SYNC_CAPTURE_STORE).get('profile');
  if (
    !copy ||
    copy.phase !== 'unloaded' ||
    copy.target.kind !== 'inline-image' ||
    copy.target.rootGeneration !== state.generation ||
    copy.target.nativeDigest !== state.nativeDigest ||
    state.deleted ||
    state.rootKind !== 'media' ||
    state.rootId !== mediaId ||
    state.spaceId !== copy.remote.binding.spaceId ||
    state.nativeRevision !== copy.target.workspaceRevision ||
    !isRecord(profile) ||
    profile['version'] !== 1 ||
    profile['kind'] !== 'profile' ||
    profile['key'] !== 'profile' ||
    profile['enabled'] !== true ||
    profile['spaceId'] !== state.spaceId ||
    profile['createdAt'] !== copy.remote.binding.profileCreatedAt ||
    profile['connectionGeneration'] !== copy.remote.binding.connectionGeneration
  )
    throw new Error('Unloaded image predecessor changed.');
  const rows = parseImageRows(raw, copy.target);
  if (!rows || rows.media.id !== mediaId) throw new Error('Unloaded image metadata is invalid.');
  const digest = digestUnloadedImageReplicaRows(rows, copy.target);
  if (digest !== state.nativeDigest) throw new Error('Unloaded image metadata digest changed.');
  return { rows, digest, unloadedCopy: copy };
}

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
import { parseMediaLibraryEntry } from '../media-library/read-guards';
import { parseImageWorkspaceEntry } from '../image-workspaces/parser';
import { parseAggregatePresentationEntry } from '../aggregate-presentations/parser';
import {
  ASSET_REFS_STORE,
  ASSET_OWNERS_STORE,
  SYNC_CAPTURE_STORE,
  MEDIA_LIBRARY_STORE,
  IMAGE_WORKSPACES_STORE,
  AGGREGATE_PRESENTATIONS_STORE,
} from '../infrastructure/indexed-db/core.stores';
import { MAX_CAPTURE_METADATA_BYTES, MAX_CAPTURE_ROWS, type CapturedImageRows } from './contracts';

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

/** Admit one screenshot aggregate and its exact persisted document asset closure. */
function parseImageRows(
  value: unknown,
  unloaded?: Extract<AssetResidencyTarget, { kind: 'inline-image' }>
): CapturedImageRows | null {
  if (!isRecord(value) || !isBoundedImageMetadata(value)) return null;
  if (
    Object.keys(value).some(
      (key) => !['media', 'workspace', 'presentation', 'refs', 'originalRef'].includes(key)
    )
  )
    return null;
  const media = parseMediaLibraryEntry(value['media']);
  const originalRef =
    value['originalRef'] === undefined ? undefined : parseAssetRef(value['originalRef']);
  const workspace =
    value['workspace'] === null ? null : parseImageWorkspaceEntry(value['workspace']);
  const presentation =
    value['presentation'] === null ? null : parseAggregatePresentationEntry(value['presentation']);
  const rawRefs = value['refs'];
  if (
    !media ||
    (media.source.kind !== 'screenshot' && media.source.kind !== 'stored-asset') ||
    !['image', 'screenshot'].includes(media.kind) ||
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
  const required = new Set(workspace?.document.assets.map((asset) => asset.assetId) ?? []);
  if (
    ids.size !== admittedRefs.length ||
    ids.size !== required.size ||
    [...required].some((id) => !ids.has(id))
  )
    return null;
  if (
    workspace &&
    (workspace.aggregateId !== media.id ||
      workspace.revision !== media.workspaceRevision ||
      !Number.isSafeInteger(workspace.revision))
  )
    return null;
  if (
    presentation &&
    (presentation.aggregateId !== media.id ||
      presentation.aggregateKind !== 'image' ||
      !Number.isSafeInteger(presentation.presentationRevision) ||
      presentation.presentationRevision > (media.workspaceRevision ?? 0))
  )
    return null;
  return {
    media,
    workspace,
    presentation,
    refs: admittedRefs,
    ...(originalRef ? { originalRef } : {}),
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
  const media = parseMediaLibraryEntry(await tx.objectStore(MEDIA_LIBRARY_STORE).get(mediaId));
  let originalRef: unknown;
  if (media?.source.kind === 'stored-asset') {
    originalRef = await tx.objectStore(ASSET_REFS_STORE).get(media.source.assetId);
    const owner = parseAssetOwner(
      await tx.objectStore(ASSET_OWNERS_STORE).get(['media-library', mediaId, 'source'])
    );
    if (
      !owner ||
      owner.ownerKind !== 'media-library' ||
      owner.ownerId !== mediaId ||
      owner.role !== 'source' ||
      owner.assetId !== media.source.assetId
    )
      throw new Error('Invalid stored image source ownership.');
  }
  const rawWorkspace: unknown = await tx.objectStore(IMAGE_WORKSPACES_STORE).get(mediaId);
  const workspace = parseImageWorkspaceEntry(rawWorkspace);
  const presentation: unknown = await tx
    .objectStore(AGGREGATE_PRESENTATIONS_STORE)
    .get(['image', mediaId]);
  const refs: unknown[] = [];
  for (const id of new Set(workspace?.document.assets.map((asset) => asset.assetId) ?? []))
    refs.push(await tx.objectStore(ASSET_REFS_STORE).get(id));
  return {
    media,
    workspace: rawWorkspace ?? null,
    presentation: presentation ?? null,
    refs,
    ...(originalRef === undefined ? {} : { originalRef }),
  };
}

/** Read a complete publishable after-image without admitting missing inline bytes. */
export async function freezeImageInTransaction(
  tx: IDBPTransaction<unknown, string[], 'readonly' | 'readwrite'>,
  mediaId: string
): Promise<CapturedImageRows> {
  const rows = parseCapturedImageRows(await readImageRowsInTransaction(tx, mediaId));
  if (!rows || rows.media.id !== mediaId)
    throw new Error('Unsupported screenshot aggregate snapshot.');
  return structuredClone(rows);
}

/** Synchronous metadata digest keeps the native IDB transaction live. */
export function digestCapturedImageRows(rows: CapturedImageRows): string {
  const accepted = parseCapturedImageRows(rows);
  if (!accepted) throw new Error('Invalid image snapshot.');
  const bytes = new TextEncoder().encode(JSON.stringify(describeImageMetadata(accepted)));
  return Array.from(sha256(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
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
  const descriptor = copy.target.duplicatePreview;
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
  metadata['media'] = describedSlot(
    metadata['media'],
    'blob',
    copy.target.size,
    copy.target.blobType
  );
  if (descriptor) {
    if (!isRecord(metadata['presentation'])) throw new Error('Unloaded image metadata is invalid.');
    metadata['presentation'] = describedSlot(
      metadata['presentation'],
      'previewBlob',
      copy.target.size,
      descriptor.blobType
    );
  }
  const digest = Array.from(sha256(new TextEncoder().encode(JSON.stringify(metadata))), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
  if (digest !== state.nativeDigest) throw new Error('Unloaded image metadata digest changed.');
  return { rows, digest, unloadedCopy: copy };
}

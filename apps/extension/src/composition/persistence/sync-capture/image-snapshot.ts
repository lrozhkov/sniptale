import type { IDBPTransaction } from 'idb';
import { sha256 } from '@noble/hashes/sha2.js';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { parseAssetRef, parseAssetOwner } from '../assets/guards';
import { parseMediaLibraryEntry } from '../media-library/read-guards';
import { parseImageWorkspaceEntry } from '../image-workspaces/parser';
import { parseAggregatePresentationEntry } from '../aggregate-presentations/parser';
import {
  ASSET_REFS_STORE,
  ASSET_OWNERS_STORE,
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
  const active = new WeakSet<object>();
  let nodes = 0;
  let characters = 0;
  function visit(item: unknown, depth: number): boolean {
    if (++nodes > 100_000 || depth > 64) return false;
    if (item instanceof Blob) return allowBlobs && Number.isSafeInteger(item.size);
    if (typeof item === 'string') {
      characters += item.length;
      return characters <= MAX_CAPTURE_METADATA_BYTES;
    }
    if (item === undefined || item === null || typeof item === 'boolean') return true;
    if (typeof item === 'number') return Number.isFinite(item);
    if (typeof item !== 'object' || active.has(item)) return false;
    if (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype) return false;
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
    new TextEncoder().encode(JSON.stringify(describeImageMetadata(value))).byteLength <=
      MAX_CAPTURE_METADATA_BYTES
  );
}

/** Admit one screenshot aggregate and its exact persisted document asset closure. */
export function parseCapturedImageRows(value: unknown): CapturedImageRows | null {
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
      (!(media.blob instanceof Blob) ||
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

/** Read the accepted after-image exclusively through the writer's live transaction. */
export async function freezeImageInTransaction(
  tx: IDBPTransaction<unknown, string[], 'readonly' | 'readwrite'>,
  mediaId: string
): Promise<CapturedImageRows> {
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
  const rows = parseCapturedImageRows({
    media,
    workspace: rawWorkspace ?? null,
    presentation: presentation ?? null,
    refs,
    ...(originalRef === undefined ? {} : { originalRef }),
  });
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

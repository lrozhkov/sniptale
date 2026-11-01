import { loadCapturedInventory, createCapturedRootEnvelope } from './captured-inventory';
import { createArchivePathAllocator } from '../../composition/archive-transfer';
import type { CapturedImageRows } from '../../composition/persistence/sync-capture/contracts';
import { parseCapturedImageRows } from '../../composition/persistence/sync-capture/guards';
import {
  ASSET_REFS_STORE,
  MEDIA_LIBRARY_STORE,
  IMAGE_WORKSPACES_STORE,
  AGGREGATE_PRESENTATIONS_STORE,
} from '../../composition/persistence/infrastructure/indexed-db/core';
import { buildMediaRootInventory } from '../media-hub-backup/v6/inventory/media';
import { digestBackupObject } from '../media-hub-backup/v6/shared-objects';
import { assertPortableJson } from '../media-hub-backup/v6/codec';
import {
  decodePortableEditorDocument,
  encodePortableEditorDocument,
} from '../media-hub-backup/v6/root-codecs/editor-document';
import { parsePortableMediaMetadata } from '../media-hub-backup/v6/root-codecs/media';
import type { AssetRef } from '../../composition/persistence/assets';
import { createMediaHubBackupExportOptions } from '../media-hub-backup/v6/options';

/** Feed only the accepted image after-image to the existing backup inventory. */
export async function encodeCapturedImageRoot(value: CapturedImageRows) {
  const parsed = parseCapturedImageRows(value);
  if (!parsed) throw new Error('Invalid frozen image source.');
  const rows = structuredClone(parsed);
  const refs = new Map(
    [...rows.refs, ...(rows.originalRef ? [rows.originalRef] : [])].map((ref) => [ref.assetId, ref])
  );
  const db = {
    async get(store: string, key: unknown): Promise<unknown> {
      if (store === MEDIA_LIBRARY_STORE && key === rows.media.id) return rows.media;
      if (store === IMAGE_WORKSPACES_STORE && key === rows.media.id) return rows.workspace;
      if (
        store === AGGREGATE_PRESENTATIONS_STORE &&
        Array.isArray(key) &&
        key.length === 2 &&
        key[0] === 'image' &&
        key[1] === rows.media.id
      )
        return rows.presentation;
      if (store === ASSET_REFS_STORE && typeof key === 'string' && refs.has(key))
        return refs.get(key);
      throw new Error('Image inventory requested an uncaptured native row.');
    },
    transaction(): never {
      throw new Error('Image inventory cannot read live workspace state.');
    },
  };
  const roots = await buildMediaRootInventory({
    db,
    items: [{ ...rows.media, hasThumbnail: rows.presentation !== null }],
    options: createMediaHubBackupExportOptions({
      includeDrafts: false,
      includeSourceMetadata: true,
      includeTelemetry: false,
      includeWebSnapshots: false,
    }),
    paths: createArchivePathAllocator(),
  });
  if (roots.length !== 1 || roots[0]!.descriptor.rootId !== rows.media.id)
    throw new Error('Frozen image inventory differs from its root.');
  const inventory = await loadCapturedInventory(roots[0]!);
  const portable = parsePortableMediaMetadata(inventory.metadata);
  const canonicalIds = new Map<string, string>();
  const identities = new Map<string, string>();
  const objects: typeof inventory.objects = [];
  for (const object of inventory.objects) {
    const digest = await digestBackupObject({
      size: object.blob.size,
      pipeTo: (sink, signal) => object.blob.stream().pipeTo(sink, signal ? { signal } : {}),
    });
    const identity = JSON.stringify([digest, object.ref.size, object.ref.mimeType]);
    const existing = identities.get(identity);
    const objectId = existing ?? object.ref.objectId;
    canonicalIds.set(object.ref.objectId, objectId);
    if (!existing) {
      identities.set(identity, objectId);
      objects.push(object);
    }
  }
  const canonical = (objectId: string) => {
    const id = canonicalIds.get(objectId);
    if (!id) throw new Error('Captured image object is missing.');
    return id;
  };
  // Reuse the document codec for all pointers, including binary fields inside canvas JSON.
  const sourceAssets = portable.workspace?.document.assets ?? [];
  if (portable.workspace) {
    const document = decodePortableEditorDocument({
      document: portable.workspace.document,
      assetsByObjectId: new Map(sourceAssets.map(({ objectId }) => [objectId, objectId])),
    });
    portable.workspace.document = encodePortableEditorDocument({
      document,
      objectsByAssetId: canonicalIds,
    });
  }
  portable.originalObjectId = canonical(portable.originalObjectId);
  if (portable.presentation) {
    portable.presentation.thumbnailObjectId = canonical(portable.presentation.thumbnailObjectId);
    if (portable.presentation.previewObjectId)
      portable.presentation.previewObjectId = canonical(portable.presentation.previewObjectId);
  }
  const metadata: unknown = JSON.parse(JSON.stringify(portable));
  assertPortableJson(metadata);
  const root = {
    ...roots[0]!,
    descriptor: {
      ...roots[0]!.descriptor,
      objectCount: objects.length,
      totalBytes: objects.reduce((sum, object) => sum + object.ref.size, 0),
    },
  };
  const envelope = createCapturedRootEnvelope(root, { metadata, objects });
  const bindings: { objectId: string; ref: AssetRef }[] = [];
  const bind = (objectId: string, ref: AssetRef | undefined) => {
    const object = objects.find((candidate) => candidate.ref.objectId === objectId);
    if (
      !ref ||
      !object ||
      object.ref.size !== ref.size ||
      object.ref.mimeType !== ref.mimeType.split(';', 1)[0]!.trim().toLowerCase() ||
      object.blob.size !== ref.size ||
      object.blob.type !== ref.mimeType
    )
      throw new Error('Captured image object differs from its native reference.');
    const existing = bindings.find((binding) => binding.objectId === objectId);
    if (!existing) bindings.push({ objectId, ref });
  };
  if (rows.originalRef) bind(portable.originalObjectId, rows.originalRef);
  for (const asset of portable.workspace?.document.assets ?? []) {
    const source = rows.workspace?.document.assets.find((entry) => entry.role === asset.role);
    bind(asset.objectId, source ? refs.get(source.assetId) : undefined);
  }
  return { envelope, objects, dependencies: [], bindings };
}

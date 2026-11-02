import type { AssetResidencyCopy } from '../../composition/persistence/assets/residency-records';
import type { ArchiveObjectRef } from '../../composition/archive-transfer';
import {
  matchesCapturedObjectSource,
  loadCapturedInventory,
  createCapturedRootEnvelope,
  createCapturedAssetInventory,
} from './captured-inventory';
import { createArchivePathAllocator } from '../../composition/archive-transfer';
import type { CapturedImageRows } from '../../composition/persistence/sync-capture/contracts';
import { parseCapturedImageRows } from '../../composition/persistence/sync-capture/guards';
import {
  ASSET_REFS_STORE,
  MEDIA_LIBRARY_STORE,
  PROJECT_ASSETS_STORE,
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
export async function encodeCapturedImageRoot(
  value: CapturedImageRows,
  copies: ReadonlyMap<string, AssetResidencyCopy> = new Map()
) {
  const parsed = parseCapturedImageRows(value);
  if (!parsed) throw new Error('Invalid frozen image source.');
  const rows = structuredClone(parsed);
  const refs = new Map(
    [...rows.refs, ...(rows.originalRef ? [rows.originalRef] : [])].map((ref) => [ref.assetId, ref])
  );
  const deferred = createCapturedAssetInventory([...refs.values()], copies);
  const db = {
    async get(store: string, key: unknown): Promise<unknown> {
      if (store === MEDIA_LIBRARY_STORE && key === rows.media.id) return rows.media;
      if (store === PROJECT_ASSETS_STORE && rows.projectAsset && key === rows.projectAsset.id)
        return rows.projectAsset;
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
    deferredAssets: deferred.port,
  });
  if (roots.length !== 1 || roots[0]!.descriptor.rootId !== rows.media.id)
    throw new Error('Frozen image inventory differs from its root.');
  deferred.assertUsed();
  const inventory = await loadCapturedInventory(roots[0]!);
  const portable = parsePortableMediaMetadata(inventory.metadata);
  const canonicalIds = new Map<string, string>();
  const identities = new Map<string, string>();
  const nativeIdentities = new Map<string, string>();
  const retained = new Map<string, { ref: ArchiveObjectRef; copy: AssetResidencyCopy }>();
  const sourceBindings = new Map<string, AssetRef>();
  if (rows.originalRef) sourceBindings.set(portable.originalObjectId, rows.originalRef);
  for (const asset of portable.workspace?.document.assets ?? []) {
    const native = rows.workspace?.document.assets.find((item) => item.role === asset.role);
    const ref = native ? refs.get(native.assetId) : undefined;
    if (ref) sourceBindings.set(asset.objectId, ref);
  }
  const objects: typeof inventory.objects = [];
  for (const object of inventory.objects) {
    const blob = object.blob;
    if (!blob) throw new Error('Captured image inventory requires local image bytes.');
    const digest = await digestBackupObject({
      size: blob.size,
      pipeTo: (sink, signal) => blob.stream().pipeTo(sink, signal ? { signal } : {}),
    });
    const identity = JSON.stringify([digest, object.ref.size, object.ref.mimeType]);
    const existing = identities.get(identity);
    const objectId = existing ?? object.ref.objectId;
    canonicalIds.set(object.ref.objectId, objectId);
    if (!existing) {
      identities.set(identity, objectId);
      objects.push(object);
    }
    const native = sourceBindings.get(object.ref.objectId);
    if (native?.sha256 === digest) nativeIdentities.set(identity, objectId);
  }
  const retainedIdentities = new Map<string, string>();
  for (const [objectId, entry] of deferred.objects) {
    if (entry.copy.target.kind !== 'opfs') throw new Error('Deferred image target is invalid.');
    const native = entry.copy.target.ref;
    const identity = JSON.stringify([entry.copy.remote.sha256, entry.ref.size, entry.ref.mimeType]);
    const provedAlias = native.sha256 === entry.copy.remote.sha256;
    const existing = provedAlias
      ? (nativeIdentities.get(identity) ?? retainedIdentities.get(identity))
      : undefined;
    const canonicalId = existing ?? objectId;
    canonicalIds.set(objectId, canonicalId);
    if (!existing) {
      retained.set(canonicalId, entry);
      if (provedAlias) retainedIdentities.set(identity, canonicalId);
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
      objectCount: objects.length + retained.size,
      totalBytes:
        objects.reduce((sum, object) => sum + object.ref.size, 0) +
        [...retained.values()].reduce((sum, object) => sum + object.ref.size, 0),
    },
  };
  const envelope = createCapturedRootEnvelope(
    root,
    { metadata, objects },
    [...retained.values()].map((object) => object.ref)
  );
  const bindings: { objectId: string; ref: AssetRef }[] = [];
  const bind = (objectId: string, ref: AssetRef | undefined) => {
    const object = objects.find((candidate) => candidate.ref.objectId === objectId);
    const remote = retained.get(objectId);
    const descriptor = object?.ref ?? remote?.ref;
    const remoteRef = remote?.copy.target.kind === 'opfs' ? remote.copy.target.ref : undefined;
    if (
      !matchesCapturedObjectSource(ref, descriptor, object) ||
      (!object &&
        (!remote ||
          !remoteRef ||
          (JSON.stringify(remoteRef) !== JSON.stringify(ref) &&
            (remoteRef.sha256 !== remote.copy.remote.sha256 ||
              ref.sha256 !== remote.copy.remote.sha256))))
    )
      throw new Error('Captured image object differs from its native reference.');
    // A copied alias cannot become a local file claim when real local bytes won deduplication.
    if (object && deferred.copies.has(ref.assetId)) return;
    const existing = bindings.find((binding) => binding.objectId === objectId);
    if (!existing) bindings.push({ objectId, ref });
  };
  if (rows.originalRef) bind(portable.originalObjectId, rows.originalRef);
  for (const asset of portable.workspace?.document.assets ?? []) {
    const source = rows.workspace?.document.assets.find((entry) => entry.role === asset.role);
    bind(asset.objectId, source ? refs.get(source.assetId) : undefined);
  }
  return {
    envelope,
    objects,
    dependencies: [],
    bindings,
    ...(retained.size
      ? {
          retainedObjects: [...retained.values()].map(({ ref, copy }) => ({
            objectId: ref.objectId,
            remoteKey: copy.remote.key,
            sha256: copy.remote.sha256,
          })),
        }
      : {}),
  };
}

import {
  createArchivePathAllocator,
  sanitizeArchivePathSegment,
} from '../../composition/archive-transfer';
import type { CapturedImageRows } from '../../composition/persistence/sync-capture/contracts';
import { parseCapturedImageRows } from '../../composition/persistence/sync-capture/guards';
import {
  ASSET_REFS_STORE,
  MEDIA_LIBRARY_STORE,
  IMAGE_WORKSPACES_STORE,
  AGGREGATE_PRESENTATIONS_STORE,
} from '../../composition/persistence/infrastructure/indexed-db/core';
import { assertPortableJson, parseRootEnvelope } from '../media-hub-backup/v6/codec';
import { buildMediaRootInventory } from '../media-hub-backup/v6/inventory/media';
import { createMediaHubBackupExportOptions } from '../media-hub-backup/v6/options';

/** Feed only the accepted image after-image to the existing backup inventory. */
export async function encodeCapturedImageRoot(value: CapturedImageRows) {
  const parsed = parseCapturedImageRows(value);
  if (!parsed) throw new Error('Invalid frozen image source.');
  const rows = structuredClone(parsed);
  const refs = new Map(rows.refs.map((ref) => [ref.assetId, ref]));
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
  const loaded = await roots[0]!.load();
  // Backup roles can contain path punctuation. Keep metadata intact and use the shared path sanitizer.
  const objects = loaded.objects.map((object) => ({
    ...object,
    ref: { ...object.ref, filename: sanitizeArchivePathSegment(object.ref.filename) },
  }));
  const metadata: unknown = JSON.parse(JSON.stringify(loaded.metadata));
  assertPortableJson(metadata);
  const envelope = parseRootEnvelope({
    descriptor: {
      ...roots[0]!.descriptor,
      metadataPath: 'Metadata/sync-root.json',
    },
    metadata,
    objects: objects.map((object) => object.ref),
  });
  return { envelope, objects, dependencies: [], bindings: [] };
}

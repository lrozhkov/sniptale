import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { loadMaterializedCatalogSelections } from '../../composition/persistence/sync-capture/catalog-admission';
import { loadSyncConnection } from '../../composition/persistence/remote-connection/store';
import { loadSyncCatalogCache } from '../../composition/persistence/sync-catalog/catalog-cache';
import type { SyncRemoteCatalogCard } from '../../contracts/messaging/contracts/runtime-message/sync-connection.types';
import { checkedSyncCatalogManifest } from './catalog';
import { projectSyncCatalog, type CatalogAttempt } from './catalog-graph';
import { hashSyncText } from './wire-record';
import { parsePortableSyncRoot } from './prepared-root';

/** Parse one scoped advisory native snapshot without network, credentials or original reads. */
export async function readCheckedPersistedSyncCatalog() {
  const connection = await loadSyncConnection();
  if (!connection) return null;
  const { spaceId, connectionGeneration, profileCreatedAt } = connection.binding;
  const cached = await loadSyncCatalogCache(spaceId, connectionGeneration);
  if (!cached || cached.profileCreatedAt !== profileCreatedAt) return null;
  const attempts: CatalogAttempt[] = [];
  const invalid: { key: string; code: 'invalid-manifest' }[] = [];
  for (const item of cached.manifests) {
    try {
      const parsed = await checkedSyncCatalogManifest(item.text, item.manifestKey, spaceId);
      attempts.push({
        operationText: JSON.stringify(parsed.operation),
        operation: parsed.operation,
        recordKey: parsed.recordKey,
        attemptId: parsed.attemptId,
        objects: parsed.objects,
      });
    } catch {
      invalid.push({ key: item.manifestKey, code: 'invalid-manifest' });
    }
  }
  return {
    ...projectSyncCatalog(spaceId, attempts),
    invalid,
    metadataBytes: cached.manifests.reduce((total, item) => total + item.size, 0),
    pages: 0,
  };
}

/** Return the existing bounded catalog in one pass; Gallery virtualizes display-only cards. */
export async function readPersistedSyncCatalogCards(): Promise<SyncRemoteCatalogCard[]> {
  const catalog = await readCheckedPersistedSyncCatalog();
  if (!catalog) return [];
  const roots = [...catalog.roots.values()].sort((left, right) =>
    JSON.stringify([left.rootKind, left.rootId]).localeCompare(
      JSON.stringify([right.rootKind, right.rootId])
    )
  );
  const cards: SyncRemoteCatalogCard[] = [];
  for (const root of roots) {
    const operation = root.heads[0] ? catalog.operations.get(root.heads[0]) : undefined;
    if (!operation) continue;
    const selection = {
      rootKind: root.rootKind,
      rootId: root.rootId,
      operationId: operation.operation.operationId,
      sourceDigest: hashSyncText(operation.operationText),
    };
    let card: SyncRemoteCatalogCard = {
      source: 'remote',
      selection,
      label: root.rootId,
      tags: [],
      kind:
        root.rootKind === 'media'
          ? 'video'
          : root.rootKind === 'scenario-project'
            ? 'scenario'
            : root.rootKind,
      mimeType: null,
      size: 0,
      createdAt: 0,
      updatedAt: 0,
      conflict: root.conflict,
      unavailable:
        catalog.invalid.length > 0 || root.blocked || root.unavailableDependencies.length > 0,
      deleted: root.deleted,
    };
    if (operation.operation.envelope) {
      const parsed = await parsePortableSyncRoot(
        operation.operation.envelope,
        operation.operation.reviewSourceMediaId
      );
      if (parsed.kind === 'video-project')
        card = {
          ...card,
          label: parsed.entry.project.name,
          kind: 'video-project',
          size: parsed.envelope.descriptor.totalBytes,
          createdAt: parsed.entry.createdAt,
          updatedAt: parsed.entry.updatedAt,
        };
      else if (parsed.kind === 'scenario-project') {
        if (
          parsed.metadata.entry.lifecycle?.storageClass === 'temporary' ||
          (isRecord(parsed.metadata.entry.project) &&
            parsed.metadata.entry.project['purpose'] === 'step-template')
        )
          continue;
        card = {
          ...card,
          label: parsed.name,
          kind: 'scenario',
          size: parsed.envelope.descriptor.totalBytes,
          createdAt: parsed.metadata.entry.createdAt,
          updatedAt: parsed.metadata.entry.updatedAt,
        };
      } else {
        const entry = parsed.metadata.entry;
        card = {
          ...card,
          label: entry.filename,
          tags: [...entry.tags],
          kind:
            parsed.kind === 'video-review'
              ? 'video-review'
              : entry.kind === 'audio' || entry.mimeType.startsWith('audio/')
                ? 'audio'
                : entry.kind === 'image' ||
                    entry.kind === 'screenshot' ||
                    entry.mimeType.startsWith('image/')
                  ? 'image'
                  : 'video',
          mimeType: entry.mimeType,
          size: entry.size,
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt,
        };
      }
    }
    if (root.conflict) {
      const versions: NonNullable<SyncRemoteCatalogCard['versions']> = [];
      for (const id of root.heads) {
        const version = catalog.operations.get(id);
        if (!version) continue;
        let label = root.rootId;
        if (version.operation.envelope) {
          const portable = await parsePortableSyncRoot(
            version.operation.envelope,
            version.operation.reviewSourceMediaId
          );
          label =
            portable.kind === 'video-project'
              ? portable.entry.project.name
              : portable.kind === 'scenario-project'
                ? portable.name
                : portable.metadata.entry.filename;
        }
        versions.push({
          selection: {
            rootKind: root.rootKind,
            rootId: root.rootId,
            operationId: id,
            sourceDigest: hashSyncText(version.operationText),
          },
          label,
          deleted: version.operation.kind === 'delete',
        });
      }
      card = { ...card, versions };
    }
    cards.push(card);
  }
  const connection = await loadSyncConnection();
  if (!connection) return cards;
  const materialized = await loadMaterializedCatalogSelections({
    scope: connection.binding,
    selections: cards.map((card) => card.selection),
  });
  const proven = new Set(materialized.map((selection) => JSON.stringify(selection)));
  return cards.map((card) =>
    !card.conflict && proven.has(JSON.stringify(card.selection))
      ? { ...card, materialized: true }
      : card
  );
}

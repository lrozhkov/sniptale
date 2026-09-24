import { listAggregatePresentations } from '../aggregate-presentations';
import { recoverAndListStoredImageWorkspaces } from '../image-workspaces';
import { getMediaThumbnail, listMediaLibrary } from '../media-library';
import { listVideoProjectEntries } from '../projects';
import {
  listScenarioAssets,
  listScenarioExports,
  listScenarioProjectEntries,
} from '../scenario/projects';
import { listStoredScenarioStepEditorDocuments } from '../scenario/editor-documents';
import { parseAssetOwner, parseAssetRef, type AssetOwner, type AssetRef } from '../assets';
import { ASSET_OWNERS_STORE, ASSET_REFS_STORE } from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';

export interface LibraryStorageUsage {
  draftsBytes: number;
  libraryBytes: number;
  totalBytes: number;
}

type StorageClass = 'temporary' | 'library';

export async function getLibraryStorageUsage(): Promise<LibraryStorageUsage> {
  const [media, videoProjects, scenarioProjects, imageWorkspaces, presentations, assetAuthority] =
    await Promise.all([
      listMediaLibrary(),
      listVideoProjectEntries(),
      listScenarioProjectEntries(),
      recoverAndListStoredImageWorkspaces(),
      listAggregatePresentations(),
      loadAssetUsageAuthority(),
    ]);
  const usage: LibraryStorageUsage = { draftsBytes: 0, libraryBytes: 0, totalBytes: 0 };
  const countedPhysicalAssetIds = new Set<string>();
  const addBytes = (size: number, storageClass: StorageClass) => {
    const safeSize = Math.max(0, size);
    usage.totalBytes += safeSize;
    if (storageClass === 'temporary') usage.draftsBytes += safeSize;
    else usage.libraryBytes += safeSize;
  };
  const jsonBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
  const addPhysicalAsset = (assetId: string, storageClass: StorageClass) => {
    if (countedPhysicalAssetIds.has(assetId)) return;
    countedPhysicalAssetIds.add(assetId);
    addBytes(assetAuthority.refsById.get(assetId)?.size ?? 0, storageClass);
  };
  const mediaById = new Map(media.map((entry) => [entry.id, entry]));
  const videoById = new Map(videoProjects.map((entry) => [entry.id, entry]));
  const scenarioById = new Map(scenarioProjects.map((entry) => [entry.id, entry]));

  for (const entry of media) {
    const storageClass = entry.lifecycle?.storageClass ?? 'library';
    if (!entry.source) addBytes(entry.size, storageClass);
    else {
      for (const assetId of resolveMediaPhysicalAssetIds(entry, assetAuthority)) {
        addPhysicalAsset(assetId, storageClass);
      }
      if (entry.source.kind === 'screenshot') addBytes(entry.size, storageClass);
    }
    if (entry.hasThumbnail) {
      const thumbnail = await getMediaThumbnail(entry.id);
      if (thumbnail) addBytes(thumbnail.blob.size, storageClass);
    }
  }
  for (const workspace of imageWorkspaces) {
    const parent = mediaById.get(workspace.aggregateId);
    if (parent) {
      addBytes(jsonBytes(workspace), parent.lifecycle?.storageClass ?? 'library');
      for (const assetId of new Set(workspace.document.assets.map((asset) => asset.assetId))) {
        addPhysicalAsset(assetId, parent.lifecycle?.storageClass ?? 'library');
      }
    }
  }
  for (const entry of videoProjects) {
    addBytes(jsonBytes(entry.project), entry.lifecycle?.storageClass ?? 'library');
    const legacyThumbnail = await getMediaThumbnail(`video-project:${entry.id}`);
    if (legacyThumbnail) {
      addBytes(legacyThumbnail.blob.size, entry.lifecycle?.storageClass ?? 'library');
    }
  }
  for (const entry of scenarioProjects) {
    const storageClass = entry.lifecycle?.storageClass ?? 'library';
    addBytes(jsonBytes(entry.project), storageClass);
    const [assets, exports, stepDocuments, legacyThumbnail] = await Promise.all([
      listScenarioAssets(entry.id),
      listScenarioExports(entry.id),
      listStoredScenarioStepEditorDocuments(entry.id),
      getMediaThumbnail(`scenario:${entry.id}`),
    ]);
    for (const asset of assets) {
      addPhysicalAsset(asset.assetId, storageClass);
    }
    for (const stepDocument of stepDocuments) {
      addBytes(jsonBytes(stepDocument), storageClass);
      for (const assetId of new Set(stepDocument.document.assets.map((asset) => asset.assetId))) {
        addPhysicalAsset(assetId, storageClass);
      }
    }
    if (legacyThumbnail) addBytes(legacyThumbnail.blob.size, storageClass);
    for (const scenarioExport of exports) {
      addBytes(scenarioExport.size, storageClass);
      const exportThumbnail = await getMediaThumbnail(`scenario-export:${scenarioExport.id}`);
      if (exportThumbnail) addBytes(exportThumbnail.blob.size, storageClass);
    }
  }
  for (const presentation of presentations) {
    const storageClass = resolvePresentationStorageClass(presentation, {
      mediaById,
      scenarioById,
      videoById,
    });
    if (!storageClass) continue;
    addBytes(presentation.thumbnailBlob.size, storageClass);
    if (presentation.previewBlob) addBytes(presentation.previewBlob.size, storageClass);
  }
  return usage;
}

interface AssetUsageAuthority {
  ownersByDomainKey: Map<string, AssetOwner>;
  refsById: Map<string, AssetRef>;
}

async function loadAssetUsageAuthority(): Promise<AssetUsageAuthority> {
  const [rawRefs, rawOwners] = await runWithIndexedDbMutation(async (db) =>
    Promise.all([db.getAll(ASSET_REFS_STORE), db.getAll(ASSET_OWNERS_STORE)])
  );
  const refs = Array.isArray(rawRefs) ? rawRefs.map(parseAssetRef).filter(isPresent) : [];
  const owners = Array.isArray(rawOwners) ? rawOwners.map(parseAssetOwner).filter(isPresent) : [];
  return {
    ownersByDomainKey: new Map(
      owners.map((owner) => [ownerDomainKey(owner.ownerKind, owner.ownerId, owner.role), owner])
    ),
    refsById: new Map(refs.map((ref) => [ref.assetId, ref])),
  };
}

function resolveMediaPhysicalAssetIds(
  entry: Awaited<ReturnType<typeof listMediaLibrary>>[number],
  authority: AssetUsageAuthority
): string[] {
  if (entry.source.kind === 'web-snapshot') {
    return [
      authority.ownersByDomainKey.get(
        ownerDomainKey('web-snapshot', entry.source.snapshotId, 'package')
      ),
      authority.ownersByDomainKey.get(
        ownerDomainKey('web-snapshot', entry.source.snapshotId, 'screenshot')
      ),
    ].flatMap((owner) => (owner ? [owner.assetId] : []));
  }
  if (entry.source.kind === 'stored-asset') return [entry.source.assetId];
  const owner =
    entry.source.kind === 'recording'
      ? authority.ownersByDomainKey.get(
          ownerDomainKey('recording', entry.source.recordingId, 'body')
        )
      : entry.source.kind === 'project-export'
        ? authority.ownersByDomainKey.get(
            ownerDomainKey('project-export', entry.source.exportId, 'body')
          )
        : entry.source.kind === 'project-asset'
          ? authority.ownersByDomainKey.get(
              ownerDomainKey('project-asset', entry.source.projectAssetId, 'body')
            )
          : undefined;
  return owner ? [owner.assetId] : [];
}

function ownerDomainKey(ownerKind: string, ownerId: string, role: string): string {
  return `${ownerKind}\u0000${ownerId}\u0000${role}`;
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}

function resolvePresentationStorageClass(
  presentation: Awaited<ReturnType<typeof listAggregatePresentations>>[number],
  roots: {
    mediaById: Map<string, Awaited<ReturnType<typeof listMediaLibrary>>[number]>;
    scenarioById: Map<string, Awaited<ReturnType<typeof listScenarioProjectEntries>>[number]>;
    videoById: Map<string, Awaited<ReturnType<typeof listVideoProjectEntries>>[number]>;
  }
): StorageClass | null {
  const root =
    presentation.aggregateKind === 'image'
      ? roots.mediaById.get(presentation.aggregateId)
      : presentation.aggregateKind === 'scenario'
        ? roots.scenarioById.get(presentation.aggregateId)
        : roots.videoById.get(presentation.aggregateId);
  return root ? (root.lifecycle?.storageClass ?? 'library') : null;
}

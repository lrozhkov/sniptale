import type { VideoProjectAssetSource } from '../../../features/video/project/types';
import { parseAssetRef, type AssetRef } from '../assets';
import {
  ASSET_OWNERS_STORE,
  ASSET_REFS_STORE,
  MEDIA_LIBRARY_STORE,
  PROJECT_ASSETS_STORE,
  SCENARIO_ASSETS_STORE,
  VIDEO_PROJECTS_STORE,
  type initDB,
} from '../infrastructure/indexed-db/core';
import { parseVideoDependencyEnvelope } from '../media-library/dependencies';
import { parseMediaLibraryEntry } from '../media-library/read-guards';
import { parseVideoProjectEntry } from '../projects/read-guards';
import { PROJECT_ASSET_OWNER_KIND, PROJECT_MEDIA_ASSET_ROLE } from '../projects/asset-publication';
import { parseScenarioAssetEntry } from './read-guards';
import { scenarioLibraryMediaId } from './library-publication';

type Transaction = ReturnType<Awaited<ReturnType<typeof initDB>>['transaction']>;

async function retainScenarioRepresentation(
  tx: Transaction,
  childId: string
): Promise<VideoProjectAssetSource> {
  const child = parseScenarioAssetEntry(await tx.objectStore(SCENARIO_ASSETS_STORE).get(childId));
  if (!child) throw new Error('Scenario video resource is invalid.');
  const ref: AssetRef | null = parseAssetRef(
    await tx.objectStore(ASSET_REFS_STORE).get(child.assetId)
  );
  if (!ref || ref.size !== child.size || ref.mimeType !== child.mimeType)
    throw new Error('Scenario video resource bytes are unavailable.');
  const originId =
    child.borrowedMediaId ?? child.galleryAssetId ?? scenarioLibraryMediaId(child.id);
  const rawMedia: unknown = await tx.objectStore(MEDIA_LIBRARY_STORE).get(originId);
  const media = parseMediaLibraryEntry(rawMedia);
  if (rawMedia !== undefined && (!media || media.id !== originId))
    throw new Error('Scenario video resource Library identity is invalid.');
  const projectAssetId = crypto.randomUUID();
  if ((await tx.objectStore(PROJECT_ASSETS_STORE).get(projectAssetId)) !== undefined)
    throw new Error('Scenario video resource identity is occupied.');
  await tx.objectStore(PROJECT_ASSETS_STORE).put!({
    id: projectAssetId,
    ...(media ? { originMediaId: media.id } : {}),
    assetId: child.assetId,
    mimeType: child.mimeType,
    size: child.size,
    createdAt: child.createdAt,
  });
  await tx.objectStore(ASSET_OWNERS_STORE).put!({
    assetId: child.assetId,
    ownerKind: PROJECT_ASSET_OWNER_KIND,
    ownerId: projectAssetId,
    role: PROJECT_MEDIA_ASSET_ROLE,
  });
  return { kind: 'project-asset', projectAssetId, ...(media ? { originMediaId: media.id } : {}) };
}

/** Keep external montage bytes before removing their scenario membership, without publishing new cards. */
export async function detachScenarioVideoAssets(
  tx: Transaction,
  projectId: string,
  childIds: ReadonlySet<string>,
  removeProject = true
): Promise<void> {
  if (!removeProject && childIds.size === 0) return;
  const retained = new Map<string, VideoProjectAssetSource>();
  for (const raw of await tx.objectStore(VIDEO_PROJECTS_STORE).getAll()) {
    const envelope = parseVideoDependencyEnvelope(raw);
    if (!envelope)
      throw new Error('Video project dependencies cannot be checked for scenario deletion.');
    const originated =
      removeProject &&
      envelope.source.kind === 'scenario' &&
      envelope.source.scenarioProjectId === projectId;
    const referenced = envelope.sources.some(
      (source) => source.kind === 'scenario-asset' && childIds.has(source.scenarioAssetId)
    );
    if (!originated && !referenced) continue;
    const entry = parseVideoProjectEntry(raw);
    if (!entry) throw new Error('Related video project is invalid for scenario deletion.');
    const assets = [];
    for (const asset of entry.project.assets) {
      if (asset.source.kind !== 'scenario-asset' || !childIds.has(asset.source.scenarioAssetId)) {
        assets.push(asset);
        continue;
      }
      const childId = asset.source.scenarioAssetId;
      let source = retained.get(childId);
      if (!source) {
        source = await retainScenarioRepresentation(tx, childId);
        retained.set(childId, source);
      }
      assets.push({ ...asset, source });
    }
    const now = Date.now();
    await tx.objectStore(VIDEO_PROJECTS_STORE).put!({
      ...entry,
      updatedAt: now,
      workspaceRevision: (entry.workspaceRevision ?? 0) + 1,
      project: {
        ...entry.project,
        updatedAt: now,
        assets,
        ...(originated ? { source: { kind: 'manual' as const } } : {}),
      },
    });
  }
}

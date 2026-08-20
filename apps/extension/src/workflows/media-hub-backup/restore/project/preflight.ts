import type JSZip from 'jszip';

import { verifyVideoProjectEffectSnapshotIntegrity } from '../../../../features/video/project/effect-instance';
import { parseEffectBundleCatalogEntry } from '../../../../composition/persistence/effect-bundles/entry';
import { assertEffectBundleCatalogIntegrity } from '../../../../composition/persistence/effect-bundles/integrity';
import type { VideoProjectEffectSnapshot } from '../../../../features/video/project/effect-instance/types';
import { isExportReadyVideoProject } from '../../../../features/video/project/validation';

import { parseScenarioAssetEntry } from '../../../../composition/persistence/scenario/read-guards';
import { translate } from '../../../../platform/i18n';
import { assertSafeProjectAssetStorageMetadata } from '../../../../features/media-hub/project-assets';
import { assertSafeScenarioAssetStorageMetadata } from '../../../../composition/persistence/scenario/projects/guards';
import type { BackupBlobDescriptor, ProjectAssetBackupBlobDescriptor } from '../../contracts/types';
import type { PreparedProjectDomains } from './prepare';
import { loadRequiredArchiveBlob } from '../prepare';
import { readRestoredBlob } from './helpers';
import { materializeAggregatePresentation } from '../presentation';
import {
  createAssetPublicationJournal,
  discardPreparedAsset,
} from '../../../../composition/persistence/assets';
import {
  PROJECT_ASSET_PUBLICATION_DOMAIN,
  PROJECT_EXPORT_PUBLICATION_DOMAIN,
} from '../../../../composition/persistence/projects/asset-publication';
import type { PreparedRestoreRecordingAsset } from '../prepare';
import { SCENARIO_ASSET_PUBLICATION_DOMAIN } from '../../../../composition/persistence/scenario/aggregate-mutations';
import { writeBackupArchiveEntryToAsset } from '../asset-stream';

function collectProjectBlobDescriptors(
  prepared: PreparedProjectDomains
): Array<{ blobPath: string }> {
  return [
    ...prepared.effectBundles.flatMap(({ descriptor }) => descriptor.assets),
    ...prepared.videoProjects.flatMap((project) => [
      ...project.descriptor.projectAssets,
      ...(project.descriptor.effectProject?.snapshots.flatMap(({ assets }) => assets) ?? []),
      ...project.descriptor.projectExports.flatMap((projectExport) => [
        projectExport.recording,
        ...(projectExport.thumbnail ? [projectExport.thumbnail] : []),
      ]),
      ...(project.descriptor.thumbnail ? [project.descriptor.thumbnail] : []),
    ]),
    ...prepared.scenarioProjects.flatMap((project) => [
      ...project.descriptor.assets,
      ...(project.descriptor.thumbnail ? [project.descriptor.thumbnail] : []),
      ...(project.descriptor.exportThumbnails ?? []),
    ]),
  ];
}

function collectMaterializedProjectBlobDescriptors(
  prepared: PreparedProjectDomains
): Array<{ blobPath: string }> {
  return [
    ...prepared.effectBundles.flatMap(({ descriptor }) => descriptor.assets),
    ...prepared.videoProjects.flatMap((project) => [
      ...(project.descriptor.effectProject?.snapshots.flatMap(({ assets }) => assets) ?? []),
      ...project.descriptor.projectExports.flatMap((projectExport) =>
        projectExport.thumbnail ? [projectExport.thumbnail] : []
      ),
      ...(project.descriptor.thumbnail ? [project.descriptor.thumbnail] : []),
    ]),
    ...prepared.scenarioProjects.flatMap((project) => [
      ...(project.descriptor.thumbnail ? [project.descriptor.thumbnail] : []),
      ...(project.descriptor.exportThumbnails ?? []),
    ]),
  ];
}

export async function assertPreparedProjectBlobsAvailable(
  prepared: PreparedProjectDomains,
  zip: JSZip
): Promise<void> {
  const descriptors = collectProjectBlobDescriptors(prepared);
  for (const descriptor of descriptors) {
    if (!zip.file(descriptor.blobPath)) {
      throw new Error(
        `${translate('shared.mediaHub.backupAssetBlobMissingPrefix')} ${descriptor.blobPath}.`
      );
    }
  }

  const restoredBlobs = await materializeProjectBlobs(
    collectMaterializedProjectBlobDescriptors(prepared),
    zip
  );
  assertPreparedProjectAssetsMetadataSafe(prepared);
  await prepareEffectProjectSnapshots(prepared, restoredBlobs);
  await prepareEffectBundles(prepared, restoredBlobs);
  await prepareAggregatePresentations(prepared, zip);
  prepared.restoredBlobs = restoredBlobs;
}

export async function stagePreparedProjectAssets(
  prepared: PreparedProjectDomains,
  zip: JSZip,
  operationId?: string
): Promise<void> {
  if (!prepared.restoredBlobs) throw new Error('Backup project blob preflight is incomplete.');
  for (const project of prepared.videoProjects) {
    if (
      !operationId &&
      (project.descriptor.projectAssets.length > 0 || project.descriptor.projectExports.length > 0)
    ) {
      throw new Error('Restore operation ID is missing for project assets.');
    }
    const projectAssets = new Map<string, PreparedRestoreRecordingAsset>();
    for (const descriptor of project.descriptor.projectAssets) {
      const asset = await writeBackupArchiveEntryToAsset({
        expectedSize: descriptor.entry.size,
        mimeType: descriptor.entry.mimeType,
        path: descriptor.blobPath,
        zip,
      });
      const journal = await createAssetPublicationJournal({
        assetRefs: [asset.ref],
        domain: PROJECT_ASSET_PUBLICATION_DOMAIN,
        operationId: operationId!,
        payload: { projectAssetId: descriptor.entry.id, restore: true },
      }).catch((error: unknown) => discardCurrentStagedAsset(asset.ref.assetId, error));
      projectAssets.set(descriptor.blobPath, { asset, journalId: journal.journalId });
    }
    const projectExportAssets = new Map<string, PreparedRestoreRecordingAsset>();
    for (const descriptor of project.descriptor.projectExports) {
      const mimeType = descriptor.entry.mimeType || 'video/webm';
      const size = descriptor.entry.size;
      const asset = await writeBackupArchiveEntryToAsset({
        expectedSize: size,
        mimeType,
        path: descriptor.recording.blobPath,
        zip,
      });
      const journal = await createAssetPublicationJournal({
        assetRefs: [asset.ref],
        domain: PROJECT_EXPORT_PUBLICATION_DOMAIN,
        operationId: operationId!,
        payload: { projectExportId: descriptor.entry.id, restore: true },
      }).catch((error: unknown) => discardCurrentStagedAsset(asset.ref.assetId, error));
      projectExportAssets.set(descriptor.recording.blobPath, {
        asset,
        journalId: journal.journalId,
      });
    }
    project.restoredProjectAssets = projectAssets;
    project.restoredProjectExportAssets = projectExportAssets;
  }
  for (const project of prepared.scenarioProjects) {
    if (!operationId && project.descriptor.assets.length > 0) {
      throw new Error('Restore operation ID is missing for scenario assets.');
    }
    const scenarioAssets = new Map<string, PreparedRestoreRecordingAsset>();
    for (const descriptor of project.descriptor.assets) {
      const entry = descriptor.entry as Record<string, unknown>;
      const mimeType = entry['mimeType'];
      const size = entry['size'];
      if (typeof mimeType !== 'string' || typeof size !== 'number') {
        throw new Error('Scenario asset backup metadata is incomplete.');
      }
      const asset = await writeBackupArchiveEntryToAsset({
        expectedSize: size,
        mimeType,
        path: descriptor.blobPath,
        zip,
      });
      const journal = await createAssetPublicationJournal({
        assetRefs: [asset.ref],
        domain: SCENARIO_ASSET_PUBLICATION_DOMAIN,
        operationId: operationId!,
        payload: { restore: true, scenarioAssetId: entry['id'] },
      }).catch((error: unknown) => discardCurrentStagedAsset(asset.ref.assetId, error));
      scenarioAssets.set(descriptor.blobPath, { asset, journalId: journal.journalId });
    }
    project.restoredScenarioAssets = scenarioAssets;
  }
}

async function discardCurrentStagedAsset(assetId: string, error: unknown): Promise<never> {
  try {
    await discardPreparedAsset(assetId);
  } catch (cleanupError) {
    throw new AggregateError(
      [error, cleanupError],
      'Project media staging failed before its ready journal became durable.',
      { cause: error }
    );
  }
  throw error;
}

async function prepareAggregatePresentations(
  prepared: PreparedProjectDomains,
  zip: JSZip
): Promise<void> {
  for (const project of prepared.videoProjects) {
    const descriptor = project.descriptor.presentation;
    if (descriptor?.entry.aggregateId !== project.descriptor.entry.id) continue;
    const presentation = await materializeAggregatePresentation({
      descriptor: {
        ...descriptor,
        entry: { ...descriptor.entry, aggregateId: project.projectId },
      },
      ref: { id: project.projectId, kind: 'video-project' },
      zip,
    });
    if (presentation) project.restoredPresentation = presentation;
  }
  for (const project of prepared.scenarioProjects) {
    const descriptor = project.descriptor.presentation;
    if (descriptor?.entry.aggregateId !== project.descriptor.entry.id) continue;
    const presentation = await materializeAggregatePresentation({
      descriptor: {
        ...descriptor,
        entry: { ...descriptor.entry, aggregateId: project.projectId },
      },
      ref: { id: project.projectId, kind: 'scenario' },
      zip,
    });
    if (presentation) project.restoredPresentation = presentation;
  }
}

async function materializeProjectBlobs(
  descriptors: Array<{ blobPath: string }>,
  zip: JSZip
): Promise<ReadonlyMap<string, Blob>> {
  const restoredBlobs = new Map<string, Blob>();
  for (const descriptor of descriptors) {
    if (restoredBlobs.has(descriptor.blobPath)) continue;
    restoredBlobs.set(
      descriptor.blobPath,
      await loadRequiredArchiveBlob({
        assetPath: descriptor.blobPath,
        filename: descriptor.blobPath,
        zip,
      })
    );
  }
  return restoredBlobs;
}

async function prepareEffectBundles(
  prepared: PreparedProjectDomains,
  restoredBlobs: ReadonlyMap<string, Blob>
): Promise<void> {
  for (const bundle of prepared.effectBundles) {
    const assets = [];
    for (const descriptor of bundle.descriptor.assets) {
      const archivedBlob = readRestoredBlob(restoredBlobs, descriptor.blobPath);
      if (archivedBlob.size !== descriptor.entry.byteLength) {
        throw new Error('EffectV1 catalog backup asset metadata does not match archived bytes.');
      }
      assets.push({
        ...descriptor.entry,
        blob: new Blob([archivedBlob], { type: descriptor.entry.mimeType }),
      });
    }
    const entry = parseEffectBundleCatalogEntry({
      ...bundle.descriptor.entry,
      assets,
      packId: bundle.packId,
    });
    if (!entry) throw new Error('Invalid restored EffectV1 catalog entry.');
    await assertEffectBundleCatalogIntegrity(entry);
    bundle.restoredEntry = entry;
  }
}

function assertPreparedProjectAssetsMetadataSafe(prepared: PreparedProjectDomains): void {
  for (const project of prepared.videoProjects) {
    for (const descriptor of project.descriptor.projectAssets) {
      assertPreparedProjectAssetMetadataSafe(descriptor);
    }
  }

  for (const project of prepared.scenarioProjects) {
    for (const descriptor of project.descriptor.assets) {
      assertPreparedScenarioAssetMetadataSafe(descriptor);
    }
  }
}

function assertPreparedProjectAssetMetadataSafe(
  descriptor: ProjectAssetBackupBlobDescriptor
): void {
  assertSafeProjectAssetStorageMetadata(descriptor.entry.size, descriptor.entry.mimeType);
}

export function assertPreparedScenarioAssetMetadataSafe(descriptor: BackupBlobDescriptor): void {
  const entry = descriptor.entry as Record<string, unknown>;
  const mimeType = entry['mimeType'];
  const size = entry['size'];
  if (typeof mimeType !== 'string') {
    throw new Error('Scenario asset backup entry MIME type is missing.');
  }
  if (typeof size !== 'number') {
    throw new Error('Scenario asset backup entry size is missing.');
  }

  assertSafeScenarioAssetStorageMetadata(size, mimeType);
  if (!parseScenarioAssetEntry({ ...entry, assetId: 'preflight-asset' })) {
    throw new Error('Invalid scenario asset backup entry.');
  }
}

async function prepareEffectProjectSnapshots(
  prepared: PreparedProjectDomains,
  restoredBlobs: ReadonlyMap<string, Blob>
): Promise<void> {
  for (const project of prepared.videoProjects) {
    const effectProject = project.descriptor.effectProject;
    if (!effectProject) continue;
    const restoredEffectSnapshots: VideoProjectEffectSnapshot[] = [];
    for (const snapshot of effectProject.snapshots) {
      const assets: VideoProjectEffectSnapshot['assets'] = [];
      for (const descriptor of snapshot.assets) {
        const archivedBlob = readRestoredBlob(restoredBlobs, descriptor.blobPath);
        if (archivedBlob.size !== descriptor.entry.byteLength) {
          throw new Error('EffectV1 backup asset metadata does not match archived bytes.');
        }
        const blob = new Blob([archivedBlob], { type: descriptor.entry.mimeType });
        assets.push({ ...descriptor.entry, blob });
      }
      restoredEffectSnapshots.push({ ...snapshot, assets });
    }
    const restoredProject = {
      ...project.descriptor.entry.project,
      effectInstances: effectProject.instances,
      effectSnapshots: restoredEffectSnapshots,
    };
    if (!isExportReadyVideoProject(restoredProject)) {
      throw new Error('Invalid restored EffectV1 video project.');
    }
    await verifyVideoProjectEffectSnapshotIntegrity(restoredProject);
    project.restoredEffectSnapshots = restoredEffectSnapshots;
  }
}

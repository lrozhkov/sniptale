import type JSZip from 'jszip';

import { verifyVideoProjectEffectSnapshotIntegrity } from '../../../../features/video/project/effect-instance';
import { parseEffectBundleCatalogEntry } from '../../../../composition/persistence/effect-bundles/entry';
import { assertEffectBundleCatalogIntegrity } from '../../../../composition/persistence/effect-bundles/integrity';
import type { VideoProjectEffectSnapshot } from '../../../../features/video/project/effect-instance/types';
import { isExportReadyVideoProject } from '../../../../features/video/project/validation';

import { parseScenarioAssetEntry } from '../../../../composition/persistence/scenario/read-guards';
import { translate } from '../../../../platform/i18n';
import { assertSafeProjectAssetStorageInput } from '../../../../features/media-hub/project-assets';
import { assertSafeScenarioAssetStorageInput } from '../../../../composition/persistence/scenario/projects/guards';
import type { BackupBlobDescriptor, ProjectAssetBackupBlobDescriptor } from '../../contracts/types';
import type { PreparedProjectDomains } from './prepare';
import { loadRequiredArchiveBlob } from '../prepare';
import { readRestoredBlob } from './helpers';
import { materializeAggregatePresentation } from '../presentation';
import {
  assertAssetWriteAdmission,
  createAssetPublicationJournal,
  discardPreparedAsset,
  writeBlobToAsset,
} from '../../../../composition/persistence/assets';
import {
  PROJECT_ASSET_PUBLICATION_DOMAIN,
  PROJECT_EXPORT_PUBLICATION_DOMAIN,
} from '../../../../composition/persistence/projects/asset-publication';
import type { PreparedRestoreRecordingAsset } from '../prepare';

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

  const restoredBlobs = await materializeProjectBlobs(descriptors, zip);
  await assertPreparedProjectAssetBlobsSafe(prepared, restoredBlobs);
  await prepareEffectProjectSnapshots(prepared, restoredBlobs);
  await prepareEffectBundles(prepared, restoredBlobs);
  await prepareAggregatePresentations(prepared, zip);
  prepared.restoredBlobs = restoredBlobs;
}

export async function stagePreparedProjectAssets(
  prepared: PreparedProjectDomains,
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
      const blob = readRestoredBlob(prepared.restoredBlobs, descriptor.blobPath);
      await assertAssetWriteAdmission(blob.size);
      const asset = await writeBlobToAsset(blob, { mimeType: descriptor.entry.mimeType });
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
      const blob = readRestoredBlob(prepared.restoredBlobs, descriptor.recording.blobPath);
      const entry = descriptor.recording.entry as Record<string, unknown>;
      const mimeType = typeof entry['mimeType'] === 'string' ? entry['mimeType'] : blob.type;
      await assertAssetWriteAdmission(blob.size);
      const asset = await writeBlobToAsset(blob, { mimeType: mimeType || 'video/webm' });
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

async function assertPreparedProjectAssetBlobsSafe(
  prepared: PreparedProjectDomains,
  restoredBlobs: ReadonlyMap<string, Blob>
): Promise<void> {
  for (const project of prepared.videoProjects) {
    for (const descriptor of project.descriptor.projectAssets) {
      assertPreparedProjectAssetBlobSafe(descriptor, restoredBlobs);
    }
  }

  for (const project of prepared.scenarioProjects) {
    for (const descriptor of project.descriptor.assets) {
      assertPreparedScenarioAssetBlobSafe(descriptor, restoredBlobs);
    }
  }
}

function assertPreparedProjectAssetBlobSafe(
  descriptor: ProjectAssetBackupBlobDescriptor,
  restoredBlobs: ReadonlyMap<string, Blob>
): void {
  const blob = readRestoredBlob(restoredBlobs, descriptor.blobPath);
  assertSafeProjectAssetStorageInput(blob, descriptor.entry.mimeType);
}

function assertPreparedScenarioAssetBlobSafe(
  descriptor: BackupBlobDescriptor,
  restoredBlobs: ReadonlyMap<string, Blob>
): void {
  const blob = readRestoredBlob(restoredBlobs, descriptor.blobPath);
  const entry = descriptor.entry as Record<string, unknown>;
  const mimeType = entry['mimeType'];
  const size = entry['size'];
  if (typeof mimeType !== 'string') {
    throw new Error('Scenario asset backup entry MIME type is missing.');
  }
  if (typeof size !== 'number' || size !== blob.size) {
    throw new Error('Scenario asset backup entry size does not match blob.');
  }

  assertSafeScenarioAssetStorageInput(blob, mimeType);
  if (!parseScenarioAssetEntry({ ...entry, blob })) {
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

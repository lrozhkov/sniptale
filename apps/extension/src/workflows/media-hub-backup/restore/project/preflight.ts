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
  prepared.restoredBlobs = restoredBlobs;
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

import { isScenarioProjectV3 } from '../../../features/scenario/project/v3';
import type {
  ScenarioElement,
  ScenarioProjectV3,
  ScenarioSlide,
} from '@sniptale/runtime-contracts/scenario/types/v3';
import type {
  BackupBlobDescriptor,
  EffectProjectBackupDescriptor,
  ScenarioBackupProjectDescriptor,
  VideoBackupProjectDescriptor,
} from '../contracts/types';
import type { VideoProjectEntry } from '../../../composition/persistence/projects/contracts';
import { hasValidVideoProjectBaseReferences } from '../../../features/video/project/validation/root';
import { hasValidEffectProjectReferences } from '../../../features/video/project/validation/effect-instances';

export function assertScenarioProjectDescriptorReferences(
  descriptor: ScenarioBackupProjectDescriptor
): void {
  const project = descriptor.entry.project;
  if (!isScenarioProjectV3(project)) {
    return;
  }

  const assetIds = new Set(descriptor.assets.flatMap((asset) => collectDescriptorId(asset.entry)));
  const documentIds = new Set(descriptor.stepDocuments.map((entry) => entry.stepId));
  for (const assetId of collectScenarioProjectV3AssetReferences(project)) {
    if (assetId && !assetIds.has(assetId)) {
      throw new Error('Invalid scenario project backup metadata.');
    }
  }
  for (const documentId of collectScenarioProjectV3DocumentReferences(project)) {
    if (!documentIds.has(documentId)) {
      throw new Error('Invalid scenario project backup metadata.');
    }
  }
}

export function assertVideoProjectDescriptorReferences(
  descriptor: VideoBackupProjectDescriptor
): void {
  const assetIds = new Set(
    descriptor.projectAssets.flatMap((asset) => collectDescriptorId(asset.entry))
  );
  for (const asset of descriptor.entry.project.assets) {
    if (asset.source.kind === 'project-asset' && !assetIds.has(asset.source.projectAssetId)) {
      throw new Error('Invalid video project backup metadata.');
    }
  }
}

export function assertVideoProjectEffectReferences(
  entry: VideoProjectEntry,
  effectProject: EffectProjectBackupDescriptor | undefined
): void {
  if (
    effectProject &&
    (entry.project.effectInstances !== undefined || entry.project.effectSnapshots !== undefined)
  ) {
    throw new Error('Invalid video project backup metadata.');
  }
  const effectInstances = effectProject?.instances ?? entry.project.effectInstances;
  const effectSnapshots = effectProject
    ? effectProject.snapshots.map(({ id, kind }) => ({ id, kind }))
    : entry.project.effectSnapshots;
  const effectReferenceModel = {
    clips: entry.project.clips,
    ...(effectInstances === undefined ? {} : { effectInstances }),
    ...(effectSnapshots === undefined ? {} : { effectSnapshots }),
    ...(entry.project.transitions === undefined ? {} : { transitions: entry.project.transitions }),
  };
  if (
    !hasValidVideoProjectBaseReferences(entry.project) ||
    !hasValidEffectProjectReferences(effectReferenceModel)
  ) {
    throw new Error('Invalid video project backup metadata.');
  }
}

function collectScenarioProjectV3AssetReferences(project: ScenarioProjectV3): string[] {
  return collectScenarioProjectV3Slides(project).flatMap((slide) => [
    ...(slide.source.kind === 'capture' ? [slide.source.assetId] : []),
    ...slide.elements.flatMap((element) =>
      element.kind === 'image' && element.assetRef.assetId ? [element.assetRef.assetId] : []
    ),
  ]);
}

function collectScenarioProjectV3DocumentReferences(project: ScenarioProjectV3): string[] {
  return collectScenarioProjectV3Slides(project).flatMap((slide) =>
    slide.elements.flatMap((element: ScenarioElement) =>
      element.kind === 'image' && element.editDocumentId ? [element.editDocumentId] : []
    )
  );
}

function collectScenarioProjectV3Slides(project: ScenarioProjectV3): ScenarioSlide[] {
  return [...project.slides, ...project.trash.map((entry) => entry.slide)];
}

function collectDescriptorId(entry: BackupBlobDescriptor['entry']): string[] {
  return 'id' in entry && typeof entry.id === 'string' ? [entry.id] : [];
}

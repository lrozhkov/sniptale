import type { PreparedScenarioProject, PreparedVideoProject } from './prepare';
import { remapId } from './ids';
import { remapScenarioProjectV3Entry } from './prepare-v3';
import type { ScenarioProjectEntry } from '../../../../composition/persistence/scenario/contracts';
import type { VideoProjectEntry } from '../../../../composition/persistence/projects/contracts';
import { assertSupportedScenarioBackupProjectEntry } from '../../metadata/scenario-project-version';

export function remapVideoProjectEntry(prepared: PreparedVideoProject): VideoProjectEntry {
  const effectProject = prepared.descriptor.effectProject;
  if (effectProject && !prepared.restoredEffectSnapshots) {
    throw new Error('EffectV1 backup preflight is incomplete.');
  }
  const restoredEffects = effectProject
    ? {
        effectInstances: effectProject.instances,
        effectSnapshots: prepared.restoredEffectSnapshots!,
      }
    : {};
  if (!prepared.idChanged && prepared.projectAssetIdMap.size === 0) {
    if (!effectProject) return prepared.descriptor.entry;
    return {
      ...prepared.descriptor.entry,
      project: { ...prepared.descriptor.entry.project, ...restoredEffects },
    };
  }

  return {
    ...prepared.descriptor.entry,
    id: prepared.idChanged ? prepared.projectId : prepared.descriptor.entry.id,
    project: {
      ...prepared.descriptor.entry.project,
      ...restoredEffects,
      assets: prepared.descriptor.entry.project.assets.map((asset) =>
        asset.source.kind === 'project-asset'
          ? {
              ...asset,
              source: {
                ...asset.source,
                projectAssetId: remapId(prepared.projectAssetIdMap, asset.source.projectAssetId),
              },
            }
          : asset
      ),
      id: prepared.idChanged ? prepared.projectId : prepared.descriptor.entry.project.id,
      name: prepared.idChanged
        ? `${prepared.descriptor.entry.project.name} Copy`
        : prepared.descriptor.entry.project.name,
    },
  };
}

export function remapScenarioProjectEntry(prepared: PreparedScenarioProject): ScenarioProjectEntry {
  const entry = prepared.descriptor.entry;
  assertSupportedScenarioBackupProjectEntry(entry);
  return remapScenarioProjectV3Entry(prepared);
}

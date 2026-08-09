import type { MediaLibraryEntry } from '../../../composition/persistence/media-library/contracts';
import type { ScenarioProjectEntry } from '../../../composition/persistence/scenario/contracts';
import type { VideoProjectEntry } from '../../../composition/persistence/projects/contracts';
import type { MediaHubBackupExportOptions } from '../contracts/types';

export function shouldExportMediaEntry(
  entry: Pick<MediaLibraryEntry, 'id' | 'lifecycle' | 'source'>,
  options: MediaHubBackupExportOptions,
  projectAssetIdsExportedWithProjects: ReadonlySet<string> = new Set()
): boolean {
  if (entry.lifecycle?.storageClass === 'temporary') return false;
  if (
    entry.source.kind === 'project-asset' &&
    projectAssetIdsExportedWithProjects.has(entry.source.projectAssetId)
  ) {
    return false;
  }
  if (!options.includeWebSnapshots && entry.source.kind === 'web-snapshot') {
    return false;
  }

  if (options.scope !== 'selected') {
    return true;
  }

  return options.selected?.mediaAssetIds.includes(entry.id) === true;
}

export function shouldExportVideoProject(
  entry: Pick<VideoProjectEntry, 'id' | 'lifecycle'>,
  options: MediaHubBackupExportOptions
): boolean {
  if (entry.lifecycle?.storageClass === 'temporary') return false;
  if (options.scope !== 'selected') {
    return true;
  }

  return options.selected?.videoProjectIds.includes(entry.id) === true;
}

export function shouldExportScenarioProject(
  entry: Pick<ScenarioProjectEntry, 'id' | 'lifecycle'>,
  options: MediaHubBackupExportOptions
): boolean {
  if (entry.lifecycle?.storageClass === 'temporary') return false;
  if (options.scope !== 'selected') {
    return true;
  }

  return options.selected?.scenarioProjectIds.includes(entry.id) === true;
}

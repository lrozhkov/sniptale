import type { MediaLibraryEntry } from '../../../composition/persistence/media-library/contracts';
import type { ScenarioProjectEntry } from '../../../composition/persistence/scenario/contracts';
import type { VideoProjectEntry } from '../../../composition/persistence/projects/contracts';
import type { MediaHubBackupExportOptions } from '../contracts/types';

export function shouldExportMediaEntry(
  entry: Pick<MediaLibraryEntry, 'id' | 'source'>,
  options: MediaHubBackupExportOptions
): boolean {
  if (!options.includeWebSnapshots && entry.source.kind === 'web-snapshot') {
    return false;
  }

  if (options.scope !== 'selected') {
    return true;
  }

  return options.selected?.mediaAssetIds.includes(entry.id) === true;
}

export function shouldExportVideoProject(
  entry: Pick<VideoProjectEntry, 'id'>,
  options: MediaHubBackupExportOptions
): boolean {
  if (options.scope !== 'selected') {
    return true;
  }

  return options.selected?.videoProjectIds.includes(entry.id) === true;
}

export function shouldExportScenarioProject(
  entry: Pick<ScenarioProjectEntry, 'id'>,
  options: MediaHubBackupExportOptions
): boolean {
  if (options.scope !== 'selected') {
    return true;
  }

  return options.selected?.scenarioProjectIds.includes(entry.id) === true;
}

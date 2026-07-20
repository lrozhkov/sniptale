import { listScenarioExports, saveScenarioExport } from '../../projects';
import type { ScenarioExportEntry as DbScenarioExportEntry } from '../../contracts';
import { publishMediaHubLibraryChanged } from '../../../../../features/media-hub/events';
import type { ScenarioExportEntry } from '@sniptale/runtime-contracts/scenario/types/session';
import type { ScenarioExportFormat } from '@sniptale/runtime-contracts/scenario/types/base';
import { mapScenarioExportEntry } from './helpers';

/**
 * Persists an export audit entry for a scenario project.
 */
export async function saveScenarioExportRecord(args: {
  projectId: string;
  format: ScenarioExportFormat;
  filename: string;
  size: number;
}): Promise<ScenarioExportEntry> {
  const entry: DbScenarioExportEntry = {
    id: crypto.randomUUID(),
    projectId: args.projectId,
    format: args.format,
    filename: args.filename,
    createdAt: Date.now(),
    size: args.size,
  };

  await saveScenarioExport(entry);
  publishMediaHubLibraryChanged('create', [`scenario-export:${entry.id}`]);
  return mapScenarioExportEntry(entry);
}

/**
 * Lists prior exports for a scenario project.
 */
export async function listScenarioExportRecords(projectId: string): Promise<ScenarioExportEntry[]> {
  const entries = await listScenarioExports(projectId);
  return entries
    .slice()
    .sort((left, right) => right.createdAt - left.createdAt)
    .map(mapScenarioExportEntry);
}

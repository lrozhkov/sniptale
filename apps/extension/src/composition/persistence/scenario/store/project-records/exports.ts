import { listScenarioExports, saveScenarioExport } from '../../projects';
import type { ScenarioExportEntry as DbScenarioExportEntry } from '../../contracts';
import { publishMediaHubLibraryChanged } from '../../../../../features/media-hub/events';
import type { ScenarioExportEntry } from '@sniptale/runtime-contracts/scenario/types/session';
import type { ScenarioExportFormat } from '@sniptale/runtime-contracts/scenario/types/base';
import { mapScenarioExportEntry } from './helpers';
import { renameScenarioHtmlExport } from '../../projects/exports';
import { saveScenarioHtmlArtifact } from '../../export-artifacts';
import type { AssetRef } from '../../../assets';

/** Renames only the selected HTML catalogue record after an authoritative transaction. */
export async function renameScenarioHtmlExportRecord(id: string, filename: string): Promise<void> {
  await renameScenarioHtmlExport(id, filename);
  publishMediaHubLibraryChanged('update', [`scenario-export:${id}`]);
}

/**
 * Persists an export audit entry for a scenario project.
 */
export async function saveScenarioExportRecord(args: {
  projectId: string;
  format: ScenarioExportFormat;
  filename: string;
  size: number;
  html?: { mode: 'guide' | 'tour'; ref: AssetRef };
}): Promise<ScenarioExportEntry> {
  const entry: DbScenarioExportEntry = {
    id: crypto.randomUUID(),
    projectId: args.projectId,
    format: args.format,
    filename: args.filename,
    createdAt: Date.now(),
    size: args.size,
    ...(args.html ? { html: { mode: args.html.mode, assetId: args.html.ref.assetId } } : {}),
  };

  if (args.html) await saveScenarioHtmlArtifact(entry, args.html.ref);
  else await saveScenarioExport(entry);
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

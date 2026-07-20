import type {
  ScenarioAssetEntry,
  ScenarioExportEntry,
} from '@sniptale/runtime-contracts/scenario/types/session';
import type {
  ScenarioAssetEntry as DbScenarioAssetEntry,
  ScenarioExportEntry as DbScenarioExportEntry,
} from '../../contracts';

export function createScenarioAssetId(): string {
  return crypto.randomUUID();
}

export function mapScenarioAssetEntry(entry: DbScenarioAssetEntry): ScenarioAssetEntry {
  return {
    id: entry.id,
    projectId: entry.projectId,
    galleryAssetId: entry.galleryAssetId,
    mimeType: entry.mimeType,
    width: entry.width,
    height: entry.height,
    size: entry.size,
    createdAt: entry.createdAt,
  };
}

export function mapScenarioExportEntry(entry: DbScenarioExportEntry): ScenarioExportEntry {
  return {
    id: entry.id,
    projectId: entry.projectId,
    format: entry.format,
    filename: entry.filename,
    createdAt: entry.createdAt,
    size: entry.size,
  };
}

import { translate } from '../../../platform/i18n';
import { createMediaHubBackupExportOptions } from '../export/options';
import type { MediaHubBackupManifest, MediaHubBackupSelectedScope } from '../contracts/types';
import { readManifestBoolean, readManifestRecord, readManifestString } from './readers';

function parseBackupSelectedIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new Error(translate('shared.mediaHub.backupInvalidArchive'));
  }

  return value.map(readManifestString);
}

function parseBackupSelectedScope(value: unknown): MediaHubBackupSelectedScope | undefined {
  if (value === undefined) {
    return undefined;
  }

  const record = readManifestRecord(value);
  return {
    mediaAssetIds: parseBackupSelectedIds(record['mediaAssetIds']),
    scenarioProjectIds: parseBackupSelectedIds(record['scenarioProjectIds']),
    videoProjectIds: parseBackupSelectedIds(record['videoProjectIds']),
  };
}

function parseBackupDataClassFlags(value: unknown): MediaHubBackupManifest['dataClasses'] {
  if (value === undefined) {
    return undefined;
  }

  const record = readManifestRecord(value);
  return {
    editorDrafts: readManifestBoolean(record['editorDrafts']),
    mediaAssets: readManifestBoolean(record['mediaAssets']),
    recordings: readManifestBoolean(record['recordings']),
    scenarioProjects: readManifestBoolean(record['scenarioProjects']),
    sourceMetadata: readManifestBoolean(record['sourceMetadata']),
    telemetry: readManifestBoolean(record['telemetry']),
    thumbnails: readManifestBoolean(record['thumbnails']),
    videoProjects: readManifestBoolean(record['videoProjects']),
    webSnapshots: readManifestBoolean(record['webSnapshots']),
  };
}

function parseBackupPrivacyOptions(value: unknown): MediaHubBackupManifest['privacyOptions'] {
  if (value === undefined) {
    return undefined;
  }

  const record = readManifestRecord(value);
  const scope = readManifestString(record['scope']);
  if (scope !== 'all' && scope !== 'selected') {
    throw new Error(translate('shared.mediaHub.backupInvalidArchive'));
  }

  const selected = parseBackupSelectedScope(record['selected']);
  return createMediaHubBackupExportOptions({
    scope,
    ...(selected === undefined ? {} : { selected }),
    includeEditorDrafts: readManifestBoolean(record['includeEditorDrafts']),
    includeSourceMetadata: readManifestBoolean(record['includeSourceMetadata']),
    includeTelemetry: readManifestBoolean(record['includeTelemetry']),
    includeWebSnapshots: readManifestBoolean(record['includeWebSnapshots']),
  });
}

export function parseBackupManifestPrivacyFields(
  manifest: Record<string, unknown>
): Partial<Pick<MediaHubBackupManifest, 'dataClasses' | 'privacyOptions'>> {
  const dataClasses = parseBackupDataClassFlags(manifest['dataClasses']);
  const privacyOptions = parseBackupPrivacyOptions(manifest['privacyOptions']);

  return {
    ...(dataClasses === undefined ? {} : { dataClasses }),
    ...(privacyOptions === undefined ? {} : { privacyOptions }),
  };
}

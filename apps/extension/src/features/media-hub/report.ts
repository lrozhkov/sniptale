import { translate } from '../../platform/i18n';

import type { StorageCleanupCandidate, StorageCleanupGroup, StorageCleanupReport } from './types';
import { sumBytes } from '../../workflows/media-hub/cleanup';

type TranslationKey = Parameters<typeof translate>[0];

type CleanupCandidates = {
  brokenMediaMirrors?: StorageCleanupCandidate[];
  orphanedRawRecordings: StorageCleanupCandidate[];
  orphanedProjectAssets?: StorageCleanupCandidate[];
  orphanedScenarioArtifacts?: StorageCleanupCandidate[];
  orphanedScenarioPendingAssets?: StorageCleanupCandidate[];
  orphanedThumbnails?: StorageCleanupCandidate[];
  heavyFiles: StorageCleanupCandidate[];
  oldScreenshots: StorageCleanupCandidate[];
  oldDiagnostics?: StorageCleanupCandidate[];
  staleEditorDrafts?: StorageCleanupCandidate[];
};

type CleanupReportParams = CleanupCandidates & {
  topN?: number;
};

type NormalizedCleanupReportParams = Required<CleanupCandidates> & {
  topN: number;
};

interface CleanupGroupConfig {
  descriptionKey: TranslationKey;
  id: StorageCleanupGroup['id'];
  irreversibleKey: TranslationKey;
  itemsKey: keyof CleanupCandidates;
  titleKey: TranslationKey;
}

const CLEANUP_GROUP_CONFIGS: CleanupGroupConfig[] = [
  createCleanupGroupConfig(
    'orphaned-raw-recordings',
    'orphanedRecordings',
    'orphanedRawRecordings'
  ),
  createCleanupGroupConfig(
    'orphaned-project-assets',
    'orphanedProjectAssets',
    'orphanedProjectAssets'
  ),
  createCleanupGroupConfig('broken-media-mirrors', 'brokenMediaMirrors', 'brokenMediaMirrors'),
  createCleanupGroupConfig('heavy-files', 'heavyFiles', 'heavyFiles'),
  createCleanupGroupConfig('old-screenshots', 'oldScreenshots', 'oldScreenshots'),
  createCleanupGroupConfig('orphaned-thumbnails', 'orphanedThumbnails', 'orphanedThumbnails'),
  createCleanupGroupConfig('stale-editor-drafts', 'staleEditorDrafts', 'staleEditorDrafts'),
  createCleanupGroupConfig(
    'orphaned-scenario-pending-assets',
    'orphanedScenarioPendingAssets',
    'orphanedScenarioPendingAssets'
  ),
  createCleanupGroupConfig(
    'orphaned-scenario-artifacts',
    'orphanedScenarioArtifacts',
    'orphanedScenarioArtifacts'
  ),
  createCleanupGroupConfig('old-diagnostics', 'oldDiagnostics', 'oldDiagnostics'),
];

export function buildStorageCleanupReport(params: CleanupReportParams): StorageCleanupReport {
  const normalizedParams = normalizeCleanupReportParams(params);
  const groups = CLEANUP_GROUP_CONFIGS.map((config) =>
    createCleanupGroup(config, normalizedParams)
  );

  const potentialBytes = groups.reduce((total, group) => total + group.potentialBytes, 0);

  return {
    groups,
    potentialBytes,
  };
}

function createCleanupGroup(
  config: CleanupGroupConfig,
  params: NormalizedCleanupReportParams
): StorageCleanupGroup {
  const items = params[config.itemsKey];

  return {
    id: config.id,
    title: translate(config.titleKey),
    description: getCleanupGroupDescription(config, params.topN),
    irreversibleLabel: translate(config.irreversibleKey),
    potentialBytes: sumBytes(items),
    items,
  };
}

function createCleanupGroupConfig(
  id: StorageCleanupGroup['id'],
  keyPrefix: string,
  itemsKey: keyof CleanupCandidates
): CleanupGroupConfig {
  return {
    descriptionKey: `shared.mediaHub.${keyPrefix}Description` as TranslationKey,
    id,
    irreversibleKey: `shared.mediaHub.${keyPrefix}Irreversible` as TranslationKey,
    itemsKey,
    titleKey: `shared.mediaHub.${keyPrefix}Title` as TranslationKey,
  };
}

function getCleanupGroupDescription(config: CleanupGroupConfig, topN: number): string {
  if (config.id !== 'heavy-files') {
    return translate(config.descriptionKey);
  }

  return `${translate('shared.mediaHub.heavyFilesDescriptionPrefix')}${topN}${translate(
    'shared.mediaHub.heavyFilesDescriptionSuffix'
  )}`;
}

function normalizeCleanupReportParams(params: CleanupReportParams): NormalizedCleanupReportParams {
  return {
    brokenMediaMirrors: params.brokenMediaMirrors ?? [],
    heavyFiles: params.heavyFiles,
    oldDiagnostics: params.oldDiagnostics ?? [],
    oldScreenshots: params.oldScreenshots,
    orphanedProjectAssets: params.orphanedProjectAssets ?? [],
    orphanedRawRecordings: params.orphanedRawRecordings,
    orphanedScenarioArtifacts: params.orphanedScenarioArtifacts ?? [],
    orphanedScenarioPendingAssets: params.orphanedScenarioPendingAssets ?? [],
    orphanedThumbnails: params.orphanedThumbnails ?? [],
    staleEditorDrafts: params.staleEditorDrafts ?? [],
    topN: params.topN ?? 10,
  };
}

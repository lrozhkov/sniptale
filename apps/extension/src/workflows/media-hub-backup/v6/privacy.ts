import { isPlainRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { RecordingMetadata } from '../../../features/media-hub/recording-metadata';
import { sanitizeProvenanceUrl } from '@sniptale/platform/security/provenance-url';
import type { MediaLibraryEntry } from '../../../composition/persistence/media-library/contracts';
import type { RecordingGroupMember } from '../../../features/media-hub/recording-groups';
import type { StoredImageWorkspaceEntry } from '../../../composition/persistence/image-workspaces/contracts';
import type { PersistedEditorDocument } from '../../../composition/persistence/document-assets';
import { getTourImages } from '../../../features/scenario/project/public';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import type { ScenarioProjectEntry } from '../../../composition/persistence/scenario/contracts';
import type { ScenarioPageDescriptor } from '@sniptale/runtime-contracts/scenario/types/geometry';
import type { MediaHubBackupExportOptions, MediaHubBackupPrivacyFlags } from './contracts';

export function projectRecordingGroupMemberPrivacy(
  member: RecordingGroupMember,
  options: MediaHubBackupExportOptions
): RecordingGroupMember {
  return {
    ...member,
    sourceFavicon: options.includeSourceMetadata
      ? sanitizeProvenanceUrl(member.sourceFavicon)
      : null,
    sourceLabel: options.includeSourceMetadata ? member.sourceLabel : null,
    sourceUrl: options.includeSourceMetadata ? sanitizeProvenanceUrl(member.sourceUrl) : null,
  };
}

export function projectMediaEntryPrivacy(
  entry: Omit<MediaLibraryEntry, 'blob'>,
  options: MediaHubBackupExportOptions
): Omit<MediaLibraryEntry, 'blob'> {
  const { recordingMetadata, ...metadata } = entry;
  return {
    ...metadata,
    ...projectRecordingMetadataPrivacy(recordingMetadata, options),
    ...(entry.recordingGroup
      ? { recordingGroup: projectRecordingGroupMemberPrivacy(entry.recordingGroup, options) }
      : {}),
    sourceFavicon: options.includeSourceMetadata
      ? sanitizeProvenanceUrl(entry.sourceFavicon)
      : null,
    sourceTitle: options.includeSourceMetadata ? entry.sourceTitle : null,
    sourceUrl: options.includeSourceMetadata ? sanitizeProvenanceUrl(entry.sourceUrl) : null,
  };
}

export function projectStoredEditorDocumentPrivacy(
  document: PersistedEditorDocument,
  options: MediaHubBackupExportOptions
): PersistedEditorDocument {
  const browserFrame = document.browserFrame
    ? {
        ...document.browserFrame,
        favicon: options.includeSourceMetadata ? document.browserFrame.favicon : null,
        faviconSource: options.includeSourceMetadata
          ? document.browserFrame.faviconSource
          : undefined,
        title: options.includeSourceMetadata ? document.browserFrame.title : '',
        url: options.includeSourceMetadata
          ? (sanitizeProvenanceUrl(document.browserFrame.url) ?? '')
          : '',
      }
    : undefined;
  const excludedFaviconAssetId =
    options.includeSourceMetadata || !document.browserFrame?.favicon
      ? null
      : document.browserFrame.favicon.assetId;
  return {
    ...document,
    assets: document.assets.filter(
      (asset) =>
        excludedFaviconAssetId === null ||
        asset.role !== 'browser-favicon' ||
        asset.assetId !== excludedFaviconAssetId
    ),
    ...(browserFrame ? { browserFrame } : {}),
    frame: {
      ...document.frame,
      browserTitle: options.includeSourceMetadata ? document.frame.browserTitle : '',
      browserUrl: options.includeSourceMetadata
        ? (sanitizeProvenanceUrl(document.frame.browserUrl) ?? '')
        : '',
    },
  };
}

export function projectImageWorkspacePrivacy(
  workspace: StoredImageWorkspaceEntry,
  options: MediaHubBackupExportOptions
): StoredImageWorkspaceEntry {
  const { publicationId: _publicationId, ...metadata } = workspace;
  return {
    ...metadata,
    document: projectStoredEditorDocumentPrivacy(workspace.document, options),
    sourceTitle: options.includeSourceMetadata ? workspace.sourceTitle : null,
    sourceUrl: options.includeSourceMetadata ? sanitizeProvenanceUrl(workspace.sourceUrl) : null,
  };
}

export function projectScenarioPrivacy(
  entry: ScenarioProjectEntry,
  options: MediaHubBackupExportOptions
): ScenarioProjectEntry {
  return {
    ...entry,
    project: projectGuidePrivacy(entry.project, options),
    ...(entry.editingHistory
      ? {
          editingHistory: {
            version: 1,
            past: entry.editingHistory.past.map((project) => projectGuidePrivacy(project, options)),
            future: entry.editingHistory.future.map((project) =>
              projectGuidePrivacy(project, options)
            ),
          },
        }
      : {}),
    ...(entry.history
      ? {
          history: entry.history.map((version) => ({
            ...version,
            project: projectGuidePrivacy(version.project, options),
          })),
        }
      : {}),
  };
}

function projectGuidePrivacy(
  project: GuideProject,
  options: MediaHubBackupExportOptions
): GuideProject {
  const tour = project.tour ? structuredClone(project.tour) : undefined;
  if (tour) {
    for (const image of getTourImages(tour)) {
      if (image.source.kind === 'capture')
        image.source.page = projectScenarioPagePrivacy(image.source.page, options);
    }
  }
  return {
    ...project,
    ...(tour ? { tour } : {}),
    items: project.items.map((item) =>
      item.kind !== 'step'
        ? item
        : {
            ...item,
            blocks: item.blocks.map((block) =>
              block.kind !== 'image' || block.source.kind !== 'capture'
                ? block
                : {
                    ...block,
                    source: {
                      ...block.source,
                      page: projectScenarioPagePrivacy(block.source.page, options),
                    },
                  }
            ),
          }
    ),
  };
}

function projectScenarioPagePrivacy(
  page: ScenarioPageDescriptor,
  options: MediaHubBackupExportOptions
): ScenarioPageDescriptor {
  return {
    ...page,
    title: options.includeSourceMetadata ? page.title : null,
    url: options.includeSourceMetadata ? sanitizeProvenanceUrl(page.url) : null,
  };
}

/** Acquisition snapshots follow the existing opt-in for recording activity in explicit backups. */
export function projectRecordingMetadataPrivacy(
  recordingMetadata: RecordingMetadata | undefined,
  options: MediaHubBackupExportOptions
): { recordingMetadata?: RecordingMetadata } {
  return options.includeTelemetry && recordingMetadata ? { recordingMetadata } : {};
}

/** Applies source privacy to encoded history without expanding pooled drawings or raster bytes. */
export function projectImageHistorySnapshotPrivacy(
  snapshot: string,
  options: MediaHubBackupPrivacyFlags
): string {
  const value: unknown = JSON.parse(snapshot);
  if (!isPlainRecord(value) || !isPlainRecord(value['frame']))
    throw new Error('Image history snapshot metadata is invalid.');
  const frame = value['frame'];
  const browserFrame = value['browserFrame'];
  if (typeof frame['browserTitle'] !== 'string' || typeof frame['browserUrl'] !== 'string')
    throw new Error('Image history frame metadata is invalid.');
  if (browserFrame !== undefined && !isPlainRecord(browserFrame))
    throw new Error('Image history browser metadata is invalid.');
  if (
    browserFrame &&
    (typeof browserFrame['title'] !== 'string' || typeof browserFrame['url'] !== 'string')
  )
    throw new Error('Image history browser metadata is invalid.');
  return JSON.stringify({
    ...value,
    frame: {
      ...frame,
      browserTitle: options.includeSourceMetadata ? frame['browserTitle'] : '',
      browserUrl: options.includeSourceMetadata
        ? (sanitizeProvenanceUrl(frame['browserUrl']) ?? '')
        : '',
    },
    ...(browserFrame
      ? {
          browserFrame: {
            ...browserFrame,
            title: options.includeSourceMetadata ? browserFrame['title'] : '',
            url: options.includeSourceMetadata
              ? (sanitizeProvenanceUrl(
                  typeof browserFrame['url'] === 'string' ? browserFrame['url'] : null
                ) ?? '')
              : '',
            faviconDataUrl: options.includeSourceMetadata ? browserFrame['faviconDataUrl'] : null,
            faviconSource: options.includeSourceMetadata
              ? browserFrame['faviconSource']
              : undefined,
          },
        }
      : {}),
  });
}

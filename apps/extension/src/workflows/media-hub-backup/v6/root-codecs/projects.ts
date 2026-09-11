import type {
  StoredProjectAssetEntry,
  StoredProjectExportEntry,
  VideoProjectEntry,
} from '../../../../composition/persistence/projects/contracts';
import type {
  ScenarioAssetEntry,
  ScenarioExportEntry,
  ScenarioProjectEntry,
  StoredScenarioStepEditorDocumentEntry,
} from '../../../../composition/persistence/scenario/contracts';
import type { VideoProjectEffectSnapshot } from '../../../../features/video/project/effect-instance/types';
import type { PortableEditorDocumentV3 } from './editor-document';
import type { PortableAggregatePresentation, PortableMediaThumbnail } from './media';
import {
  SCENARIO_HISTORY_LIMIT,
  SCENARIO_HISTORY_BYTE_LIMIT,
  parseScenarioSavedVersions,
} from '../../../../composition/persistence/scenario/history-model';
import { GUIDE_LIMITS, type GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import { parseGuideProject } from '@sniptale/runtime-contracts/scenario/guide-parser';
import type { JsonValue } from '../contracts';
import {
  parsePortableVideoReview,
  type PortableVideoReview,
} from '../../../../composition/persistence/review-workspaces/backup-restore';

/** Portable image keys add eight bytes per image; array separators add one per version. */
export const MAX_PORTABLE_SCENARIO_HISTORY_BYTES =
  SCENARIO_HISTORY_BYTE_LIMIT +
  SCENARIO_HISTORY_LIMIT * GUIDE_LIMITS.maxItems * GUIDE_LIMITS.maxBlocksPerStep * 8 +
  SCENARIO_HISTORY_LIMIT +
  1;

interface PortableProjectAsset {
  entry: Omit<StoredProjectAssetEntry, 'assetId'>;
  filename: string;
  objectId: string;
  videoReview?: PortableVideoReview;
}

interface PortableProjectExport {
  entry: Omit<StoredProjectExportEntry, 'assetId'>;
  objectId: string;
  thumbnail?: PortableMediaThumbnail;
  videoReview?: PortableVideoReview;
}

interface PortableEffectSnapshot extends Omit<VideoProjectEffectSnapshot, 'assets'> {
  assets: Array<Omit<VideoProjectEffectSnapshot['assets'][number], 'blob'> & { objectId: string }>;
}

export interface PortableVideoProjectMetadata {
  entry: Omit<VideoProjectEntry, 'project'> & {
    project: Omit<VideoProjectEntry['project'], 'effectSnapshots'> & {
      effectSnapshots?: PortableEffectSnapshot[];
    };
  };
  presentation?: PortableAggregatePresentation;
  projectAssets: PortableProjectAsset[];
  projectExports: PortableProjectExport[];
  thumbnail?: PortableMediaThumbnail;
}

interface PortableScenarioAsset {
  entry: Omit<ScenarioAssetEntry, 'assetId'>;
  objectId: string;
}

interface PortableScenarioStepDocument extends Omit<
  StoredScenarioStepEditorDocumentEntry,
  'document'
> {
  document: PortableEditorDocumentV3;
}

interface PortableScenarioSavedVersion {
  revision: number;
  savedAt: number;
  project: JsonValue;
}
type EncodedScenarioProjectEntry = PortableScenarioProjectMetadata['entry'] & {
  history?: PortableScenarioSavedVersion[];
};

export interface PortableScenarioProjectMetadata {
  assets: PortableScenarioAsset[];
  entry: Omit<ScenarioProjectEntry, 'project' | 'history'> & {
    project: JsonValue;
  };
  historyObjectId?: string;
  exportThumbnails: Array<{ exportId: string; thumbnail: PortableMediaThumbnail }>;
  exports: ScenarioExportEntry[];
  presentation?: PortableAggregatePresentation;
  stepDocuments: PortableScenarioStepDocument[];
  thumbnail?: PortableMediaThumbnail;
}

export function encodePortableScenarioProjectEntry(
  entry: ScenarioProjectEntry
): EncodedScenarioProjectEntry {
  const versions = parseScenarioSavedVersions(
    entry.history,
    entry.id,
    entry.workspaceRevision,
    entry.project.updatedAt
  );
  if (!versions) throw new Error('Saved guide history is invalid.');
  const { history: _history, ...rest } = entry;
  return {
    ...rest,
    project: encodePortableGuideProject(entry.project),
    ...(versions.length
      ? {
          history: versions.map((version) => ({
            ...version,
            project: encodePortableGuideProject(version.project),
          })),
        }
      : {}),
  };
}

function encodePortableGuideProject(value: GuideProject): JsonValue {
  const parsed = parseGuideProject(value);
  if (parsed.status !== 'ok') throw new Error('Only current guide projects can be exported.');
  const project = {
    ...parsed.project,
    items: parsed.project.items.map((item) =>
      item.kind !== 'step'
        ? item
        : {
            ...item,
            blocks: item.blocks.map((block) => {
              if (block.kind !== 'image') return block;
              const { assetId, ...rest } = block;
              return { ...rest, scenarioAssetId: assetId };
            }),
          }
    ),
  };
  if (!isJsonValue(project)) throw new Error('Portable guide is not JSON data.');
  return project;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertPortableProjectBase(
  value: unknown,
  kind: 'video' | 'scenario'
): asserts value is Record<string, unknown> {
  if (!isRecord(value) || !isRecord(value['entry']) || typeof value['entry']['id'] !== 'string') {
    throw new Error(`Portable ${kind} project metadata is invalid.`);
  }
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return true;
  }
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

function isPortableThumbnail(value: unknown): value is PortableMediaThumbnail {
  return isRecord(value) && typeof value['objectId'] === 'string';
}

function isPortablePresentation(value: unknown): value is PortableAggregatePresentation {
  return (
    isRecord(value) &&
    isRecord(value['entry']) &&
    typeof value['thumbnailObjectId'] === 'string' &&
    (value['previewObjectId'] === undefined || typeof value['previewObjectId'] === 'string')
  );
}

function isPortableProjectAsset(value: unknown): value is PortableProjectAsset {
  return (
    isRecord(value) &&
    isRecord(value['entry']) &&
    !('assetId' in value['entry']) &&
    typeof value['entry']['id'] === 'string' &&
    typeof value['filename'] === 'string' &&
    typeof value['objectId'] === 'string'
  );
}

function isPortableProjectExport(value: unknown): value is PortableProjectExport {
  return (
    isRecord(value) &&
    isRecord(value['entry']) &&
    !('assetId' in value['entry']) &&
    typeof value['entry']['id'] === 'string' &&
    typeof value['objectId'] === 'string' &&
    (value['thumbnail'] === undefined || isPortableThumbnail(value['thumbnail']))
  );
}

function isPortableScenarioAsset(value: unknown): value is PortableScenarioAsset {
  return (
    isRecord(value) &&
    isRecord(value['entry']) &&
    !('assetId' in value['entry']) &&
    typeof value['entry']['id'] === 'string' &&
    typeof value['objectId'] === 'string'
  );
}

function isPortableStepDocument(value: unknown): value is PortableScenarioStepDocument {
  return (
    isRecord(value) &&
    typeof value['projectId'] === 'string' &&
    typeof value['stepId'] === 'string' &&
    isRecord(value['document']) &&
    Array.isArray(value['document']['assets'])
  );
}

function hasOptionalPortableSidecars(value: Record<string, unknown>): boolean {
  return (
    (value['thumbnail'] === undefined || isPortableThumbnail(value['thumbnail'])) &&
    (value['presentation'] === undefined || isPortablePresentation(value['presentation']))
  );
}

function isPortableVideoProjectMetadata(value: unknown): value is PortableVideoProjectMetadata {
  return (
    isRecord(value) &&
    isRecord(value['entry']) &&
    typeof value['entry']['id'] === 'string' &&
    isRecord(value['entry']['project']) &&
    Array.isArray(value['projectAssets']) &&
    value['projectAssets'].every(isPortableProjectAsset) &&
    Array.isArray(value['projectExports']) &&
    value['projectExports'].every(isPortableProjectExport) &&
    hasOptionalPortableSidecars(value)
  );
}

/** Admits the bounded history object before its project/image references are remapped. */
export function decodePortableScenarioHistory(
  value: unknown,
  projectId: string
): PortableScenarioSavedVersion[] {
  if (!isPortableScenarioHistory(value, projectId))
    throw new Error('Portable guide history is invalid.');
  return value;
}

function isPortableScenarioHistory(
  value: unknown,
  projectId: string
): value is PortableScenarioSavedVersion[] {
  return (
    Array.isArray(value) &&
    value.length <= SCENARIO_HISTORY_LIMIT &&
    value.every(
      (version) =>
        isRecord(version) &&
        typeof version['revision'] === 'number' &&
        Number.isSafeInteger(version['revision']) &&
        version['revision'] >= 0 &&
        typeof version['savedAt'] === 'number' &&
        Number.isFinite(version['savedAt']) &&
        isRecord(version['project']) &&
        version['project']['id'] === projectId &&
        isJsonValue(version['project'])
    ) &&
    new TextEncoder().encode(JSON.stringify(value)).byteLength <=
      MAX_PORTABLE_SCENARIO_HISTORY_BYTES
  );
}

function isPortableScenarioProjectMetadata(
  value: unknown
): value is PortableScenarioProjectMetadata {
  return (
    isRecord(value) &&
    isRecord(value['entry']) &&
    typeof value['entry']['id'] === 'string' &&
    isJsonValue(value['entry']['project']) &&
    value['entry']['history'] === undefined &&
    (value['historyObjectId'] === undefined ||
      (typeof value['historyObjectId'] === 'string' &&
        value['historyObjectId'].length > 0 &&
        value['historyObjectId'].length <= 160)) &&
    Array.isArray(value['assets']) &&
    value['assets'].every(isPortableScenarioAsset) &&
    Array.isArray(value['exports']) &&
    value['exports'].every(isRecord) &&
    Array.isArray(value['exportThumbnails']) &&
    value['exportThumbnails'].every(
      (item) =>
        isRecord(item) &&
        typeof item['exportId'] === 'string' &&
        isPortableThumbnail(item['thumbnail'])
    ) &&
    Array.isArray(value['stepDocuments']) &&
    value['stepDocuments'].every(isPortableStepDocument) &&
    hasOptionalPortableSidecars(value)
  );
}

export function parsePortableVideoProjectMetadata(value: unknown): PortableVideoProjectMetadata {
  assertPortableProjectBase(value, 'video');
  if (!isPortableVideoProjectMetadata(value)) {
    throw new Error('Portable video project children are invalid.');
  }
  const projectAssets = value.projectAssets.map((asset) => {
    if (asset.videoReview === undefined) return asset;
    if (typeof asset.entry.mimeType !== 'string' || !asset.entry.mimeType.startsWith('video/'))
      throw new Error('Video review requires video media.');
    const videoReview = parsePortableVideoReview(
      asset.videoReview,
      `project-asset:${asset.entry.id}`
    );
    if (videoReview.workspace.source.size !== asset.entry.size)
      throw new Error('Video review source size is inconsistent.');
    return { ...asset, videoReview };
  });
  const projectExports = value.projectExports.map((item) => {
    if (item.videoReview === undefined) return item;
    if (!(item.entry.mimeType ?? 'video/webm').startsWith('video/'))
      throw new Error('Video review requires video media.');
    const videoReview = parsePortableVideoReview(item.videoReview, `export:${item.entry.id}`);
    if (videoReview.workspace.source.size !== item.entry.size)
      throw new Error('Video review source size is inconsistent.');
    return { ...item, videoReview };
  });
  return { ...value, projectAssets, projectExports };
}

export function parsePortableScenarioProjectMetadata(
  value: unknown
): PortableScenarioProjectMetadata {
  assertPortableProjectBase(value, 'scenario');
  if (!isPortableScenarioProjectMetadata(value)) {
    throw new Error('Portable scenario project children are invalid.');
  }
  return value;
}

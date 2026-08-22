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
import { isScenarioProjectV3 } from '../../../../features/scenario/project/v3';
import type { JsonValue } from '../contracts';

interface PortableProjectAsset {
  entry: Omit<StoredProjectAssetEntry, 'assetId'>;
  filename: string;
  objectId: string;
}

interface PortableProjectExport {
  entry: Omit<StoredProjectExportEntry, 'assetId'>;
  objectId: string;
  thumbnail?: PortableMediaThumbnail;
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

export interface PortableScenarioProjectMetadata {
  assets: PortableScenarioAsset[];
  entry: Omit<ScenarioProjectEntry, 'project'> & { project: JsonValue };
  exportThumbnails: Array<{ exportId: string; thumbnail: PortableMediaThumbnail }>;
  exports: ScenarioExportEntry[];
  presentation?: PortableAggregatePresentation;
  stepDocuments: PortableScenarioStepDocument[];
  thumbnail?: PortableMediaThumbnail;
}

export function encodePortableScenarioProjectEntry(
  entry: ScenarioProjectEntry
): PortableScenarioProjectMetadata['entry'] {
  if (!isScenarioProjectV3(entry.project)) {
    throw new Error('Only current scenario projects can be exported in v6.');
  }
  const encodeSlide = (
    slide: ScenarioProjectEntry['project'] extends never
      ? never
      : (typeof entry.project.slides)[number]
  ) => ({
    ...slide,
    elements: slide.elements.map((element) => {
      if (element.kind !== 'image') return element;
      const { assetId, ...assetRef } = element.assetRef;
      return { ...element, assetRef: { ...assetRef, scenarioAssetId: assetId } };
    }),
    source:
      slide.source.kind === 'capture'
        ? (() => {
            const { assetId, ...source } = slide.source;
            return { ...source, scenarioAssetId: assetId };
          })()
        : slide.source,
  });
  return {
    ...entry,
    project: {
      ...entry.project,
      slides: entry.project.slides.map(encodeSlide),
      trash: entry.project.trash.map((item) => ({ ...item, slide: encodeSlide(item.slide) })),
    } as unknown as JsonValue,
  };
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

function isPortableScenarioProjectMetadata(
  value: unknown
): value is PortableScenarioProjectMetadata {
  return (
    isRecord(value) &&
    isRecord(value['entry']) &&
    typeof value['entry']['id'] === 'string' &&
    isJsonValue(value['entry']['project']) &&
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
  return value;
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

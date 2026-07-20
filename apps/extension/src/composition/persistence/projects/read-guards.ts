import {
  VideoExportFormat,
  type VideoExportFormat as VideoExportFormatValue,
  type VideoProject,
} from '../../../features/video/project/types';
import { parseHydratableVideoProject } from '../../../features/video/project/validation';
import { isNumber, isRecord, isString } from '../infrastructure/indexed-db/read-primitives';
import type {
  ProjectAssetEntry,
  ProjectExportEntry,
  UnsupportedVideoProjectMetadata,
  VideoProjectEntry,
  VideoProjectEntryReadResult,
} from './contracts';

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || isString(value);
}

function isOptionalVideoExportFormat(value: unknown): value is VideoExportFormatValue | undefined {
  return value === undefined || value === VideoExportFormat.WEBM || value === VideoExportFormat.MP4;
}

function isVideoProject(value: unknown): value is VideoProject {
  return parseHydratableVideoProject(value) !== null;
}

export function parseProjectAssetEntry(value: unknown): ProjectAssetEntry | null {
  if (!isRecord(value)) return null;
  if (
    !isString(value['id']) ||
    !(value['blob'] instanceof Blob) ||
    !isString(value['mimeType']) ||
    !isNumber(value['createdAt']) ||
    !isNumber(value['size'])
  ) {
    return null;
  }
  return {
    blob: value['blob'],
    createdAt: value['createdAt'],
    id: value['id'],
    mimeType: value['mimeType'],
    size: value['size'],
  };
}

export function parseProjectExportEntry(value: unknown): ProjectExportEntry | null {
  if (!isRecord(value)) return null;
  const format = value['format'];
  const mimeType = value['mimeType'];
  if (
    !isString(value['id']) ||
    !isString(value['projectId']) ||
    !isString(value['recordingId']) ||
    !isString(value['filename']) ||
    !isNumber(value['createdAt']) ||
    !isNumber(value['size']) ||
    !isNumber(value['duration']) ||
    !isNumber(value['width']) ||
    !isNumber(value['height']) ||
    !isNumber(value['fps']) ||
    !isOptionalVideoExportFormat(format) ||
    !isOptionalString(mimeType)
  ) {
    return null;
  }
  return {
    createdAt: value['createdAt'],
    duration: value['duration'],
    filename: value['filename'],
    fps: value['fps'],
    height: value['height'],
    id: value['id'],
    projectId: value['projectId'],
    recordingId: value['recordingId'],
    size: value['size'],
    width: value['width'],
    ...(format === undefined ? {} : { format }),
    ...(mimeType === undefined ? {} : { mimeType }),
  };
}

export function parseVideoProjectEntry(value: unknown): VideoProjectEntry | null {
  const result = parseVideoProjectEntryResult(value);
  return result.status === 'ready' ? result.entry : null;
}

export function parseVideoProjectEntryResult(value: unknown): VideoProjectEntryReadResult {
  if (value === undefined) return { status: 'notFound' };
  if (!isRecord(value)) {
    return { diagnostics: ['invalid-video-project-entry'], status: 'invalid' };
  }
  const metadata = parseUnsupportedMetadata(value);
  if (
    metadata &&
    isRecord(value['project']) &&
    Object.hasOwn(value['project'], 'templateInstances')
  ) {
    return {
      metadata,
      reason: 'engine1-template-instances',
      status: 'unsupported',
    };
  }
  if (
    !isString(value['id']) ||
    !isVideoProject(value['project']) ||
    value['project'].id !== value['id'] ||
    !isNumber(value['createdAt']) ||
    !isNumber(value['updatedAt'])
  ) {
    return {
      diagnostics: ['invalid-video-project-entry'],
      ...(isString(value['id']) ? { opaqueId: value['id'].slice(0, 128) } : {}),
      status: 'invalid',
    };
  }
  return {
    entry: {
      createdAt: value['createdAt'],
      id: value['id'],
      project: value['project'],
      updatedAt: value['updatedAt'],
    },
    status: 'ready',
  };
}

function parseUnsupportedMetadata(
  value: Record<string, unknown>
): UnsupportedVideoProjectMetadata | null {
  const project = value['project'];
  if (
    !isString(value['id']) ||
    !isNumber(value['createdAt']) ||
    !isNumber(value['updatedAt']) ||
    !isRecord(project) ||
    project['id'] !== value['id'] ||
    !isString(project['name']) ||
    !isNumber(project['duration']) ||
    !isNumber(project['width']) ||
    !isNumber(project['height'])
  ) {
    return null;
  }
  return {
    createdAt: value['createdAt'],
    duration: project['duration'],
    height: project['height'],
    id: value['id'],
    name: project['name'].slice(0, 512),
    updatedAt: value['updatedAt'],
    width: project['width'],
  };
}

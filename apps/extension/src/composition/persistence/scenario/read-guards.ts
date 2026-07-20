import type {
  PendingScenarioAssetEntry,
  ScenarioAssetEntry,
  ScenarioExportEntry,
  ScenarioProjectEntry,
} from './contracts';
import type { ScenarioExportFormat } from '@sniptale/runtime-contracts/scenario/types/base';
import { isScenarioProjectV3 } from '../../../features/scenario/project/v3';
import { isSafeScenarioAssetImageMimeType } from './projects/guards/asset-policy';
import { parseScenarioProject } from './projects/guards';
import { isNumber, isRecord, isString } from '../infrastructure/indexed-db/read-primitives.ts';

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isTabId(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isScenarioExportFormat(value: unknown): value is ScenarioExportFormat {
  return value === 'html' || value === 'markdown';
}

function parseStoredScenarioProject(value: unknown): ScenarioProjectEntry['project'] | null {
  const legacyProject = parseScenarioProject(value);
  if (legacyProject) {
    return legacyProject;
  }

  return isScenarioProjectV3(value) ? value : null;
}

export function parseScenarioAssetEntry(value: unknown): ScenarioAssetEntry | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    !isString(value['id']) ||
    !isString(value['projectId']) ||
    !isNullableString(value['galleryAssetId']) ||
    !(value['blob'] instanceof Blob) ||
    !isString(value['mimeType']) ||
    !isSafeScenarioAssetImageMimeType(value['mimeType']) ||
    value['blob'].size <= 0 ||
    value['blob'].size !== value['size'] ||
    !isPositiveNumber(value['width']) ||
    !isPositiveNumber(value['height']) ||
    !isNumber(value['createdAt']) ||
    !isNonNegativeNumber(value['size'])
  ) {
    return null;
  }

  return {
    blob: value['blob'],
    createdAt: value['createdAt'],
    galleryAssetId: value['galleryAssetId'],
    height: value['height'],
    id: value['id'],
    mimeType: value['mimeType'],
    projectId: value['projectId'],
    size: value['size'],
    width: value['width'],
  };
}

export function parsePendingScenarioAssetEntry(value: unknown): PendingScenarioAssetEntry | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    !isString(value['id']) ||
    !isTabId(value['tabId']) ||
    !isNullableString(value['galleryAssetId']) ||
    !(value['blob'] instanceof Blob) ||
    !isString(value['mimeType']) ||
    !isSafeScenarioAssetImageMimeType(value['mimeType']) ||
    value['blob'].size <= 0 ||
    value['blob'].size !== value['size'] ||
    !isNumber(value['createdAt']) ||
    !isNonNegativeNumber(value['size'])
  ) {
    return null;
  }

  return {
    blob: value['blob'],
    createdAt: value['createdAt'],
    galleryAssetId: value['galleryAssetId'],
    id: value['id'],
    mimeType: value['mimeType'],
    size: value['size'],
    tabId: value['tabId'],
  };
}

export function parseScenarioExportEntry(value: unknown): ScenarioExportEntry | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    !isString(value['id']) ||
    !isString(value['projectId']) ||
    !isScenarioExportFormat(value['format']) ||
    !isString(value['filename']) ||
    !isNumber(value['createdAt']) ||
    !isNonNegativeNumber(value['size'])
  ) {
    return null;
  }

  return {
    createdAt: value['createdAt'],
    filename: value['filename'],
    format: value['format'],
    id: value['id'],
    projectId: value['projectId'],
    size: value['size'],
  };
}

export function parseScenarioProjectEntry(value: unknown): ScenarioProjectEntry | null {
  if (!isRecord(value)) {
    return null;
  }

  const project = parseStoredScenarioProject(value['project']);
  if (
    !isString(value['id']) ||
    !project ||
    project.id !== value['id'] ||
    !isNumber(value['createdAt']) ||
    !isNumber(value['updatedAt'])
  ) {
    return null;
  }

  return { createdAt: value['createdAt'], id: value['id'], project, updatedAt: value['updatedAt'] };
}

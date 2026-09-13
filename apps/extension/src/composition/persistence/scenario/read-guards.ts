import { parseScenarioSavedVersions } from './history-model';
import type { ScenarioProjectSummary } from '../../../features/scenario/contracts/types/project';
import type {
  PendingScenarioAssetEntry,
  ScenarioAssetEntry,
  ScenarioExportEntry,
  ScenarioProjectEntry,
} from './contracts';
import type { ScenarioExportFormat } from '@sniptale/runtime-contracts/scenario/types/base';
import { parseGuideProject } from '@sniptale/runtime-contracts/scenario/guide-parser';
import {
  assertSafeScenarioAssetStorageMetadata,
  isSafeScenarioAssetImageMimeType,
  isSafeScenarioAssetAudioMimeType,
} from './projects/guards/asset-policy';
import { isNumber, isRecord, isString } from '../infrastructure/indexed-db/read-primitives.ts';
import { parseLibraryLifecycle } from '../library-lifecycle/parser';

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
  return value === 'html' || value === 'markdown' || value === 'pdf';
}

function validAssetMediaMetadata(value: Record<string, unknown>): boolean {
  const mime = value['mimeType'];
  if (typeof mime !== 'string') return false;
  if (isSafeScenarioAssetAudioMimeType(mime)) {
    try {
      if (typeof value['size'] !== 'number') return false;
      assertSafeScenarioAssetStorageMetadata(value['size'], mime);
    } catch {
      return false;
    }
    return (
      value['width'] === 0 &&
      value['height'] === 0 &&
      isPositiveNumber(value['duration']) &&
      value['duration'] <= 3600
    );
  }
  return (
    isSafeScenarioAssetImageMimeType(mime) &&
    isPositiveNumber(value['width']) &&
    isPositiveNumber(value['height']) &&
    value['duration'] === undefined
  );
}

export function parseScenarioAssetEntry(value: unknown): ScenarioAssetEntry | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    !isString(value['assetId']) ||
    !isString(value['id']) ||
    !isString(value['projectId']) ||
    !isNullableString(value['galleryAssetId']) ||
    !isString(value['mimeType']) ||
    !isNonNegativeNumber(value['width']) ||
    !isNonNegativeNumber(value['height']) ||
    !validAssetMediaMetadata(value) ||
    !isNumber(value['createdAt']) ||
    !isNonNegativeNumber(value['size'])
  ) {
    return null;
  }

  return {
    assetId: value['assetId'],
    createdAt: value['createdAt'],
    galleryAssetId: value['galleryAssetId'],
    ...(typeof value['duration'] === 'number' ? { duration: value['duration'] } : {}),
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

  const parsed = parseGuideProject(value['project']);
  const project = parsed.status === 'ok' ? parsed.project : null;
  if (
    !isString(value['id']) ||
    !project ||
    project.id !== value['id'] ||
    !isNumber(value['createdAt']) ||
    !isNumber(value['updatedAt'])
  ) {
    return null;
  }
  const lifecycle = parseLibraryLifecycle(value['lifecycle'], {
    storageClass: 'library',
    updatedAt: value['updatedAt'],
  });
  if (lifecycle === null) return null;
  const workspaceRevision = value['workspaceRevision'];
  if (
    !(
      typeof workspaceRevision === 'number' &&
      Number.isInteger(workspaceRevision) &&
      workspaceRevision >= 0
    )
  ) {
    return null;
  }
  const history = parseScenarioSavedVersions(
    value['history'],
    project.id,
    workspaceRevision,
    project.updatedAt
  );
  if (!history) return null;
  return {
    ...(history.length ? { history } : {}),
    createdAt: value['createdAt'],
    id: value['id'],
    ...(lifecycle === undefined ? {} : { lifecycle }),
    project,
    updatedAt: value['updatedAt'],
    workspaceRevision,
  };
}

/** Reads display metadata independently of unsupported document bodies. */
export function parseScenarioProjectSummary(value: unknown): ScenarioProjectSummary | null {
  if (!isRecord(value) || !isRecord(value['project'])) return null;
  const body = value['project'];
  if (
    typeof value['id'] !== 'string' ||
    !value['id'] ||
    body['id'] !== value['id'] ||
    typeof body['name'] !== 'string' ||
    body['name'].length > 160 ||
    !isNumber(value['createdAt']) ||
    !isNumber(value['updatedAt'])
  )
    return null;
  const lifecycle = parseLibraryLifecycle(value['lifecycle'], {
    storageClass: 'library',
    updatedAt: value['updatedAt'],
  });
  if (lifecycle === null) return null;
  const tags: unknown = body['tags'];
  if (
    tags !== undefined &&
    (!Array.isArray(tags) ||
      tags.length > 30 ||
      !tags.every((tag: unknown) => typeof tag === 'string' && tag.length <= 160))
  )
    return null;
  const parsed = parseGuideProject(body);
  const revision = value['workspaceRevision'];
  const validRevision =
    typeof revision === 'number' && Number.isSafeInteger(revision) && revision >= 0;
  return {
    id: value['id'],
    name: body['name'],
    ...(body['purpose'] === 'step-template' ? { purpose: 'step-template' as const } : {}),
    createdAt: value['createdAt'],
    updatedAt: value['updatedAt'],
    tags: Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === 'string') : [],
    ...(lifecycle ? { lifecycle } : {}),
    ...(validRevision ? { workspaceRevision: revision } : {}),
    availability:
      parsed.status === 'unsupported'
        ? 'unsupported'
        : parsed.status === 'ok' && validRevision
          ? 'available'
          : 'invalid',
  };
}

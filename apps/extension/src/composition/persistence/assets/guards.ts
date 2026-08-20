import { isNumber, isRecord, isString } from '@sniptale/runtime-contracts/validation/primitives';
import type {
  AssetOperation,
  AssetOperationCompensation,
  AssetOwner,
  AssetReadyJournal,
  AssetRef,
  PhysicalDeleteAssetOperation,
} from './contracts';

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

export function parseAssetRef(value: unknown): AssetRef | null {
  if (!isRecord(value) || !isRecord(value['location'])) return null;
  const location = value['location'];
  if (
    !isString(value['assetId']) ||
    value['assetId'].length === 0 ||
    !isNumber(value['createdAt']) ||
    !Number.isFinite(value['createdAt']) ||
    location['kind'] !== 'opfs' ||
    !isString(location['objectKey']) ||
    location['objectKey'] !== `objects/${value['assetId']}` ||
    !isString(value['mimeType']) ||
    value['mimeType'].length === 0 ||
    !isNullableString(value['sha256']) ||
    !isNumber(value['size']) ||
    !Number.isSafeInteger(value['size']) ||
    value['size'] < 0
  ) {
    return null;
  }
  return {
    assetId: value['assetId'],
    createdAt: value['createdAt'],
    location: { kind: 'opfs', objectKey: location['objectKey'] },
    mimeType: value['mimeType'],
    sha256: value['sha256'],
    size: value['size'],
  };
}

export function parseAssetOwner(value: unknown): AssetOwner | null {
  if (
    !isRecord(value) ||
    !isString(value['assetId']) ||
    !isString(value['ownerKind']) ||
    !isString(value['ownerId']) ||
    !isString(value['role']) ||
    value['assetId'].length === 0 ||
    value['ownerKind'].length === 0 ||
    value['ownerId'].length === 0 ||
    value['role'].length === 0
  ) {
    return null;
  }
  return {
    assetId: value['assetId'],
    ownerId: value['ownerId'],
    ownerKind: value['ownerKind'],
    role: value['role'],
  };
}

export function parseAssetReadyJournal(value: unknown): AssetReadyJournal | null {
  if (
    !isRecord(value) ||
    !Array.isArray(value['assetRefs']) ||
    !isNumber(value['createdAt']) ||
    !isString(value['domain']) ||
    !isString(value['journalId']) ||
    !('payload' in value) ||
    !(
      value['operationId'] === undefined ||
      (isString(value['operationId']) && value['operationId'].length > 0)
    )
  ) {
    return null;
  }
  const assetRefs = value['assetRefs'].map(parseAssetRef);
  if (assetRefs.some((ref) => ref === null)) return null;
  return {
    assetRefs: assetRefs as AssetRef[],
    createdAt: value['createdAt'],
    domain: value['domain'],
    journalId: value['journalId'],
    ...(value['operationId'] === undefined ? {} : { operationId: value['operationId'] }),
    payload: value['payload'],
  };
}

function parseCompensation(value: unknown): AssetOperationCompensation | null {
  if (
    !isRecord(value) ||
    !isString(value['assetId']) ||
    !isString(value['journalId']) ||
    !isString(value['nextMediaId']) ||
    !isString(value['nextOwnerId']) ||
    !(value['nextProjectAssetId'] === undefined || isString(value['nextProjectAssetId'])) ||
    !(value['nextProjectExportId'] === undefined || isString(value['nextProjectExportId'])) ||
    !(value['nextWebSnapshotId'] === undefined || isString(value['nextWebSnapshotId'])) ||
    !(value['ownerKind'] === undefined || isString(value['ownerKind'])) ||
    !(value['ownerRole'] === undefined || isString(value['ownerRole'])) ||
    !isRecord(value['previousRecords'])
  ) {
    return null;
  }
  return {
    assetId: value['assetId'],
    journalId: value['journalId'],
    nextMediaId: value['nextMediaId'],
    nextOwnerId: value['nextOwnerId'],
    ...(value['nextProjectAssetId'] === undefined
      ? {}
      : { nextProjectAssetId: value['nextProjectAssetId'] }),
    ...(value['nextProjectExportId'] === undefined
      ? {}
      : { nextProjectExportId: value['nextProjectExportId'] }),
    ...(value['nextWebSnapshotId'] === undefined
      ? {}
      : { nextWebSnapshotId: value['nextWebSnapshotId'] }),
    ...(value['ownerKind'] === undefined ? {} : { ownerKind: value['ownerKind'] }),
    ...(value['ownerRole'] === undefined ? {} : { ownerRole: value['ownerRole'] }),
    previousRecords: value['previousRecords'],
  };
}

export function parseBackupAssetOperation(value: unknown): AssetOperation | null {
  if (
    !isRecord(value) ||
    value['kind'] !== 'backup-restore' ||
    !isString(value['operationId']) ||
    !['pending', 'aborted', 'committed'].includes(String(value['status'])) ||
    !isNumber(value['createdAt']) ||
    !isNumber(value['updatedAt']) ||
    !Array.isArray(value['compensations']) ||
    !Array.isArray(value['obsoleteAssetIds']) ||
    !value['obsoleteAssetIds'].every((assetId) => isString(assetId) && assetId.length > 0)
  ) {
    return null;
  }
  const compensations = value['compensations'].map(parseCompensation);
  if (compensations.some((compensation) => compensation === null)) return null;
  const status = value['status'];
  if (status !== 'pending' && status !== 'aborted' && status !== 'committed') return null;
  const obsoleteAssetIds = value['obsoleteAssetIds'].filter(isString);
  return {
    compensations: compensations as AssetOperationCompensation[],
    createdAt: value['createdAt'],
    kind: 'backup-restore',
    obsoleteAssetIds,
    operationId: value['operationId'],
    status,
    updatedAt: value['updatedAt'],
  };
}

export function parsePhysicalDeleteAssetOperation(
  value: unknown
): PhysicalDeleteAssetOperation | null {
  if (
    !isRecord(value) ||
    value['kind'] !== 'physical-delete' ||
    value['status'] !== 'pending' ||
    !isString(value['operationId']) ||
    !isNumber(value['createdAt']) ||
    !isNumber(value['updatedAt']) ||
    !Array.isArray(value['assetIds']) ||
    !value['assetIds'].every((assetId) => isString(assetId) && assetId.length > 0)
  ) {
    return null;
  }
  const assetIds = value['assetIds'].filter(isString);
  return {
    assetIds,
    createdAt: value['createdAt'],
    kind: 'physical-delete',
    operationId: value['operationId'],
    status: 'pending',
    updatedAt: value['updatedAt'],
  };
}

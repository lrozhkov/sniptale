import { sanitizeProvenanceUrl } from '@sniptale/platform/security/provenance-url';
import { parsePersistedEditorDocument } from '../document-assets/parser';
import {
  isNullable,
  isNumber,
  isRecord,
  isString,
} from '@sniptale/runtime-contracts/validation/primitives';
import type { StoredImageWorkspaceEntry } from './contracts';
import { parsePersistedImageHistory } from './history-contracts';
import { imageWorkspaceAssetBindings } from './assets';
import { parseLibraryLifecycle } from '../library-lifecycle/parser';

const isNullableString = isNullable(isString);

export function parseImageWorkspaceEntry(value: unknown): StoredImageWorkspaceEntry | null {
  if (!isRecord(value)) return null;
  const sourceMediaId = value['sourceMediaId'];
  const document = parsePersistedEditorDocument(value['document']);
  const history =
    value['history'] === undefined ? undefined : parsePersistedImageHistory(value['history']);
  if (
    !isString(value['aggregateId']) ||
    (sourceMediaId !== undefined &&
      (!isString(sourceMediaId) ||
        !sourceMediaId.length ||
        sourceMediaId.length > 256 ||
        sourceMediaId === value['aggregateId'])) ||
    !document ||
    history === null ||
    (value['publicationId'] !== undefined &&
      (typeof value['publicationId'] !== 'string' ||
        !value['publicationId'].length ||
        value['publicationId'].length > 200)) ||
    !Number.isInteger(value['revision']) ||
    !isNumber(value['revision']) ||
    value['revision'] < 1 ||
    !isNullableString(value['sourceUrl']) ||
    !isNullableString(value['sourceTitle']) ||
    !isNumber(value['createdAt']) ||
    !isNumber(value['updatedAt'])
  ) {
    return null;
  }
  const lifecycle =
    sourceMediaId === undefined
      ? undefined
      : parseLibraryLifecycle(value['lifecycle'], {
          storageClass: 'library',
          updatedAt: value['createdAt'],
        });
  if (sourceMediaId !== undefined && lifecycle?.storageClass !== 'library') return null;
  if (sourceMediaId === undefined && value['lifecycle'] !== undefined) return null;
  try {
    imageWorkspaceAssetBindings({ document, ...(history ? { history } : {}) });
  } catch {
    return null;
  }
  return {
    aggregateId: value['aggregateId'],
    ...(sourceMediaId === undefined ? {} : { sourceMediaId }),
    ...(lifecycle ? { lifecycle } : {}),
    createdAt: value['createdAt'],
    document,
    ...(history ? { history } : {}),
    ...(typeof value['publicationId'] === 'string'
      ? { publicationId: value['publicationId'] }
      : {}),
    revision: value['revision'],
    sourceTitle: value['sourceTitle'],
    sourceUrl: sanitizeProvenanceUrl(value['sourceUrl']),
    updatedAt: value['updatedAt'],
  };
}

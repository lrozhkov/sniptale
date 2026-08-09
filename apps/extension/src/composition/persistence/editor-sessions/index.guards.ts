import { isEditorDocument } from '../../../features/editor/document/guards';
import type { EditorSessionEntry } from './contracts';
import {
  isBoolean,
  isNullable,
  isNumber,
  isRecord,
  isString,
} from '@sniptale/runtime-contracts/validation/primitives';
import { parseLibraryLifecycle } from '../library-lifecycle/parser';

const isNullableString = isNullable(isString);

function parseEditorSessionEntryValue(value: unknown): EditorSessionEntry | null {
  if (!isRecord(value)) return null;
  if (
    !(
      isString(value['sessionId']) &&
      isEditorDocument(value['document']) &&
      isNullableString(value['assetId']) &&
      isNullableString(value['sourceUrl']) &&
      isNullableString(value['sourceTitle']) &&
      isNumber(value['createdAt']) &&
      isNumber(value['updatedAt']) &&
      isBoolean(value['dirty'])
    )
  )
    return null;
  const lifecycle = parseLibraryLifecycle(value['lifecycle'], {
    storageClass: value['assetId'] === null ? 'temporary' : 'library',
    updatedAt: value['updatedAt'],
  });
  if (lifecycle === null) return null;
  return {
    assetId: value['assetId'],
    createdAt: value['createdAt'],
    dirty: value['dirty'],
    document: value['document'],
    ...(lifecycle === undefined ? {} : { lifecycle }),
    sessionId: value['sessionId'],
    sourceTitle: value['sourceTitle'],
    sourceUrl: value['sourceUrl'],
    updatedAt: value['updatedAt'],
  };
}

export function parseEditorSessionEntry(value: unknown): EditorSessionEntry | null {
  return parseEditorSessionEntryValue(value);
}

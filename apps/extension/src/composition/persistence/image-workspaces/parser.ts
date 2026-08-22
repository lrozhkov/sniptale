import { parsePersistedEditorDocument } from '../document-assets';
import {
  isNullable,
  isNumber,
  isRecord,
  isString,
} from '@sniptale/runtime-contracts/validation/primitives';
import type { StoredImageWorkspaceEntry } from './contracts';

const isNullableString = isNullable(isString);

export function parseImageWorkspaceEntry(value: unknown): StoredImageWorkspaceEntry | null {
  if (!isRecord(value)) return null;
  const document = parsePersistedEditorDocument(value['document']);
  if (
    !isString(value['aggregateId']) ||
    !document ||
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
  return {
    aggregateId: value['aggregateId'],
    createdAt: value['createdAt'],
    document,
    revision: value['revision'],
    sourceTitle: value['sourceTitle'],
    sourceUrl: value['sourceUrl'],
    updatedAt: value['updatedAt'],
  };
}

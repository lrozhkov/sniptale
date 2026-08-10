import { isEditorDocument } from '../../../features/editor/document/guards';
import {
  isNullable,
  isNumber,
  isRecord,
  isString,
} from '@sniptale/runtime-contracts/validation/primitives';
import type { ImageWorkspaceEntry } from './contracts';

const isNullableString = isNullable(isString);

export function parseImageWorkspaceEntry(value: unknown): ImageWorkspaceEntry | null {
  if (!isRecord(value)) return null;
  if (
    !isString(value['aggregateId']) ||
    !isEditorDocument(value['document']) ||
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
    document: value['document'],
    revision: value['revision'],
    sourceTitle: value['sourceTitle'],
    sourceUrl: value['sourceUrl'],
    updatedAt: value['updatedAt'],
  };
}

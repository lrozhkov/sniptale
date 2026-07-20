import { isEditorDocument } from '../../../features/editor/document/guards';
import { parseStoredEntry } from '../infrastructure/indexed-db/guards/entries';
import type { EditorSessionEntry } from './contracts';
import {
  isBoolean,
  isNullable,
  isNumber,
  isRecord,
  isString,
} from '@sniptale/runtime-contracts/validation/primitives';

const isNullableString = isNullable(isString);

function isEditorSessionEntry(value: unknown): value is EditorSessionEntry {
  return (
    isRecord(value) &&
    isString(value['sessionId']) &&
    isEditorDocument(value['document']) &&
    isNullableString(value['assetId']) &&
    isNullableString(value['sourceUrl']) &&
    isNullableString(value['sourceTitle']) &&
    isNumber(value['createdAt']) &&
    isNumber(value['updatedAt']) &&
    isBoolean(value['dirty'])
  );
}

export function parseEditorSessionEntry(value: unknown): EditorSessionEntry | null {
  return parseStoredEntry(value, isEditorSessionEntry);
}

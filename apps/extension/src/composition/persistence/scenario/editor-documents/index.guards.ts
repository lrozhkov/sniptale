import { parsePersistedEditorDocument } from '../../document-assets';
import type { StoredScenarioStepEditorDocumentEntry } from '../contracts';
import {
  parseStoredEntries,
  parseStoredEntry,
  type ParsedStoredEntriesValue,
} from '../../infrastructure/indexed-db/guards/entries';
import { isNumber, isRecord, isString } from '@sniptale/runtime-contracts/validation/primitives';

type ParsedScenarioStepEditorDocumentEntriesValue =
  ParsedStoredEntriesValue<StoredScenarioStepEditorDocumentEntry>;

function isScenarioStepEditorDocumentEntry(
  value: unknown
): value is StoredScenarioStepEditorDocumentEntry {
  return (
    isRecord(value) &&
    isString(value['stepId']) &&
    isString(value['projectId']) &&
    parsePersistedEditorDocument(value['document']) !== null &&
    isNumber(value['createdAt']) &&
    isNumber(value['updatedAt'])
  );
}

export function parseScenarioStepEditorDocumentEntry(
  value: unknown
): StoredScenarioStepEditorDocumentEntry | null {
  return parseStoredEntry(value, isScenarioStepEditorDocumentEntry);
}

export function parseScenarioStepEditorDocumentEntries(
  value: unknown
): ParsedScenarioStepEditorDocumentEntriesValue {
  return parseStoredEntries(value, isScenarioStepEditorDocumentEntry);
}

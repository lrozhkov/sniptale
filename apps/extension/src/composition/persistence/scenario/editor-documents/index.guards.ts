import { isEditorDocument } from '../../../../features/editor/document/guards';
import type { ScenarioStepEditorDocumentEntry } from '../contracts';
import {
  parseStoredEntries,
  parseStoredEntry,
  type ParsedStoredEntriesValue,
} from '../../infrastructure/indexed-db/guards/entries';
import { isNumber, isRecord, isString } from '@sniptale/runtime-contracts/validation/primitives';

type ParsedScenarioStepEditorDocumentEntriesValue =
  ParsedStoredEntriesValue<ScenarioStepEditorDocumentEntry>;

function isScenarioStepEditorDocumentEntry(
  value: unknown
): value is ScenarioStepEditorDocumentEntry {
  return (
    isRecord(value) &&
    isString(value['stepId']) &&
    isString(value['projectId']) &&
    isEditorDocument(value['document']) &&
    isNumber(value['createdAt']) &&
    isNumber(value['updatedAt'])
  );
}

export function parseScenarioStepEditorDocumentEntry(
  value: unknown
): ScenarioStepEditorDocumentEntry | null {
  return parseStoredEntry(value, isScenarioStepEditorDocumentEntry);
}

export function parseScenarioStepEditorDocumentEntries(
  value: unknown
): ParsedScenarioStepEditorDocumentEntriesValue {
  return parseStoredEntries(value, isScenarioStepEditorDocumentEntry);
}

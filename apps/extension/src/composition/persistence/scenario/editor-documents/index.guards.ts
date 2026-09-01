import { parsePersistedEditorDocument } from '../../document-assets';
import type { StoredScenarioStepEditorDocumentEntry } from '../contracts';
import { type ParsedStoredEntriesValue } from '../../infrastructure/indexed-db/guards/entries';
import { isNumber, isRecord, isString } from '@sniptale/runtime-contracts/validation/primitives';

type ParsedScenarioStepEditorDocumentEntriesValue =
  ParsedStoredEntriesValue<StoredScenarioStepEditorDocumentEntry>;

export function parseScenarioStepEditorDocumentEntry(
  value: unknown
): StoredScenarioStepEditorDocumentEntry | null {
  if (
    !isRecord(value) ||
    !isString(value['stepId']) ||
    !isString(value['projectId']) ||
    !isNumber(value['createdAt']) ||
    !isNumber(value['updatedAt'])
  ) {
    return null;
  }
  const document = parsePersistedEditorDocument(value['document']);
  return document
    ? {
        createdAt: value['createdAt'],
        document,
        projectId: value['projectId'],
        stepId: value['stepId'],
        updatedAt: value['updatedAt'],
      }
    : null;
}

export function parseScenarioStepEditorDocumentEntries(
  value: unknown
): ParsedScenarioStepEditorDocumentEntriesValue {
  if (!Array.isArray(value)) {
    return { entries: [], hasInvalidRoot: value !== undefined, invalidEntryCount: 0 };
  }
  const entries = value.flatMap((candidate) => {
    const entry = parseScenarioStepEditorDocumentEntry(candidate);
    return entry ? [entry] : [];
  });
  return {
    entries,
    hasInvalidRoot: false,
    invalidEntryCount: value.length - entries.length,
  };
}

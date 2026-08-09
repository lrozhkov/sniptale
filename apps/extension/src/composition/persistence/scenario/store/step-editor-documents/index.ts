import type { EditorDocument } from '../../../../../features/editor/document/types';
import {
  getScenarioStepEditorDocument,
  listScenarioStepEditorDocuments,
} from '../../editor-documents/index';
import type { ScenarioStepEditorDocumentEntry } from '../../contracts';

export function prepareScenarioStepEditorDocumentRecord(args: {
  document: EditorDocument;
  projectId: string;
  stepId: string;
}): ScenarioStepEditorDocumentEntry {
  const now = Date.now();
  return {
    ...args,
    createdAt: now,
    updatedAt: now,
  };
}

export function getScenarioStepEditorDocumentRecord(stepId: string) {
  return getScenarioStepEditorDocument(stepId);
}

export function listScenarioStepEditorDocumentRecords(projectId: string) {
  return listScenarioStepEditorDocuments(projectId);
}

import type { EditorDocument } from '../../../../../features/editor/document/types';
import {
  deleteScenarioStepEditorDocument,
  getScenarioStepEditorDocument,
  listScenarioStepEditorDocuments,
  saveScenarioStepEditorDocument,
} from '../../editor-documents/index';

export async function saveScenarioStepEditorDocumentRecord(args: {
  document: EditorDocument;
  projectId: string;
  stepId: string;
}) {
  return saveScenarioStepEditorDocument(args);
}

export function getScenarioStepEditorDocumentRecord(stepId: string) {
  return getScenarioStepEditorDocument(stepId);
}

export function listScenarioStepEditorDocumentRecords(projectId: string) {
  return listScenarioStepEditorDocuments(projectId);
}

export function deleteScenarioStepEditorDocumentRecord(stepId: string) {
  return deleteScenarioStepEditorDocument(stepId);
}

export async function cloneScenarioStepEditorDocumentRecord(args: {
  nextProjectId: string;
  nextStepId: string;
  sourceStepId: string;
}) {
  const sourceEntry = await getScenarioStepEditorDocument(args.sourceStepId);
  if (!sourceEntry) {
    return undefined;
  }

  return saveScenarioStepEditorDocument({
    stepId: args.nextStepId,
    projectId: args.nextProjectId,
    document: structuredClone(sourceEntry.document),
  });
}

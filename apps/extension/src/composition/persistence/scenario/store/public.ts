export { getScenarioAssetBlob, getScenarioAssetEntry } from './project-records/assets';
export {
  createScenarioProjectRecord,
  deleteScenarioProjectRecord,
  getScenarioProjectRecord,
  listScenarioProjectSummaries,
  renameScenarioProjectRecord,
  saveScenarioProjectRecord,
  updateScenarioProjectRecordMetadata,
} from './project-records/index';
export { saveScenarioExportRecord } from './project-records/exports';
export {
  getScenarioStepEditorDocumentRecord,
  getScenarioStepEditorDocumentTransferRecord,
} from './step-editor-documents/index';

export { duplicateScenarioProjectRecord } from './project-records/duplicate';
export {
  importScenarioImages,
  type GuideImageImportSource,
  type GuideImageImportPlacement,
} from './image-import';
export { listScenarioStepTemplates, saveScenarioStepTemplate } from './project-records/templates';
export {
  applyScenarioStepTemplate,
  type GuideTemplateApplication,
} from './project-records/template-apply';

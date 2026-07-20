import { vi } from 'vitest';
import { createScenarioProjectV3 } from '../../../../features/scenario/project/v3';
import { createEditorDocument } from './editor-document.test-support.ts';

export function createUnsafeScenarioProjectBundleDb(args: {
  assetId?: string;
  assetMimeType?: string;
  exportId?: string;
  projectId?: string;
  stepId?: string;
}) {
  const projectId = args.projectId ?? 'scenario-1';
  return {
    get: vi.fn(async () => undefined),
    getAll: vi.fn(async (storeName: string) =>
      storeName === 'scenario_projects' ? [createScenarioProjectEntry(projectId)] : []
    ),
    getAllFromIndex: vi.fn(async (storeName: string) => {
      if (storeName === 'scenario_assets') {
        return [createScenarioAssetRecord(args, projectId)];
      }
      if (storeName === 'scenario_exports') {
        return [createScenarioExportRecord(args.exportId, projectId)];
      }
      if (storeName === 'scenario_step_editor_documents') {
        return [createScenarioStepDocumentRecord(args.stepId, projectId)];
      }
      return [];
    }),
  };
}

function createScenarioProjectEntry(id: string) {
  const project = { ...createScenarioProjectV3('Scenario'), id };
  return { createdAt: 1, id, project, updatedAt: 2 };
}

function createScenarioAssetRecord(
  args: { assetId?: string; assetMimeType?: string },
  projectId: string
) {
  const mimeType = args.assetMimeType ?? 'image/png';
  const blob = new Blob(['scenario-asset'], { type: mimeType });
  return {
    id: args.assetId ?? 'scenario-asset-1',
    projectId,
    galleryAssetId: null,
    blob,
    mimeType,
    width: 10,
    height: 10,
    createdAt: 3,
    size: blob.size,
  };
}

function createScenarioExportRecord(id = 'scenario-export-1', projectId = 'scenario-1') {
  return {
    createdAt: 4,
    filename: 'scenario.html',
    format: 'html',
    id,
    projectId,
    size: 8,
  };
}

function createScenarioStepDocumentRecord(stepId = 'step-1', projectId = 'scenario-1') {
  return {
    createdAt: 5,
    document: createEditorDocument(),
    projectId,
    stepId,
    updatedAt: 6,
  };
}

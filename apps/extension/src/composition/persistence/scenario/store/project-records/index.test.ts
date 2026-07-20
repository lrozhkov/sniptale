import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  blobToDataUrlMock,
  deleteScenarioStepEditorDocumentRecordMock,
  deleteScenarioAssetMock,
  deleteScenarioExportMock,
  deleteScenarioProjectMock,
  getScenarioAssetMock,
  getScenarioProjectMock,
  listScenarioAssetsMock,
  listScenarioExportsMock,
  listScenarioProjectsMock,
  listScenarioStepEditorDocumentRecordsMock,
  saveScenarioProjectMock,
} = vi.hoisted(() => ({
  blobToDataUrlMock: vi.fn(),
  deleteScenarioStepEditorDocumentRecordMock: vi.fn(),
  deleteScenarioAssetMock: vi.fn(),
  deleteScenarioExportMock: vi.fn(),
  deleteScenarioProjectMock: vi.fn(),
  getScenarioAssetMock: vi.fn(),
  getScenarioProjectMock: vi.fn(),
  listScenarioAssetsMock: vi.fn(),
  listScenarioExportsMock: vi.fn(),
  listScenarioProjectsMock: vi.fn(),
  listScenarioStepEditorDocumentRecordsMock: vi.fn(),
  saveScenarioProjectMock: vi.fn(),
}));

vi.mock('../../../../../platform/media-utils/data-url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/media-utils/data-url')>()),
  blobToDataUrl: blobToDataUrlMock,
}));

vi.mock('../../projects', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../projects')>();
  return {
    ...actual,
    deleteScenarioAsset: deleteScenarioAssetMock,
    deleteScenarioExport: deleteScenarioExportMock,
    deleteScenarioProject: deleteScenarioProjectMock,
    getScenarioAsset: getScenarioAssetMock,
    getScenarioProject: getScenarioProjectMock,
    listScenarioAssets: listScenarioAssetsMock,
    listScenarioExports: listScenarioExportsMock,
    listScenarioProjects: listScenarioProjectsMock,
    saveScenarioProject: saveScenarioProjectMock,
  };
});

vi.mock('../step-editor-documents/index', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../step-editor-documents/index')>();
  return {
    ...actual,
    deleteScenarioStepEditorDocumentRecord: deleteScenarioStepEditorDocumentRecordMock,
    listScenarioStepEditorDocumentRecords: listScenarioStepEditorDocumentRecordsMock,
  };
});
import { deleteScenarioAssetRecord, getScenarioAssetBlob, getScenarioAssetEntry } from './assets';
import {
  deleteScenarioStepFromProject,
  moveScenarioStepInProject,
  restoreScenarioStepFromProject,
} from '../project-steps/project-step-persistence';
import {
  listRecentScenarioSteps,
  listScenarioTrashedSteps,
} from '../project-steps/project-step-queries';
import { createScenarioCaptureStep } from '../../../../../features/scenario/project/public';
import { createScenarioStoreProjectFixture } from '../test.helpers.ts';

beforeEach(() => {
  vi.clearAllMocks();
  listScenarioProjectsMock.mockResolvedValue([]);
  saveScenarioProjectMock.mockImplementation(async (project) => project);
  blobToDataUrlMock.mockResolvedValue('data:image/png;base64,preview');
  deleteScenarioAssetMock.mockResolvedValue(undefined);
  deleteScenarioExportMock.mockResolvedValue(undefined);
  deleteScenarioProjectMock.mockResolvedValue(undefined);
  getScenarioAssetMock.mockResolvedValue(undefined);
  getScenarioProjectMock.mockResolvedValue(undefined);
  listScenarioAssetsMock.mockResolvedValue([]);
  listScenarioExportsMock.mockResolvedValue([]);
  listScenarioStepEditorDocumentRecordsMock.mockResolvedValue([]);
  deleteScenarioStepEditorDocumentRecordMock.mockResolvedValue(undefined);
});

async function verifyAssetReadFacadeLifecycle() {
  const project = createScenarioStoreProjectFixture();
  const assetBlob = new Blob(['asset'], { type: 'image/png' });
  getScenarioProjectMock.mockResolvedValue(project);
  getScenarioAssetMock.mockResolvedValue({
    id: 'asset-1',
    projectId: 'project-1',
    galleryAssetId: null,
    blob: assetBlob,
    mimeType: 'image/png',
    width: 100,
    height: 50,
    createdAt: 30,
    size: assetBlob.size,
  });

  await expect(getScenarioAssetBlob('asset-1')).resolves.toEqual(assetBlob);
  await expect(getScenarioAssetEntry('asset-1')).resolves.toEqual({
    id: 'asset-1',
    projectId: 'project-1',
    galleryAssetId: null,
    mimeType: 'image/png',
    width: 100,
    height: 50,
    createdAt: 30,
    size: assetBlob.size,
  });
  await deleteScenarioAssetRecord('asset-1');

  expect(deleteScenarioAssetMock).toHaveBeenCalledWith('asset-1');
}

async function verifyProjectStepMutationLifecycle() {
  const firstStep = createScenarioCaptureStep({ assetId: 'asset-1', title: 'First' });
  const secondStep = createScenarioCaptureStep({ assetId: 'asset-2', title: 'Second' });
  const project = {
    ...createScenarioStoreProjectFixture(),
    steps: [firstStep, secondStep],
  };
  getScenarioProjectMock.mockResolvedValue(project);

  const reorderedProject = await moveScenarioStepInProject(project.id, secondStep.id, 0);
  const trimmedProject = await deleteScenarioStepFromProject(project.id, firstStep.id);
  getScenarioProjectMock.mockResolvedValue(trimmedProject);
  const restoredProject = await restoreScenarioStepFromProject(project.id, firstStep.id);

  expect(reorderedProject?.steps.map((step) => step.id)).toEqual([secondStep.id, firstStep.id]);
  expect(trimmedProject?.steps.map((step) => step.id)).toEqual([secondStep.id]);
  expect(trimmedProject?.trash.map((entry) => entry.step.id)).toEqual([firstStep.id]);
  expect(restoredProject?.steps.map((step) => step.id)).toEqual([firstStep.id, secondStep.id]);
  expect(restoredProject?.trash).toEqual([]);
  expect(deleteScenarioAssetMock).not.toHaveBeenCalledWith(firstStep.assetId);
}

function createRecorderSidebarFixture() {
  const assetBlob = new Blob(['asset'], { type: 'image/png' });
  const firstStep = createScenarioCaptureStep({ assetId: 'asset-1', title: 'First' });
  const secondStep = createScenarioCaptureStep({ assetId: 'asset-2', title: 'Second' });
  const project = {
    ...createScenarioStoreProjectFixture(),
    steps: [firstStep, secondStep],
  };
  const deletedProject = {
    ...project,
    steps: [secondStep],
    trash: [
      {
        deletedAt: 30,
        originalIndex: 0,
        step: firstStep,
      },
    ],
  };

  return { assetBlob, deletedProject, firstStep, project };
}

function mockRecorderSidebarProjectQueries(args: {
  assetBlob: Blob;
  deletedProject: ReturnType<typeof createRecorderSidebarFixture>['deletedProject'];
  project: ReturnType<typeof createRecorderSidebarFixture>['project'];
}) {
  getScenarioProjectMock
    .mockResolvedValueOnce(args.project)
    .mockResolvedValueOnce(args.deletedProject)
    .mockResolvedValueOnce(args.project)
    .mockResolvedValueOnce(args.deletedProject)
    .mockResolvedValueOnce(undefined)
    .mockResolvedValueOnce(undefined);
  getScenarioAssetMock.mockResolvedValue({
    id: 'asset-1',
    projectId: args.project.id,
    galleryAssetId: null,
    blob: args.assetBlob,
    mimeType: 'image/png',
    width: 100,
    height: 50,
    createdAt: 30,
    size: args.assetBlob.size,
  });
}

async function verifyRecorderSidebarQueries() {
  const { assetBlob, deletedProject, firstStep, project } = createRecorderSidebarFixture();
  mockRecorderSidebarProjectQueries({ assetBlob, deletedProject, project });

  const recentSteps = await listRecentScenarioSteps(project.id);
  const trashedSteps = await listScenarioTrashedSteps(project.id);
  const untouchedDelete = await deleteScenarioStepFromProject(project.id, 'missing');
  const untouchedRestore = await restoreScenarioStepFromProject(project.id, 'missing');
  const missingRecentSteps = await listRecentScenarioSteps('missing');
  const missingTrashedSteps = await listScenarioTrashedSteps('missing');

  expect(recentSteps.map((step) => step.title)).toEqual(['Second', 'First']);
  expect(trashedSteps).toEqual([
    {
      id: firstStep.id,
      deletedAt: 30,
      kind: 'capture',
      originalIndex: 0,
      title: 'First',
    },
  ]);
  expect(untouchedDelete).toBe(project);
  expect(untouchedRestore).toBe(deletedProject);
  expect(missingRecentSteps).toEqual([]);
  expect(missingTrashedSteps).toEqual([]);
  expect(saveScenarioProjectMock).not.toHaveBeenCalled();
}

describe('project-records facade and step queries', () => {
  it(
    'keeps asset read and delete helpers wired through the shared store facade',
    verifyAssetReadFacadeLifecycle
  );
  it(
    'supports explicit step mutations without deleting backing assets',
    verifyProjectStepMutationLifecycle
  );
  it(
    'lists recorder sidebar data and leaves missing-step mutations untouched',
    verifyRecorderSidebarQueries
  );
});

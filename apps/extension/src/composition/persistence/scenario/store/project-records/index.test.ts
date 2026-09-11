import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  blobToDataUrlMock,
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
    listScenarioStepEditorDocumentRecords: listScenarioStepEditorDocumentRecordsMock,
  };
});
import { getScenarioAssetBlob, getScenarioAssetEntry } from './assets';
import {
  deleteScenarioStepFromProject,
  moveScenarioStepInProject,
} from '../project-steps/project-step-persistence';
import { listRecentScenarioSteps } from '../project-steps/project-step-queries';
import {
  createScenarioStoreProjectFixture,
  createCapturedGuideStepFixture,
} from '../test.helpers.ts';

beforeEach(() => {
  vi.clearAllMocks();
  listScenarioProjectsMock.mockResolvedValue([]);
  saveScenarioProjectMock.mockImplementation(async (project) => project);
  blobToDataUrlMock.mockResolvedValue('data:image/png;base64,preview');
  deleteScenarioExportMock.mockResolvedValue(undefined);
  deleteScenarioProjectMock.mockResolvedValue(undefined);
  getScenarioAssetMock.mockResolvedValue(undefined);
  getScenarioProjectMock.mockResolvedValue(undefined);
  listScenarioAssetsMock.mockResolvedValue([]);
  listScenarioExportsMock.mockResolvedValue([]);
  listScenarioStepEditorDocumentRecordsMock.mockResolvedValue([]);
});

async function verifyAssetReadFacadeLifecycle() {
  const project = createScenarioStoreProjectFixture();
  const assetBlob = new Blob(['asset'], { type: 'image/png' });
  getScenarioProjectMock.mockResolvedValue(project);
  getScenarioAssetMock.mockResolvedValue({
    id: 'asset-1',
    projectId: 'project-1',
    galleryAssetId: null,
    assetId: 'opfs-asset-1',
    file: assetBlob,
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
  getScenarioAssetMock.mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined);
  await expect(getScenarioAssetBlob('missing')).resolves.toBeUndefined();
  await expect(getScenarioAssetEntry('missing')).resolves.toBeUndefined();
}

async function verifyProjectStepMutationLifecycle() {
  const firstStep = createCapturedGuideStepFixture('asset-1', 'First');
  const secondStep = createCapturedGuideStepFixture('asset-2', 'Second');
  const project = {
    ...createScenarioStoreProjectFixture(),
    items: [firstStep, secondStep],
  };
  getScenarioProjectMock.mockResolvedValue(project);

  const reorderedProject = await moveScenarioStepInProject(project.id, secondStep.id, 0);
  const trimmedProject = await deleteScenarioStepFromProject(project.id, firstStep.id);

  expect(reorderedProject?.items.map((step) => step.id)).toEqual([secondStep.id, firstStep.id]);
  expect(trimmedProject?.items.map((step) => step.id)).toEqual([secondStep.id]);
}

async function verifyRecorderSidebarQueries() {
  const first = createCapturedGuideStepFixture('asset-1', 'First');
  const second = createCapturedGuideStepFixture('asset-2', 'Second');
  const project = { ...createScenarioStoreProjectFixture(), items: [first, second] };
  getScenarioProjectMock.mockResolvedValue(project);
  getScenarioAssetMock.mockResolvedValue({ file: new Blob(['asset'], { type: 'image/png' }) });
  expect((await listRecentScenarioSteps(project.id)).map((step) => step.title)).toEqual([
    'Second',
    'First',
  ]);
  expect(await deleteScenarioStepFromProject(project.id, 'missing')).toBe(project);
  getScenarioProjectMock.mockResolvedValue(undefined);
  expect(await listRecentScenarioSteps('missing')).toEqual([]);
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

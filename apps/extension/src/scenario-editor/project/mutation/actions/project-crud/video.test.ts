// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';
import { createScenarioCaptureStep } from '../../../../../features/scenario/project/public';

const {
  buildVideoProjectDraftFromScenarioProjectMock,
  deleteVideoProjectMock,
  getScenarioAssetEntryMock,
  openVideoEditorPageMock,
  saveVideoProjectMock,
} = vi.hoisted(() => ({
  buildVideoProjectDraftFromScenarioProjectMock: vi.fn(),
  deleteVideoProjectMock: vi.fn(),
  getScenarioAssetEntryMock: vi.fn(),
  openVideoEditorPageMock: vi.fn(),
  saveVideoProjectMock: vi.fn(),
}));

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../../../../../workflows/scenario-video/draft', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../workflows/scenario-video/draft')>()),
  buildVideoProjectDraftFromScenarioProject: buildVideoProjectDraftFromScenarioProjectMock,
}));

vi.mock('../../../../../composition/persistence/scenario/store/public', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../../composition/persistence/scenario/store/public')
  >()),
  createScenarioProjectRecord: vi.fn(),
  deleteScenarioProjectRecord: vi.fn(),
  getScenarioAssetBlob: vi.fn(),
  getScenarioAssetEntry: getScenarioAssetEntryMock,
  renameScenarioProjectRecord: vi.fn(),
  saveScenarioExportRecord: vi.fn(),
}));

vi.mock(
  '../../../../../composition/persistence/projects/index-mutations',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../../../composition/persistence/projects/index-mutations')
    >()),
    commitVideoProjectMutation: saveVideoProjectMock,
  })
);

vi.mock('../../../../../composition/persistence/projects/index', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../../composition/persistence/projects/index')
  >()),
  deleteVideoProject: deleteVideoProjectMock,
}));

vi.mock('../../../../../platform/navigation/extension-pages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/navigation/extension-pages')>()),
  openVideoEditorPage: openVideoEditorPageMock,
}));

import type { ScenarioProject } from '../../../../../features/scenario/contracts/types/project';
import { createScenarioEditorProjectCrud } from '.';

function createProjectFixture(): ScenarioProject {
  return {
    version: 2,
    id: 'project-1',
    name: 'Project 1',
    createdAt: 10,
    updatedAt: 20,
    steps: [
      {
        ...createScenarioCaptureStep({
          assetId: 'asset-1',
          title: 'First capture',
        }),
        id: 'capture-1',
        createdAt: 30,
        updatedAt: 40,
      },
    ],
    suggestedEvents: [],
    trash: [],
  };
}

function createCrudArgs(project = createProjectFixture()) {
  return {
    applyLoadedProject: vi.fn(),
    browserDriver: { downloadBlob: vi.fn() },
    createName: 'Project',
    loadProjectById: vi.fn(),
    project,
    projectId: project.id,
    projects: [],
    quickEditStepId: null,
    selectedStepId: null,
    setCreateName: vi.fn(),
    setError: vi.fn(),
    setLeftPanelMode: vi.fn(),
    setProjects: vi.fn(),
    syncProjectSummary: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getScenarioAssetEntryMock.mockResolvedValue({
    createdAt: 12,
    galleryAssetId: null,
    height: 720,
    id: 'asset-1',
    mimeType: 'image/png',
    projectId: 'project-1',
    size: 100,
    width: 1280,
  });
  buildVideoProjectDraftFromScenarioProjectMock.mockReturnValue({
    baseRecordingId: null,
    id: 'video-project-1',
  });
  saveVideoProjectMock.mockResolvedValue(undefined);
  deleteVideoProjectMock.mockResolvedValue(undefined);
  openVideoEditorPageMock.mockResolvedValue(undefined);
});

it('materializes the current scenario into a persisted video project and opens the editor', async () => {
  const args = createCrudArgs();
  const crud = createScenarioEditorProjectCrud(args);

  await crud.openVideoEditor();

  expect(getScenarioAssetEntryMock).toHaveBeenCalledWith('asset-1');
  expect(buildVideoProjectDraftFromScenarioProjectMock).toHaveBeenCalledWith({
    assets: {
      'asset-1': {
        createdAt: 12,
        height: 720,
        mimeType: 'image/png',
        name: 'First capture',
        size: 100,
        width: 1280,
      },
    },
    project: args.project,
  });
  expect(saveVideoProjectMock).toHaveBeenCalledWith(
    {
      baseRecordingId: null,
      id: 'video-project-1',
    },
    { baseRevision: null }
  );
  expect(openVideoEditorPageMock).toHaveBeenCalledWith('video-project-1', null);
  expect(args.setError).toHaveBeenCalledWith(null);
});

it('rolls back the saved video draft when opening the editor fails', async () => {
  const args = createCrudArgs();
  const crud = createScenarioEditorProjectCrud(args);
  openVideoEditorPageMock.mockRejectedValue(new Error('open failed'));

  await crud.openVideoEditor();

  expect(saveVideoProjectMock).toHaveBeenCalledWith(
    {
      baseRecordingId: null,
      id: 'video-project-1',
    },
    { baseRevision: null }
  );
  expect(deleteVideoProjectMock).toHaveBeenCalledWith('video-project-1');
  expect(args.setError).toHaveBeenLastCalledWith('scenario.editor.videoProjectCreateFailed');
});

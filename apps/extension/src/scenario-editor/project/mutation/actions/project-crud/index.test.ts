// @vitest-environment jsdom

import type { Dispatch, SetStateAction } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  buildScenarioHtmlExportMock,
  buildScenarioMarkdownExportMock,
  createScenarioProjectRecordMock,
  deleteScenarioProjectRecordMock,
  downloadScenarioEditorBlobMock,
  renameScenarioProjectRecordMock,
  saveScenarioExportRecordMock,
  translateMock,
} = vi.hoisted(() => ({
  buildScenarioHtmlExportMock: vi.fn(),
  buildScenarioMarkdownExportMock: vi.fn(),
  createScenarioProjectRecordMock: vi.fn(),
  deleteScenarioProjectRecordMock: vi.fn(),
  downloadScenarioEditorBlobMock: vi.fn(),
  renameScenarioProjectRecordMock: vi.fn(),
  saveScenarioExportRecordMock: vi.fn(),
  translateMock: vi.fn(() => 'New scenario'),
}));

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: translateMock,
}));

vi.mock('../../../export/html', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../export/html')>()),
  buildScenarioHtmlExport: buildScenarioHtmlExportMock,
}));

vi.mock('../../../export/markdown', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../export/markdown')>()),
  buildScenarioMarkdownExport: buildScenarioMarkdownExportMock,
}));

vi.mock('../../../../../composition/persistence/scenario/store/public', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../../composition/persistence/scenario/store/public')
  >()),
  createScenarioProjectRecord: createScenarioProjectRecordMock,
  deleteScenarioProjectRecord: deleteScenarioProjectRecordMock,
  getScenarioAssetEntry: vi.fn(),
  getScenarioAssetBlob: vi.fn(),
  renameScenarioProjectRecord: renameScenarioProjectRecordMock,
  saveScenarioExportRecord: saveScenarioExportRecordMock,
}));

vi.mock(
  '../../../../../composition/persistence/projects/index-mutations',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../../../composition/persistence/projects/index-mutations')
    >()),

    commitVideoProjectMutation: vi.fn(),
  })
);

vi.mock('../../../../../platform/navigation/extension-pages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/navigation/extension-pages')>()),
  openVideoEditorPage: vi.fn(),
}));

import type {
  ScenarioProject,
  ScenarioProjectSummary,
} from '../../../../../features/scenario/contracts/types/project';
import { createScenarioEditorProjectCrud } from '.';

function createProjectFixture(): ScenarioProject {
  return {
    version: 2,
    id: 'project-1',
    name: 'Project 1',
    createdAt: 10,
    updatedAt: 20,
    steps: [],
    suggestedEvents: [],
    trash: [],
  };
}

function createProjectSummaries(): ScenarioProjectSummary[] {
  return [
    { id: 'project-1', name: 'Project 1', createdAt: 10, updatedAt: 20 },
    { id: 'project-2', name: 'Project 2', createdAt: 15, updatedAt: 25 },
  ];
}

function createCrudArgs(
  overrides: Partial<Parameters<typeof createScenarioEditorProjectCrud>[0]> = {}
) {
  return {
    applyLoadedProject: vi.fn(),
    browserDriver: { downloadBlob: downloadScenarioEditorBlobMock },
    createName: '  ',
    loadProjectById: vi.fn(),
    project: createProjectFixture(),
    projectId: 'project-1',
    projects: createProjectSummaries(),
    quickEditStepId: null,
    selectedStepId: 'step-1',
    setCreateName: vi.fn(),
    setError: vi.fn(),
    setLeftPanelMode: vi.fn(),
    setProjects: vi.fn(),
    syncProjectSummary: vi.fn(),
    ...overrides,
  };
}

function registerProjectCrudFixtures() {
  beforeEach(() => {
    vi.clearAllMocks();
    const htmlBlob = {
      size: 8,
      text: vi.fn().mockResolvedValue('<html />'),
    } as unknown as Blob;

    createScenarioProjectRecordMock.mockResolvedValue(createProjectFixture());
    renameScenarioProjectRecordMock.mockResolvedValue({
      ...createProjectFixture(),
      name: 'Renamed project',
    });
    buildScenarioHtmlExportMock.mockResolvedValue({
      blob: htmlBlob,
      filename: 'scenario.html',
      format: 'html',
    });
    buildScenarioMarkdownExportMock.mockResolvedValue({
      blob: new Blob(['# Scenario'], { type: 'text/markdown' }),
      filename: 'scenario.md',
      format: 'markdown',
    });
    saveScenarioExportRecordMock.mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });
}

function verifiesCreateProjectFlow() {
  it('creates a project with the localized default name and resets the create flow', async () => {
    const args = createCrudArgs({ createName: '   ' });
    const crud = createScenarioEditorProjectCrud(args);

    await crud.createProject();

    expect(translateMock).toHaveBeenCalledWith('scenario.common.defaultProjectName');
    expect(createScenarioProjectRecordMock).toHaveBeenCalledWith('New scenario');
    expect(args.setError).toHaveBeenCalledWith(null);
    expect(args.setCreateName).toHaveBeenCalledWith('');
    expect(args.syncProjectSummary).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'project-1' })
    );
    expect(args.applyLoadedProject).toHaveBeenCalledWith('project-1', expect.any(Object));
    expect(args.setLeftPanelMode).toHaveBeenCalledWith('navigator');
  });
}

function verifiesSelectRenameAndDeleteFlow() {
  it('selects, renames, and deletes projects through the narrowed crud seam', async () => {
    const setProjects = vi.fn((value: SetStateAction<ScenarioProjectSummary[]>) => {
      if (typeof value === 'function') {
        return value(createProjectSummaries());
      }

      return value;
    }) as Dispatch<SetStateAction<ScenarioProjectSummary[]>>;
    const args = createCrudArgs({ setProjects });
    const crud = createScenarioEditorProjectCrud(args);

    await crud.selectProject('project-1');
    await crud.selectProject('project-2');
    await crud.renameProject(' Renamed project ');
    await crud.deleteProject('project-1');

    expect(args.loadProjectById).toHaveBeenCalledWith('project-2');
    expect(renameScenarioProjectRecordMock).toHaveBeenCalledWith('project-1', 'Renamed project');
    expect(args.applyLoadedProject).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({ name: 'Renamed project' }),
      { preferredStepId: 'step-1', preserveQuickEdit: false }
    );
    expect(deleteScenarioProjectRecordMock).toHaveBeenCalledWith('project-1');
    expect(setProjects).toHaveBeenCalledWith(expect.any(Function));
  });
}

function verifiesGuardPaths() {
  it('skips rename and export when required project state is missing', async () => {
    const args = createCrudArgs({ project: null, projectId: null });
    const crud = createScenarioEditorProjectCrud(args);

    await crud.renameProject('Ignored');
    await crud.exportScenario('markdown', 'download', 'png', false);
    await crud.openVideoEditor();

    expect(renameScenarioProjectRecordMock).not.toHaveBeenCalled();
    expect(buildScenarioMarkdownExportMock).not.toHaveBeenCalled();
    expect(downloadScenarioEditorBlobMock).not.toHaveBeenCalled();
  });
}

function verifiesExportFlow() {
  it('exports html to clipboard and markdown through the download driver seam', async () => {
    const args = createCrudArgs();
    const crud = createScenarioEditorProjectCrud(args);
    const clipboard = vi.mocked(navigator.clipboard.writeText);

    await crud.exportScenario('html', 'copy', 'png', true);
    await crud.exportScenario('markdown', 'download', 'svg', false);

    expect(buildScenarioHtmlExportMock).toHaveBeenCalledWith(
      args.project,
      expect.any(Function),
      'png',
      true
    );
    expect(buildScenarioMarkdownExportMock).toHaveBeenCalledWith(
      args.project,
      expect.any(Function),
      'svg'
    );
    expect(clipboard).toHaveBeenCalledWith('<html />');
    expect(downloadScenarioEditorBlobMock).toHaveBeenCalledWith(expect.any(Blob), 'scenario.md');
    expect(saveScenarioExportRecordMock).toHaveBeenCalledTimes(2);
  });
}

function runScenarioEditorProjectCrudSuite() {
  registerProjectCrudFixtures();
  verifiesCreateProjectFlow();
  verifiesSelectRenameAndDeleteFlow();
  verifiesGuardPaths();
  verifiesExportFlow();
}

describe('scenario editor project crud', runScenarioEditorProjectCrudSuite);

// @vitest-environment jsdom

import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  createScenarioCaptureStep,
  createScenarioNoteStep,
  createScenarioProject,
} from '../../../features/scenario/project/public';
import type {
  ScenarioProject,
  ScenarioProjectSummary,
} from '../../../features/scenario/contracts/types/project';
import { getScenarioEditorSessionUrlMocks } from './session-url.test-support';
import { useScenarioEditorProjectState } from './index';

const {
  getScenarioProjectRecordMock,
  listScenarioProjectSummariesMock,
  saveScenarioProjectRecordMock,
} = vi.hoisted(() => ({
  getScenarioProjectRecordMock: vi.fn(),
  listScenarioProjectSummariesMock: vi.fn(),
  saveScenarioProjectRecordMock: vi.fn(),
}));

vi.mock('../../../composition/persistence/scenario/store/public', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/scenario/store/public')
  >()),
  getScenarioProjectRecord: getScenarioProjectRecordMock,
  listScenarioProjectSummaries: listScenarioProjectSummariesMock,
  saveScenarioProjectRecord: saveScenarioProjectRecordMock,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestHarness: ReturnType<typeof useScenarioEditorProjectState> | null = null;
const browserDriver = {
  replaceSelectionInUrl: vi.fn(),
};

function ScenarioEditorProjectStateHarness() {
  const state = useScenarioEditorProjectState(browserDriver);

  useEffect(() => {
    latestHarness = state;
  }, [state]);

  return null;
}

function createProjectFixture(args?: {
  captureTitle?: string;
  noteTitle?: string;
  projectId?: string;
  updatedAt?: number;
}) {
  const baseProject = createScenarioProject('Scenario');
  const captureStep = createScenarioCaptureStep({
    assetId: 'asset-1',
    title: args?.captureTitle ?? 'Capture',
  });
  const noteStep = createScenarioNoteStep({
    title: args?.noteTitle ?? 'Note',
  });

  return {
    captureStep,
    noteStep,
    project: {
      ...baseProject,
      id: args?.projectId ?? 'project-1',
      steps: [captureStep, noteStep],
      updatedAt: args?.updatedAt ?? 20,
    },
  };
}

function getHarness() {
  if (!latestHarness) {
    throw new Error('Scenario editor state harness is not ready');
  }

  return latestHarness;
}

async function flushEffects() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function renderHarness() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<ScenarioEditorProjectStateHarness />);
    await flushEffects();
  });
}

function mockBootstrapProjects(project: ScenarioProject, summaries?: ScenarioProjectSummary[]) {
  listScenarioProjectSummariesMock.mockResolvedValue(
    summaries ?? [
      {
        id: project.id,
        name: project.name,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      },
    ]
  );
  getScenarioProjectRecordMock.mockResolvedValue(project);
}

function createPreservedQuickEditFixture() {
  const projectA = createProjectFixture({ projectId: 'project-a', updatedAt: 20 }).project;
  const projectBFixture = createProjectFixture({
    captureTitle: 'Capture B',
    noteTitle: 'Note B',
    projectId: 'project-b',
    updatedAt: 30,
  });
  const preservedCaptureId = projectA.steps[0]?.id ?? null;
  const projectB = {
    ...projectBFixture.project,
    steps: [
      {
        ...projectBFixture.captureStep,
        id: preservedCaptureId ?? projectBFixture.captureStep.id,
      },
      projectBFixture.noteStep,
    ],
  };

  return { preservedCaptureId, projectA, projectB, projectBFixture };
}

function mockBootstrapProjectSummaries(projectA: ScenarioProject, projectB: ScenarioProject) {
  mockBootstrapProjects(projectA, [
    {
      id: projectA.id,
      name: projectA.name,
      createdAt: projectA.createdAt,
      updatedAt: projectA.updatedAt,
    },
    {
      id: projectB.id,
      name: projectB.name,
      createdAt: projectB.createdAt,
      updatedAt: projectB.updatedAt,
    },
  ]);
  getScenarioProjectRecordMock.mockResolvedValueOnce(projectA).mockResolvedValueOnce(projectB);
}

async function updateProjectKeepingTimestamp(name: string) {
  await act(async () => {
    getHarness().runtime.updateProject((currentProject) => ({
      ...currentProject,
      name,
      updatedAt: currentProject.updatedAt,
    }));
    await flushEffects();
  });
}

async function applyLoadedProjectWithPreservedQuickEdit(args: {
  nextProject: ScenarioProject;
  nextProjectId: string;
  preferredStepId: string;
  quickEditStepId: string | null;
}) {
  await act(async () => {
    getHarness().state.setQuickEditStepId(args.quickEditStepId);
    getHarness().runtime.applyLoadedProject(args.nextProjectId, args.nextProject, {
      preferredStepId: args.preferredStepId,
      preserveQuickEdit: true,
    });
    await flushEffects();
  });
}

async function clearLoadedProject() {
  await act(async () => {
    await getHarness().runtime.loadProjectById(null);
    await flushEffects();
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  vi.spyOn(window.history, 'replaceState').mockImplementation(() => {});
  getScenarioEditorSessionUrlMocks().readScenarioEditorProjectIdMock.mockReturnValue(null);
  getScenarioEditorSessionUrlMocks().readScenarioEditorStepIdMock.mockReturnValue(null);
  saveScenarioProjectRecordMock.mockResolvedValue(undefined);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  latestHarness = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('bootstraps from session ids and exposes the loaded selected step', async () => {
  const { noteStep, project } = createProjectFixture();
  getScenarioEditorSessionUrlMocks().readScenarioEditorProjectIdMock.mockReturnValue(project.id);
  getScenarioEditorSessionUrlMocks().readScenarioEditorStepIdMock.mockReturnValue(noteStep.id);
  mockBootstrapProjects(project);

  await renderHarness();

  expect(listScenarioProjectSummariesMock).toHaveBeenCalledTimes(1);
  expect(getScenarioProjectRecordMock).toHaveBeenCalledWith(project.id);
  expect(getHarness().state.projectId).toBe(project.id);
  expect(getHarness().state.selectedStepId).toBe(noteStep.id);
  expect(getHarness().state.selectedStep?.id).toBe(noteStep.id);
  expect(getHarness().state.quickEditStepId).toBeNull();
  expect(getHarness().state.projects.map((item) => item.id)).toEqual([project.id]);
  expect(getHarness().state.loading).toBe(false);
  expect(getHarness().state.error).toBeNull();
  expect(getHarness().projectHistory.canUndoProject).toBe(false);
});

it('applies loaded projects, preserves valid quick-edit selections, and clears state on null load', async () => {
  const { preservedCaptureId, projectA, projectB, projectBFixture } =
    createPreservedQuickEditFixture();
  mockBootstrapProjectSummaries(projectA, projectB);

  await renderHarness();
  await applyLoadedProjectWithPreservedQuickEdit({
    nextProject: projectB,
    nextProjectId: projectBFixture.project.id,
    preferredStepId: projectBFixture.noteStep.id,
    quickEditStepId: projectA.steps[0]?.id ?? null,
  });

  expect(getHarness().state.projectId).toBe(projectBFixture.project.id);
  expect(getHarness().state.selectedStepId).toBe(projectBFixture.noteStep.id);
  expect(getHarness().state.quickEditStepId).toBe(preservedCaptureId);
  expect(getHarness().state.quickEditStep?.id).toBe(preservedCaptureId);
  await clearLoadedProject();

  expect(getHarness().state.projectId).toBeNull();
  expect(getHarness().state.project).toBeNull();
  expect(getHarness().state.selectedStepId).toBeNull();
  expect(getHarness().state.quickEditStepId).toBeNull();
});

it('tracks history-aware project updates even when updatedAt stays the same', async () => {
  const { project } = createProjectFixture();
  mockBootstrapProjects(project);

  await renderHarness();
  await updateProjectKeepingTimestamp('Updated Scenario');

  expect(getHarness().state.project?.name).toBe('Updated Scenario');
  expect(getHarness().projectHistory.canUndoProject).toBe(true);

  await act(async () => {
    getHarness().projectHistory.undoProjectChange();
    await flushEffects();
  });

  expect(getHarness().state.project?.name).toBe('Scenario');
  expect(getHarness().projectHistory.canRedoProject).toBe(true);
});

it('surfaces bootstrap errors and clears the loading flag', async () => {
  listScenarioProjectSummariesMock.mockRejectedValue(new Error('Failed to load scenarios'));

  await renderHarness();

  expect(getHarness().state.loading).toBe(false);
  expect(getHarness().state.error).toBe('Failed to load scenarios');
  expect(getHarness().state.project).toBeNull();
  expect(getHarness().state.projects).toEqual([]);
});

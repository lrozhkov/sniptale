// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useEffect, useRef, useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  createScenarioCaptureStep,
  createScenarioProject,
} from '../../../../features/scenario/project/public';
import type {
  ScenarioProject,
  ScenarioProjectSummary,
} from '../../../../features/scenario/contracts/types/project';
import {
  useScenarioEditorBootstrap,
  useScenarioEditorProjectLoader,
  useScenarioEditorProjectSummarySync,
  useScenarioEditorProjectUpdater,
} from '.';

const { getScenarioProjectRecordMock, listScenarioProjectSummariesMock } = vi.hoisted(() => ({
  getScenarioProjectRecordMock: vi.fn(),
  listScenarioProjectSummariesMock: vi.fn(),
}));

vi.mock('../../../../composition/persistence/scenario/store/public', () => ({
  getScenarioProjectRecord: getScenarioProjectRecordMock,
  listScenarioProjectSummaries: listScenarioProjectSummariesMock,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestHarness: Record<string, unknown> | null = null;

function createProjectFixture(id = 'project-1', updatedAt = 20): ScenarioProject {
  return {
    ...createScenarioProject('Scenario'),
    id,
    steps: [createScenarioCaptureStep({ assetId: 'asset-1', title: 'Capture' })],
    updatedAt,
  };
}

function getHarness<T extends Record<string, unknown>>() {
  if (!latestHarness) {
    throw new Error('Project state harness is not ready');
  }

  return latestHarness as T;
}

async function flushEffects() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function resetHarnessRoot() {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  latestHarness = null;
}

async function renderHarness(element: React.ReactElement) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(element);
    await flushEffects();
  });
}

function ProjectSummarySyncHarness(props: { initialProjects: ScenarioProjectSummary[] }) {
  const [projects, setProjects] = useState(props.initialProjects);
  const syncProjectSummary = useScenarioEditorProjectSummarySync(setProjects);

  useEffect(() => {
    latestHarness = { projects, syncProjectSummary };
  }, [projects, syncProjectSummary]);

  return null;
}

function ProjectUpdaterHarness(props: { initialProject: ScenarioProject | null }) {
  const [project, setProject] = useState<ScenarioProject | null>(props.initialProject);
  const updateProject = useScenarioEditorProjectUpdater(setProject);

  useEffect(() => {
    latestHarness = { project, updateProject };
  }, [project, updateProject]);

  return null;
}

function ProjectLoaderHarness() {
  const [calls, setCalls] = useState<
    Array<{
      nextProjectId: string | null;
      nextProject: ScenarioProject | null;
      preferredStepId: string | null;
    }>
  >([]);
  const loadProjectById = useScenarioEditorProjectLoader((nextProjectId, nextProject, options) => {
    setCalls((current) => [
      ...current,
      {
        nextProject,
        nextProjectId,
        preferredStepId: options?.preferredStepId ?? null,
      },
    ]);
  });

  useEffect(() => {
    latestHarness = { calls, loadProjectById };
  }, [calls, loadProjectById]);

  return null;
}

function BootstrapHarness() {
  const applyLoadedProjectRef = useRef(vi.fn());
  const applyLoadedProject = applyLoadedProjectRef.current;
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<ScenarioProjectSummary[]>([]);

  useScenarioEditorBootstrap({
    applyLoadedProject,
    initialProjectIdRef: useRef<string | null>(null),
    initialStepIdRef: useRef<string | null>(null),
    setError,
    setLoading,
    setProjects,
  });

  useEffect(() => {
    latestHarness = { applyLoadedProject, error, loading, projects };
  }, [applyLoadedProject, error, loading, projects]);

  return null;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
});

afterEach(() => {
  resetHarnessRoot();
  vi.unstubAllGlobals();
});

it('syncs project summaries and keeps them sorted by updatedAt', async () => {
  const olderProject = createProjectFixture('project-a', 10);
  const newerProject = createProjectFixture('project-b', 30);

  await renderHarness(
    <ProjectSummarySyncHarness
      initialProjects={[
        {
          id: olderProject.id,
          name: olderProject.name,
          createdAt: olderProject.createdAt,
          updatedAt: 10,
        },
      ]}
    />
  );

  await act(async () => {
    getHarness<{ syncProjectSummary: (project: ScenarioProject) => void }>().syncProjectSummary(
      newerProject
    );
    await flushEffects();
  });

  expect(
    getHarness<{ projects: ScenarioProjectSummary[] }>().projects.map((project) => project.id)
  ).toEqual([newerProject.id, olderProject.id]);
});

it('updates existing projects and no-ops when the current project is null', async () => {
  const project = createProjectFixture();
  await renderHarness(<ProjectUpdaterHarness initialProject={project} />);

  await act(async () => {
    getHarness<{
      updateProject: (updater: (current: ScenarioProject) => ScenarioProject) => void;
    }>().updateProject((current) => ({
      ...current,
      name: 'Updated Scenario',
    }));
    await flushEffects();
  });

  expect(getHarness<{ project: ScenarioProject | null }>().project?.name).toBe('Updated Scenario');

  resetHarnessRoot();
  await renderHarness(<ProjectUpdaterHarness initialProject={null} />);

  await act(async () => {
    getHarness<{
      updateProject: (updater: (current: ScenarioProject) => ScenarioProject) => void;
    }>().updateProject((current) => ({
      ...current,
      name: 'Never applied',
    }));
    await flushEffects();
  });

  expect(getHarness<{ project: ScenarioProject | null }>().project).toBeNull();
});

it('loads projects by id, clears state for null ids, and forwards null store results', async () => {
  const project = createProjectFixture('project-2', 40);
  getScenarioProjectRecordMock.mockResolvedValueOnce(project).mockResolvedValueOnce(null);
  await renderHarness(<ProjectLoaderHarness />);

  await act(async () => {
    await getHarness<{
      loadProjectById: (projectId: string | null) => Promise<void>;
    }>().loadProjectById(null);
    await getHarness<{
      loadProjectById: (projectId: string | null) => Promise<void>;
    }>().loadProjectById('project-2');
    await getHarness<{
      loadProjectById: (projectId: string | null) => Promise<void>;
    }>().loadProjectById('missing');
    await flushEffects();
  });

  expect(
    getHarness<{
      calls: Array<{ nextProjectId: string | null; nextProject: ScenarioProject | null }>;
    }>().calls
  ).toEqual([
    { nextProjectId: null, nextProject: null, preferredStepId: null },
    { nextProjectId: 'project-2', nextProject: project, preferredStepId: null },
    { nextProjectId: 'missing', nextProject: null, preferredStepId: null },
  ]);
});

it('bootstraps project summaries and applies the first available project', async () => {
  const project = createProjectFixture('project-boot', 50);
  listScenarioProjectSummariesMock.mockResolvedValue([
    {
      id: project.id,
      name: project.name,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    },
  ]);
  getScenarioProjectRecordMock.mockResolvedValue(project);
  await renderHarness(<BootstrapHarness />);

  expect(getScenarioProjectRecordMock).toHaveBeenCalledWith(project.id);
  expect(
    getHarness<{ projects: ScenarioProjectSummary[] }>().projects.map((item) => item.id)
  ).toEqual([project.id]);
  expect(getHarness<{ loading: boolean }>().loading).toBe(false);
  expect(getHarness<{ error: string | null }>().error).toBeNull();
  expect(
    getHarness<{ applyLoadedProject: ReturnType<typeof vi.fn> }>().applyLoadedProject
  ).toHaveBeenCalledWith(project.id, project, { preferredStepId: null });
});

it('surfaces bootstrap load errors', async () => {
  listScenarioProjectSummariesMock.mockRejectedValue(new Error('Boom'));
  await renderHarness(<BootstrapHarness />);

  expect(getHarness<{ loading: boolean }>().loading).toBe(false);
  expect(getHarness<{ error: string | null }>().error).toBe('Boom');
});

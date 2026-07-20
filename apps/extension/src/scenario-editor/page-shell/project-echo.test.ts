import { expect, it } from 'vitest';
import {
  createScenarioProjectV3,
  createScenarioTextElement,
} from '../../features/scenario/project/v3';
import type { ScenarioProjectV3 } from '@sniptale/runtime-contracts/scenario/types/v3';
import {
  createScenarioProjectEchoState,
  reconcileIncomingScenarioProject,
  rememberScenarioProjectEcho,
} from './project-echo';
import { createInitialEditorSession } from './selection';

it('keeps newer local state when an older emitted project echo arrives late', () => {
  const baseProject = createProject();
  const firstProject = updateTextElement(baseProject, { fontSize: 64 });
  const latestProject = updateTextElement(firstProject, { fontWeight: 800 });
  const echoState = createScenarioProjectEchoState();
  rememberScenarioProjectEcho(echoState, firstProject);
  rememberScenarioProjectEcho(echoState, latestProject);
  const currentSession = {
    ...createInitialEditorSession(latestProject, 'slide-2'),
    selectedElementId: 'text-2',
  };

  const reconciled = reconcileIncomingScenarioProject({
    currentSession,
    emittedProjectEchoState: echoState,
    initialProject: firstProject,
    initialSlideId: null,
    previousInitialSlideId: null,
  });

  expect(reconciled.project).toBe(latestProject);
  expect(reconciled.selectedElementId).toBe('text-2');
});

it('keeps reachable selection when the same project is reloaded outside the local echo stream', () => {
  const baseProject = createProject();
  const refreshedProject = updateProjectName(baseProject, 'Saved refresh');
  const currentSession = {
    ...createInitialEditorSession(baseProject, 'slide-2'),
    selectedElementId: 'text-2',
  };

  const reconciled = reconcileIncomingScenarioProject({
    currentSession,
    emittedProjectEchoState: createScenarioProjectEchoState(),
    initialProject: refreshedProject,
    initialSlideId: null,
    previousInitialSlideId: null,
  });

  expect(reconciled.project).toBe(refreshedProject);
  expect(reconciled.selectedSlideId).toBe('slide-2');
  expect(reconciled.selectedElementId).toBe('text-2');
});

it('starts a new session when the parent replaces the editor with a different project', () => {
  const currentProject = createProject();
  const nextProject = { ...createProject(), id: 'external-project' };
  const currentSession = {
    ...createInitialEditorSession(currentProject, 'slide-2'),
    selectedElementId: 'text-2',
  };

  const reconciled = reconcileIncomingScenarioProject({
    currentSession,
    emittedProjectEchoState: createScenarioProjectEchoState(),
    initialProject: nextProject,
    initialSlideId: null,
    previousInitialSlideId: null,
  });

  expect(reconciled.project).toBe(nextProject);
  expect(reconciled.selectedSlideId).toBe('slide-1');
  expect(reconciled.selectedElementId).toBeNull();
});

it('trims old project echo keys while preserving recent echoes', () => {
  const echoState = createScenarioProjectEchoState();
  const projects = Array.from({ length: 45 }, (_, index) =>
    updateProjectName(createProject(), `Project ${index}`)
  );

  for (const project of projects) {
    rememberScenarioProjectEcho(echoState, project);
  }

  expect(echoState.sequencesByKey.size).toBe(25);
  expect(echoState.latestSequence).toBe(45);
});

function createProject(): ScenarioProjectV3 {
  const project = createScenarioProjectV3('State');
  const firstElement = createScenarioTextElement({ text: 'Title' });
  const secondElement = createScenarioTextElement({ text: 'Second' });
  return {
    ...project,
    slides: [
      { ...project.slides[0]!, elements: [{ ...firstElement, id: 'text-1' }], id: 'slide-1' },
      { ...project.slides[0]!, elements: [{ ...secondElement, id: 'text-2' }], id: 'slide-2' },
    ],
  };
}

function updateTextElement(
  project: ScenarioProjectV3,
  style: Partial<
    Extract<(typeof project.slides)[number]['elements'][number], { kind: 'text' }>['style']
  >
) {
  return {
    ...project,
    slides: project.slides.map((slide) => ({
      ...slide,
      elements: slide.elements.map((element) =>
        element.id === 'text-2' && element.kind === 'text'
          ? { ...element, style: { ...element.style, ...style }, updatedAt: element.updatedAt + 1 }
          : element
      ),
      updatedAt: slide.updatedAt + 1,
    })),
    updatedAt: project.updatedAt + 1,
  };
}

function updateProjectName(project: ScenarioProjectV3, name: string): ScenarioProjectV3 {
  return { ...project, name };
}

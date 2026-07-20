import type { SetStateAction } from 'react';
import { expect, it } from 'vitest';
import { createScenarioProjectV3 } from '../../features/scenario/project/v3';
import type { ScenarioProjectV3 } from '@sniptale/runtime-contracts/scenario/types/v3';
import { createProjectCommands } from './commands';
import type { ScenarioV3EditorSession } from './types';

it('commits project-level deck presentation commands', () => {
  const harness = createSessionHarness();
  const projectCommands = createProjectCommands(harness.setSession);
  const replacement = { ...createProject(), id: 'project-2', name: 'AI replacement' };

  projectCommands.updatePresentation({ themeId: 'graphite' });
  expect(harness.getSession().project.presentation.themeId).toBe('graphite');

  projectCommands.applyProject(replacement);
  expect(harness.getSession().project).toBe(replacement);
  expect(harness.getSession().history.past.length).toBeGreaterThan(0);
});

it('keeps project command no-ops out of history', () => {
  const project = createProject();
  const harness = createSessionHarness(project);
  const projectCommands = createProjectCommands(harness.setSession);

  projectCommands.applyProject(project);

  expect(harness.getSession().project).toBe(project);
  expect(harness.getSession().history.past).toHaveLength(0);
});

function createSessionHarness(initialProject = createProject()) {
  let session: ScenarioV3EditorSession = {
    history: { future: [], past: [] },
    project: initialProject,
    selectedElementId: null,
    selectedSlideId: initialProject.slides[0]?.id ?? null,
  };
  const setSession = (action: SetStateAction<ScenarioV3EditorSession>) => {
    session = typeof action === 'function' ? action(session) : action;
  };

  return { getSession: () => session, setSession };
}

function createProject(): ScenarioProjectV3 {
  const project = createScenarioProjectV3('Commands');
  return {
    ...project,
    id: 'project-1',
    slides: [{ ...project.slides[0]!, id: 'slide-1' }],
  };
}

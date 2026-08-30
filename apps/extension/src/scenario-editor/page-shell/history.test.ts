import { expect, it } from 'vitest';
import { createScenarioProjectV3 } from '../../features/scenario/project/v3';
import { pushProjectHistory, redoProjectHistory, undoProjectHistory } from './history';
import type { ScenarioV3ProjectHistory } from './types';

it('bounds full-project snapshots while preserving undo, redo, and branch order', () => {
  let project = createScenarioProjectV3('Project 0');
  let history: ScenarioV3ProjectHistory = { future: [], past: [] };

  for (let index = 1; index <= 45; index += 1) {
    const nextProject = { ...project, name: `Project ${index}` };
    history = pushProjectHistory(history, project, nextProject);
    project = nextProject;
  }

  expect(history.past).toHaveLength(40);
  for (let index = 0; index < 40; index += 1) {
    const result = undoProjectHistory({ currentProject: project, history });
    expect(result).not.toBeNull();
    if (!result) throw new Error('Expected bounded undo history');
    history = result.history;
    project = result.project;
  }
  expect(project.name).toBe('Project 5');
  expect(undoProjectHistory({ currentProject: project, history })).toBeNull();

  for (let index = 0; index < 40; index += 1) {
    const result = redoProjectHistory({ currentProject: project, history });
    expect(result).not.toBeNull();
    if (!result) throw new Error('Expected bounded redo history');
    history = result.history;
    project = result.project;
  }
  expect(project.name).toBe('Project 45');
  expect(redoProjectHistory({ currentProject: project, history })).toBeNull();

  const branchedProject = { ...project, name: 'Branched project' };
  history = pushProjectHistory(history, project, branchedProject);
  expect(history.future).toEqual([]);
});

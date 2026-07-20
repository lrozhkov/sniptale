import type {
  ScenarioProject,
  ScenarioSuggestedEvent,
  ScenarioStep,
} from '../../contracts/types/project';
import { getNow } from './helpers';

export function appendScenarioStep(project: ScenarioProject, step: ScenarioStep): ScenarioProject {
  return {
    ...project,
    updatedAt: getNow(),
    steps: [...project.steps, step],
  };
}

export function appendScenarioSuggestedEvent(
  project: ScenarioProject,
  event: ScenarioSuggestedEvent
): ScenarioProject {
  return {
    ...project,
    updatedAt: getNow(),
    suggestedEvents: [...project.suggestedEvents, event],
  };
}

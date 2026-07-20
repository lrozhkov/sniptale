import type {
  ScenarioProject,
  ScenarioStep,
  ScenarioStepPatch,
  ScenarioSuggestedEvent,
} from '../../../features/scenario/contracts/types/project';
import { getScenarioMutationTimestamp } from './timestamps';

export type { ScenarioStepPatch } from '../../../features/scenario/contracts/types/project';
export { getScenarioMutationTimestamp } from './timestamps';

export function insertStepAt(
  project: ScenarioProject,
  index: number,
  step: ScenarioStep
): ScenarioProject {
  const steps = project.steps.slice();
  steps.splice(index, 0, step);
  return {
    ...project,
    updatedAt: getScenarioMutationTimestamp(),
    steps,
  };
}

export function moveStep(
  project: ScenarioProject,
  fromIndex: number,
  toIndex: number
): ScenarioProject {
  const nextSteps = project.steps.slice();
  const [step] = nextSteps.splice(fromIndex, 1);
  if (!step) {
    return project;
  }

  nextSteps.splice(toIndex, 0, step);
  return {
    ...project,
    updatedAt: getScenarioMutationTimestamp(),
    steps: nextSteps,
  };
}

export function updateSuggestedEvent(
  project: ScenarioProject,
  eventId: string,
  updater: (event: ScenarioSuggestedEvent) => ScenarioSuggestedEvent
): ScenarioProject {
  return {
    ...project,
    updatedAt: getScenarioMutationTimestamp(),
    suggestedEvents: project.suggestedEvents.map((event) =>
      event.id === eventId ? updater(event) : event
    ),
  };
}

export function updateScenarioStep(
  step: ScenarioStep,
  patch: ScenarioStepPatch,
  updatedAt = getScenarioMutationTimestamp()
): ScenarioStep {
  if (step.kind === 'capture') {
    return {
      ...step,
      title: patch.title ?? step.title,
      body: patch.body ?? step.body,
      ...(() => {
        const annotationRenderMode = patch.annotationRenderMode ?? step.annotationRenderMode;
        return annotationRenderMode === undefined ? {} : { annotationRenderMode };
      })(),
      imageTransform: patch.imageTransform ?? step.imageTransform,
      viewportTransform: patch.viewportTransform ?? step.viewportTransform,
      overlays: patch.overlays ?? step.overlays,
      updatedAt,
    };
  }

  if (step.kind === 'note') {
    return {
      ...step,
      title: patch.title ?? step.title,
      body: patch.body ?? step.body,
      tone: patch.tone ?? step.tone,
      updatedAt,
    };
  }

  if (step.kind === 'section') {
    return {
      ...step,
      title: patch.title ?? step.title,
      body: '',
      updatedAt,
    };
  }

  return {
    ...step,
    title: patch.title ?? step.title,
    body: patch.body ?? step.body,
    updatedAt,
  };
}

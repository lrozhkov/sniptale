import { getScenarioProject, saveScenarioProject } from '../projects';
import type {
  ScenarioProject,
  ScenarioSuggestedEvent,
} from '../../../../features/scenario/contracts/types/project';
import type { ScenarioSuggestedEventKind } from '@sniptale/runtime-contracts/scenario/types/base';
import type { ScenarioTargetDescriptor } from '@sniptale/runtime-contracts/scenario/types/geometry';

function appendSuggestedEvent(
  project: ScenarioProject,
  event: ScenarioSuggestedEvent
): ScenarioProject {
  return {
    ...project,
    updatedAt: Date.now(),
    suggestedEvents: [...project.suggestedEvents, event],
  };
}

/** Stores a non-capture interaction as a suggested scenario event. */
export async function recordScenarioSuggestedEvent(args: {
  projectId: string;
  kind: ScenarioSuggestedEventKind;
  message: string;
  target?: ScenarioTargetDescriptor | null;
  sourceStepId?: string | null;
  data?: Record<string, string | number | boolean | null>;
}): Promise<ScenarioSuggestedEvent> {
  const project = await getScenarioProject(args.projectId);
  if (!project) {
    throw new Error(`Scenario project not found: ${args.projectId}`);
  }

  const event: ScenarioSuggestedEvent = {
    id: crypto.randomUUID(),
    kind: args.kind,
    status: 'pending',
    createdAt: Date.now(),
    message: args.message,
    sourceStepId: args.sourceStepId ?? project.steps.at(-1)?.id ?? null,
    target: args.target ?? null,
    data: args.data ?? {},
  };

  await saveScenarioProject(appendSuggestedEvent(project, event), {
    baseUpdatedAt: project.updatedAt,
  });
  return event;
}

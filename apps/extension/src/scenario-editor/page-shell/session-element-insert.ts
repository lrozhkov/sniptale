import type { ScenarioElement } from '@sniptale/runtime-contracts/scenario/types/v3';
import { pushProjectHistory } from './history';
import { addSlideElement } from './mutations';
import type { ScenarioV3EditorSession } from './types';

export function insertSlideElementIntoSession(args: {
  element: ScenarioElement;
  session: ScenarioV3EditorSession;
  slideId: string;
}): ScenarioV3EditorSession {
  const nextProject = addSlideElement(args.session.project, args.slideId, args.element);
  return {
    ...args.session,
    history: pushProjectHistory(args.session.history, args.session.project, nextProject),
    project: nextProject,
    selectedElementId: args.element.id,
    selectedSlideId: args.slideId,
  };
}

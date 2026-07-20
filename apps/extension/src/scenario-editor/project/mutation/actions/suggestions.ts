import { createScenarioNoteStep } from '../../../../features/scenario/project/public';
import { insertStepAt, updateSuggestedEvent } from '../helpers';
import type { ScenarioProjectSelectionActionArgs, UpdateProject } from './types';

export function createAcceptSuggestedEventAction(args: ScenarioProjectSelectionActionArgs) {
  return (eventId: string) => {
    const nextNoteStep = createScenarioNoteStep({ title: '', body: '' });

    args.updateProject((currentProject) => {
      const event = currentProject.suggestedEvents.find((item) => item.id === eventId);
      if (!event) {
        return currentProject;
      }

      const acceptedNoteStep = {
        ...nextNoteStep,
        title: event.message,
        body: event.target?.text ?? '',
      };
      const insertIndex = event.sourceStepId
        ? currentProject.steps.findIndex((step) => step.id === event.sourceStepId) + 1
        : currentProject.steps.length;
      args.setSelectedStepId(acceptedNoteStep.id);

      return insertStepAt(
        updateSuggestedEvent(currentProject, eventId, (currentEvent) => ({
          ...currentEvent,
          status: 'accepted',
        })),
        insertIndex,
        acceptedNoteStep
      );
    });
  };
}

export function createDismissSuggestedEventAction(updateProject: UpdateProject) {
  return (eventId: string) =>
    updateProject((currentProject) =>
      updateSuggestedEvent(currentProject, eventId, (event) => ({
        ...event,
        status: 'dismissed',
      }))
    );
}

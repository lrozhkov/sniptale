import type { ScenarioProject } from '../../../../../../../features/scenario/contracts/types/project';
import { createLogger } from '@sniptale/platform/observability/logger';
import { parseSuggestedEvent } from '../suggested-event/parse/run';
import { parseStep } from '../step/parse';
import { parseTrashEntry } from '../trash';
import { isPersistedScenarioProjectRecord } from './record';
import { buildSuggestedEventValidators } from './suggested-event-validators';

const logger = createLogger({ namespace: 'SharedScenarioProjectParse' });

export function parseScenarioProject(value: unknown): ScenarioProject | null {
  if (!isPersistedScenarioProjectRecord(value)) {
    return null;
  }

  const validators = buildSuggestedEventValidators();
  const steps = value.steps.map(parseStep).filter((step) => step !== null);
  const trash = (value.trash ?? []).map(parseTrashEntry).filter((entry) => entry !== null);
  const suggestedEvents = value.suggestedEvents
    .map((entry, index) => parseSuggestedEvent(entry, index, validators))
    .filter((event) => event !== null);
  const droppedSteps = value.steps.length - steps.length;
  const droppedTrashEntries = (value.trash ?? []).length - trash.length;
  const droppedSuggestedEvents = value.suggestedEvents.length - suggestedEvents.length;

  if (droppedSteps > 0 || droppedTrashEntries > 0 || droppedSuggestedEvents > 0) {
    logger.warn('Dropped invalid scenario project content while parsing persisted project', {
      droppedSteps,
      droppedSuggestedEvents,
      droppedTrashEntries,
      projectId: value.id,
    });
  }

  return {
    version: 2,
    id: value.id,
    name: value.name,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    tags: value.tags ?? [],
    steps,
    trash,
    suggestedEvents,
  };
}

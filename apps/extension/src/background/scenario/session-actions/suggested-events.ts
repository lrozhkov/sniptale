import { recordScenarioSuggestedEvent } from '../../../composition/persistence/scenario/store/suggested-events';
import type { ScenarioRecordSuggestedEventMessage } from '../../../contracts/messaging/contracts/types';
import { buildScenarioPayloadResponse, type ScenarioRouteContext } from '../router/action-helpers';

export async function handleScenarioRecordSuggestedEvent(
  args: ScenarioRouteContext & { message: ScenarioRecordSuggestedEventMessage }
) {
  const session = await args.scenarioSessionService.getSession(args.resolvedTabId);
  if (!session.projectId) {
    return buildScenarioPayloadResponse(args);
  }

  await recordScenarioSuggestedEvent({
    projectId: session.projectId,
    kind: args.message.kind,
    message: args.message.message,
    target: args.message.target ?? null,
    sourceStepId: args.message.sourceStepId ?? null,
    ...(args.message.data !== undefined ? { data: args.message.data } : {}),
  });
  await args.scenarioSessionService.bumpProjectRevision(args.resolvedTabId);
  return buildScenarioPayloadResponse(args);
}

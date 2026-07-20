import type {
  ScenarioGetRestoreSnapshotMessage,
  ScenarioGetSessionMessage,
  ScenarioListProjectsMessage,
} from '../../../../contracts/messaging/contracts/types';
import type { ScenarioRouteContext } from '../../router/action-helpers';
import { buildScenarioPayloadResponse } from '../../router/action-helpers';

type ScenarioSessionQueryMessage =
  | ScenarioGetSessionMessage
  | ScenarioGetRestoreSnapshotMessage
  | ScenarioListProjectsMessage;

export async function handleScenarioSessionQuery(
  args: ScenarioRouteContext & { message: ScenarioSessionQueryMessage }
) {
  return buildScenarioPayloadResponse(args);
}

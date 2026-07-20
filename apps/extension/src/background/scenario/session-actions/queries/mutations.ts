import type {
  ScenarioSetCaptureModeMessage,
  ScenarioSetEnabledMessage,
  ScenarioSetSidebarVisibleMessage,
  ScenarioUpdateSessionPrefsMessage,
  ScenarioUpdateSurfaceStateMessage,
} from '../../../../contracts/messaging/contracts/types';
import type { ScenarioRouteContext } from '../../router/action-helpers';
import { buildScenarioPayloadResponse } from '../../router/action-helpers';

export async function handleScenarioSetEnabled(
  args: ScenarioRouteContext & { message: ScenarioSetEnabledMessage }
) {
  await args.scenarioSessionService.setEnabled(args.resolvedTabId, args.message.enabled);
  return buildScenarioPayloadResponse(args);
}

export async function handleScenarioSetCaptureMode(
  args: ScenarioRouteContext & { message: ScenarioSetCaptureModeMessage }
) {
  await args.scenarioSessionService.setCaptureMode(args.resolvedTabId, args.message.captureMode);
  return buildScenarioPayloadResponse(args);
}

export async function handleScenarioSetSidebarVisible(
  args: ScenarioRouteContext & { message: ScenarioSetSidebarVisibleMessage }
) {
  await args.scenarioSessionService.setSidebarVisible(
    args.resolvedTabId,
    args.message.sidebarVisible
  );
  return buildScenarioPayloadResponse(args);
}

export async function handleScenarioUpdateSurfaceState(
  args: ScenarioRouteContext & { message: ScenarioUpdateSurfaceStateMessage }
) {
  await args.scenarioSessionService.updateSurfaceState(args.resolvedTabId, args.message.surface);
  return buildScenarioPayloadResponse(args);
}

export async function handleScenarioUpdateSessionPrefs(
  args: ScenarioRouteContext & { message: ScenarioUpdateSessionPrefsMessage }
) {
  await args.scenarioSessionService.setRememberProjectSelection(
    args.resolvedTabId,
    args.message.rememberProjectSelection
  );
  return buildScenarioPayloadResponse(args);
}

import { type ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import type {
  ScenarioCreateProjectMessage,
  ScenarioDeleteStepMessage,
  ScenarioGetRestoreSnapshotMessage,
  ScenarioGetSessionMessage,
  ScenarioListProjectsMessage,
  ScenarioMoveStepMessage,
  ScenarioOpenEditorMessage,
  ScenarioRecordSuggestedEventMessage,
  ScenarioRestoreStepMessage,
  ScenarioSaveCaptureStepMessage,
  ScenarioSetActiveProjectMessage,
  ScenarioSetCaptureModeMessage,
  ScenarioSetEnabledMessage,
  ScenarioSetSidebarVisibleMessage,
  ScenarioUpdateSessionPrefsMessage,
  ScenarioUpdateSurfaceStateMessage,
} from '../../../contracts/messaging/contracts/types';
import type { ScenarioSessionService } from '../session-service';
import {
  handleScenarioCreateProject,
  handleScenarioRecordSuggestedEvent,
  handleScenarioSaveCaptureStep,
  handleScenarioSessionQuery,
  handleScenarioSetActiveProject,
  handleScenarioSetCaptureMode,
  handleScenarioSetEnabled,
  handleScenarioSetSidebarVisible,
  handleScenarioUpdateSessionPrefs,
  handleScenarioUpdateSurfaceState,
} from '../session-actions';
import {
  handleScenarioDeleteStep,
  handleScenarioMoveStep,
  handleScenarioOpenEditor,
  handleScenarioRestoreStep,
} from './step-actions';
import { respondAsyncRoute } from '../../routing-contracts/response';

type ScenarioRouterMessage =
  | ScenarioCreateProjectMessage
  | ScenarioDeleteStepMessage
  | ScenarioGetRestoreSnapshotMessage
  | ScenarioGetSessionMessage
  | ScenarioListProjectsMessage
  | ScenarioMoveStepMessage
  | ScenarioOpenEditorMessage
  | ScenarioRecordSuggestedEventMessage
  | ScenarioRestoreStepMessage
  | ScenarioSaveCaptureStepMessage
  | ScenarioSetActiveProjectMessage
  | ScenarioSetCaptureModeMessage
  | ScenarioSetEnabledMessage
  | ScenarioSetSidebarVisibleMessage
  | ScenarioUpdateSessionPrefsMessage
  | ScenarioUpdateSurfaceStateMessage;

type RouteScenarioMessageArgs = {
  message: ScenarioRouterMessage;
  resolvedTabId: number;
  sendResponse: ResponseSender;
  scenarioSessionService: ScenarioSessionService;
};

type ScenarioRouterResponse =
  | Awaited<ReturnType<typeof handleScenarioSessionQuery>>
  | Awaited<ReturnType<typeof handleScenarioSetEnabled>>
  | Awaited<ReturnType<typeof handleScenarioSetCaptureMode>>
  | Awaited<ReturnType<typeof handleScenarioSetSidebarVisible>>
  | Awaited<ReturnType<typeof handleScenarioUpdateSurfaceState>>
  | Awaited<ReturnType<typeof handleScenarioUpdateSessionPrefs>>
  | Awaited<ReturnType<typeof handleScenarioSetActiveProject>>
  | Awaited<ReturnType<typeof handleScenarioCreateProject>>
  | Awaited<ReturnType<typeof handleScenarioSaveCaptureStep>>
  | Awaited<ReturnType<typeof handleScenarioDeleteStep>>
  | Awaited<ReturnType<typeof handleScenarioMoveStep>>
  | Awaited<ReturnType<typeof handleScenarioRestoreStep>>
  | Awaited<ReturnType<typeof handleScenarioRecordSuggestedEvent>>
  | Awaited<ReturnType<typeof handleScenarioOpenEditor>>;

async function handleScenarioMessage(
  args: RouteScenarioMessageArgs
): Promise<ScenarioRouterResponse> {
  switch (args.message.type) {
    case 'SCENARIO_GET_SESSION':
    case 'SCENARIO_GET_RESTORE_SNAPSHOT':
    case 'SCENARIO_LIST_PROJECTS':
      return handleScenarioSessionQuery({ ...args, message: args.message });
    case 'SCENARIO_SET_ENABLED':
      return handleScenarioSetEnabled({ ...args, message: args.message });
    case 'SCENARIO_SET_CAPTURE_MODE':
      return handleScenarioSetCaptureMode({ ...args, message: args.message });
    case 'SCENARIO_SET_SIDEBAR_VISIBLE':
      return handleScenarioSetSidebarVisible({ ...args, message: args.message });
    case 'SCENARIO_UPDATE_SURFACE_STATE':
      return handleScenarioUpdateSurfaceState({ ...args, message: args.message });
    case 'SCENARIO_UPDATE_SESSION_PREFS':
      return handleScenarioUpdateSessionPrefs({ ...args, message: args.message });
    case 'SCENARIO_SET_ACTIVE_PROJECT':
      return handleScenarioSetActiveProject({ ...args, message: args.message });
    case 'SCENARIO_CREATE_PROJECT':
      return handleScenarioCreateProject({ ...args, message: args.message });
    case 'SCENARIO_SAVE_CAPTURE_STEP':
      return handleScenarioSaveCaptureStep({ ...args, message: args.message });
    case 'SCENARIO_DELETE_STEP':
      return handleScenarioDeleteStep({ ...args, message: args.message });
    case 'SCENARIO_MOVE_STEP':
      return handleScenarioMoveStep({ ...args, message: args.message });
    case 'SCENARIO_RESTORE_STEP':
      return handleScenarioRestoreStep({ ...args, message: args.message });
    case 'SCENARIO_RECORD_SUGGESTED_EVENT':
      return handleScenarioRecordSuggestedEvent({ ...args, message: args.message });
    case 'SCENARIO_OPEN_EDITOR':
      return handleScenarioOpenEditor({ ...args, message: args.message });
  }

  throw new Error(`Unhandled scenario router message: ${JSON.stringify(args.message)}`);
}

export function routeScenarioMessage(args: RouteScenarioMessageArgs): boolean {
  respondAsyncRoute(handleScenarioMessage(args), args.sendResponse);
  return true;
}

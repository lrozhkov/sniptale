import type { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { RuntimeMessageResponse } from '@sniptale/runtime-contracts/messaging/contracts/response';
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
} from './types';
import type { ScenarioSessionResponse } from '../contracts/response-types';

export type RuntimeScenarioRequestByType = {
  [MessageType.SCENARIO_GET_SESSION]: ScenarioGetSessionMessage;
  [MessageType.SCENARIO_GET_RESTORE_SNAPSHOT]: ScenarioGetRestoreSnapshotMessage;
  [MessageType.SCENARIO_SET_ENABLED]: ScenarioSetEnabledMessage;
  [MessageType.SCENARIO_SET_CAPTURE_MODE]: ScenarioSetCaptureModeMessage;
  [MessageType.SCENARIO_SET_SIDEBAR_VISIBLE]: ScenarioSetSidebarVisibleMessage;
  [MessageType.SCENARIO_UPDATE_SURFACE_STATE]: ScenarioUpdateSurfaceStateMessage;
  [MessageType.SCENARIO_UPDATE_SESSION_PREFS]: ScenarioUpdateSessionPrefsMessage;
  [MessageType.SCENARIO_SET_ACTIVE_PROJECT]: ScenarioSetActiveProjectMessage;
  [MessageType.SCENARIO_LIST_PROJECTS]: ScenarioListProjectsMessage;
  [MessageType.SCENARIO_CREATE_PROJECT]: ScenarioCreateProjectMessage;
  [MessageType.SCENARIO_SAVE_CAPTURE_STEP]: ScenarioSaveCaptureStepMessage;
  [MessageType.SCENARIO_DELETE_STEP]: ScenarioDeleteStepMessage;
  [MessageType.SCENARIO_RESTORE_STEP]: ScenarioRestoreStepMessage;
  [MessageType.SCENARIO_MOVE_STEP]: ScenarioMoveStepMessage;
  [MessageType.SCENARIO_RECORD_SUGGESTED_EVENT]: ScenarioRecordSuggestedEventMessage;
  [MessageType.SCENARIO_OPEN_EDITOR]: ScenarioOpenEditorMessage;
};

export type RuntimeScenarioResponseByType = {
  [MessageType.SCENARIO_GET_SESSION]: ScenarioSessionResponse;
  [MessageType.SCENARIO_GET_RESTORE_SNAPSHOT]: ScenarioSessionResponse;
  [MessageType.SCENARIO_SET_ENABLED]: ScenarioSessionResponse;
  [MessageType.SCENARIO_SET_CAPTURE_MODE]: ScenarioSessionResponse;
  [MessageType.SCENARIO_SET_SIDEBAR_VISIBLE]: ScenarioSessionResponse;
  [MessageType.SCENARIO_UPDATE_SURFACE_STATE]: ScenarioSessionResponse;
  [MessageType.SCENARIO_UPDATE_SESSION_PREFS]: ScenarioSessionResponse;
  [MessageType.SCENARIO_SET_ACTIVE_PROJECT]: ScenarioSessionResponse;
  [MessageType.SCENARIO_LIST_PROJECTS]: ScenarioSessionResponse;
  [MessageType.SCENARIO_CREATE_PROJECT]: ScenarioSessionResponse;
  [MessageType.SCENARIO_SAVE_CAPTURE_STEP]: ScenarioSessionResponse;
  [MessageType.SCENARIO_DELETE_STEP]: ScenarioSessionResponse;
  [MessageType.SCENARIO_RESTORE_STEP]: ScenarioSessionResponse;
  [MessageType.SCENARIO_MOVE_STEP]: ScenarioSessionResponse;
  [MessageType.SCENARIO_RECORD_SUGGESTED_EVENT]: ScenarioSessionResponse;
  [MessageType.SCENARIO_OPEN_EDITOR]: RuntimeMessageResponse<{
    result?: string;
  }>;
};

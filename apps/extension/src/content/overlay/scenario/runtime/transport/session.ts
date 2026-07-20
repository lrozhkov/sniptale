import { getContentRuntimeServices } from '../../../../application/runtime-services/services';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { ScenarioCaptureMode } from '@sniptale/runtime-contracts/scenario/types/base';
import type { ScenarioRecorderSurfaceState } from '@sniptale/runtime-contracts/scenario/types/session';

export function requestScenarioRestoreSnapshot() {
  return getContentRuntimeServices().messaging.sendRuntimeMessage({
    type: MessageType.SCENARIO_GET_RESTORE_SNAPSHOT,
  });
}

export function updateScenarioSurfaceState(surface: ScenarioRecorderSurfaceState) {
  return getContentRuntimeServices().messaging.sendRuntimeMessage({
    type: MessageType.SCENARIO_UPDATE_SURFACE_STATE,
    surface,
  });
}

export function setScenarioEnabled(enabled: boolean) {
  return getContentRuntimeServices().messaging.sendRuntimeMessage({
    type: MessageType.SCENARIO_SET_ENABLED,
    enabled,
  });
}

export function setScenarioCaptureMode(captureMode: ScenarioCaptureMode) {
  return getContentRuntimeServices().messaging.sendRuntimeMessage({
    type: MessageType.SCENARIO_SET_CAPTURE_MODE,
    captureMode,
  });
}

export function setScenarioRememberSelection(rememberProjectSelection: boolean) {
  return getContentRuntimeServices().messaging.sendRuntimeMessage({
    type: MessageType.SCENARIO_UPDATE_SESSION_PREFS,
    rememberProjectSelection,
  });
}

export function setScenarioSidebarVisible(sidebarVisible: boolean) {
  return getContentRuntimeServices().messaging.sendRuntimeMessage({
    type: MessageType.SCENARIO_SET_SIDEBAR_VISIBLE,
    sidebarVisible,
  });
}

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

export const scenarioRouteMessageTypes = [
  MessageType.SCENARIO_GET_SESSION,
  MessageType.SCENARIO_GET_RESTORE_SNAPSHOT,
  MessageType.SCENARIO_SET_ENABLED,
  MessageType.SCENARIO_SET_CAPTURE_MODE,
  MessageType.SCENARIO_SET_SIDEBAR_VISIBLE,
  MessageType.SCENARIO_UPDATE_SURFACE_STATE,
  MessageType.SCENARIO_UPDATE_SESSION_PREFS,
  MessageType.SCENARIO_SET_ACTIVE_PROJECT,
  MessageType.SCENARIO_LIST_PROJECTS,
  MessageType.SCENARIO_CREATE_PROJECT,
  MessageType.SCENARIO_SAVE_CAPTURE_STEP,
  MessageType.SCENARIO_DELETE_STEP,
  MessageType.SCENARIO_MOVE_STEP,
  MessageType.SCENARIO_RECORD_SUGGESTED_EVENT,
  MessageType.SCENARIO_OPEN_EDITOR,
  MessageType.SCENARIO_RESTORE_STEP,
] as const;

export const scenarioRouteDescriptor = {
  actionKind: 'tab',
  authorityFamily: 'scenario-privileged-tab-route',
  handlerAdapter: 'routeTabAction',
  keepChannelBehaviorSource: 'tab-routing-adapter',
  messageTypes: scenarioRouteMessageTypes,
  ownerModule: 'apps/extension/src/background/scenario/router/index.ts',
} as const;

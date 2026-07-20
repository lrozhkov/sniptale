import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createGuardParser } from '@sniptale/runtime-contracts/messaging/parsers/utils';
import {
  createMessageGuard,
  isBoolean,
  isImageDataUrl,
  isNullable,
  isNumber,
  isString,
} from '../../validators/index';
import {
  isScenarioCaptureMode,
  isScenarioCaptureMetadata,
  isScenarioCaptureSourceKind,
  isScenarioCaptureSurface,
  isScenarioRecorderSurfaceState,
  isScenarioPageDescriptor,
  isScenarioPoint,
  isScenarioSuggestedEventKind,
  isScenarioStringDataRecord,
  isScenarioTargetDescriptor,
} from '../validators/index';
import type { PartialRuntimeRegistry } from '../../contracts/runtime-message.registry.ts';
import { createScenarioRuntimeResponseParser } from './helpers';
import { runtimeActionScenarioStepMessageContracts } from './step-actions';

export const runtimeActionScenarioMessageContracts = {
  [MessageType.SCENARIO_GET_SESSION]: {
    parseRequest: createGuardParser(
      'runtime SCENARIO_GET_SESSION message',
      createMessageGuard({
        type: MessageType.SCENARIO_GET_SESSION,
        optional: { tabId: isNumber },
      })
    ),
    parseResponse: createScenarioRuntimeResponseParser(MessageType.SCENARIO_GET_SESSION),
  },
  [MessageType.SCENARIO_SET_ENABLED]: {
    parseRequest: createGuardParser(
      'runtime SCENARIO_SET_ENABLED message',
      createMessageGuard({
        type: MessageType.SCENARIO_SET_ENABLED,
        required: { enabled: isBoolean },
        optional: { tabId: isNumber },
      })
    ),
    parseResponse: createScenarioRuntimeResponseParser(MessageType.SCENARIO_SET_ENABLED),
  },
  [MessageType.SCENARIO_GET_RESTORE_SNAPSHOT]: {
    parseRequest: createGuardParser(
      'runtime SCENARIO_GET_RESTORE_SNAPSHOT message',
      createMessageGuard({
        type: MessageType.SCENARIO_GET_RESTORE_SNAPSHOT,
        optional: { tabId: isNumber },
      })
    ),
    parseResponse: createScenarioRuntimeResponseParser(MessageType.SCENARIO_GET_RESTORE_SNAPSHOT),
  },
  [MessageType.SCENARIO_SET_CAPTURE_MODE]: {
    parseRequest: createGuardParser(
      'runtime SCENARIO_SET_CAPTURE_MODE message',
      createMessageGuard({
        type: MessageType.SCENARIO_SET_CAPTURE_MODE,
        required: { captureMode: isScenarioCaptureMode },
        optional: { tabId: isNumber },
      })
    ),
    parseResponse: createScenarioRuntimeResponseParser(MessageType.SCENARIO_SET_CAPTURE_MODE),
  },
  [MessageType.SCENARIO_SET_SIDEBAR_VISIBLE]: {
    parseRequest: createGuardParser(
      'runtime SCENARIO_SET_SIDEBAR_VISIBLE message',
      createMessageGuard({
        type: MessageType.SCENARIO_SET_SIDEBAR_VISIBLE,
        required: { sidebarVisible: isBoolean },
        optional: { tabId: isNumber },
      })
    ),
    parseResponse: createScenarioRuntimeResponseParser(MessageType.SCENARIO_SET_SIDEBAR_VISIBLE),
  },
  [MessageType.SCENARIO_UPDATE_SURFACE_STATE]: {
    parseRequest: createGuardParser(
      'runtime SCENARIO_UPDATE_SURFACE_STATE message',
      createMessageGuard({
        type: MessageType.SCENARIO_UPDATE_SURFACE_STATE,
        required: { surface: isScenarioRecorderSurfaceState },
        optional: { tabId: isNumber },
      })
    ),
    parseResponse: createScenarioRuntimeResponseParser(MessageType.SCENARIO_UPDATE_SURFACE_STATE),
  },
  [MessageType.SCENARIO_UPDATE_SESSION_PREFS]: {
    parseRequest: createGuardParser(
      'runtime SCENARIO_UPDATE_SESSION_PREFS message',
      createMessageGuard({
        type: MessageType.SCENARIO_UPDATE_SESSION_PREFS,
        required: { rememberProjectSelection: isBoolean },
        optional: { tabId: isNumber },
      })
    ),
    parseResponse: createScenarioRuntimeResponseParser(MessageType.SCENARIO_UPDATE_SESSION_PREFS),
  },
  [MessageType.SCENARIO_SET_ACTIVE_PROJECT]: {
    parseRequest: createGuardParser(
      'runtime SCENARIO_SET_ACTIVE_PROJECT message',
      createMessageGuard({
        type: MessageType.SCENARIO_SET_ACTIVE_PROJECT,
        required: { projectId: isNullable(isString) },
        optional: {
          rememberProjectSelection: isBoolean,
          tabId: isNumber,
        },
      })
    ),
    parseResponse: createScenarioRuntimeResponseParser(MessageType.SCENARIO_SET_ACTIVE_PROJECT),
  },
  [MessageType.SCENARIO_LIST_PROJECTS]: {
    parseRequest: createGuardParser(
      'runtime SCENARIO_LIST_PROJECTS message',
      createMessageGuard({
        type: MessageType.SCENARIO_LIST_PROJECTS,
      })
    ),
    parseResponse: createScenarioRuntimeResponseParser(MessageType.SCENARIO_LIST_PROJECTS),
  },
  [MessageType.SCENARIO_CREATE_PROJECT]: {
    parseRequest: createGuardParser(
      'runtime SCENARIO_CREATE_PROJECT message',
      createMessageGuard({
        type: MessageType.SCENARIO_CREATE_PROJECT,
        required: { name: isString },
        optional: {
          tabId: isNumber,
          rememberProjectSelection: isBoolean,
        },
      })
    ),
    parseResponse: createScenarioRuntimeResponseParser(MessageType.SCENARIO_CREATE_PROJECT),
  },
  [MessageType.SCENARIO_SAVE_CAPTURE_STEP]: {
    parseRequest: createGuardParser(
      'runtime SCENARIO_SAVE_CAPTURE_STEP message',
      createMessageGuard({
        type: MessageType.SCENARIO_SAVE_CAPTURE_STEP,
        required: {
          dataUrl: isImageDataUrl,
          filename: isString,
          captureSurface: isScenarioCaptureSurface,
          sourceKind: isScenarioCaptureSourceKind,
          page: isScenarioPageDescriptor,
        },
        optional: {
          target: isNullable(isScenarioTargetDescriptor),
          interactionPoint: isNullable(isScenarioPoint),
          cursorPoint: isNullable(isScenarioPoint),
          captureMetadata: isScenarioCaptureMetadata,
          title: isString,
          body: isString,
          tabId: isNumber,
        },
      })
    ),
    parseResponse: createScenarioRuntimeResponseParser(MessageType.SCENARIO_SAVE_CAPTURE_STEP),
  },
  [MessageType.SCENARIO_RECORD_SUGGESTED_EVENT]: {
    parseRequest: createGuardParser(
      'runtime SCENARIO_RECORD_SUGGESTED_EVENT message',
      createMessageGuard({
        type: MessageType.SCENARIO_RECORD_SUGGESTED_EVENT,
        required: {
          kind: isScenarioSuggestedEventKind,
          message: isString,
        },
        optional: {
          target: isNullable(isScenarioTargetDescriptor),
          sourceStepId: isNullable(isString),
          data: isScenarioStringDataRecord,
          tabId: isNumber,
        },
      })
    ),
    parseResponse: createScenarioRuntimeResponseParser(MessageType.SCENARIO_RECORD_SUGGESTED_EVENT),
  },
  ...runtimeActionScenarioStepMessageContracts,
} satisfies PartialRuntimeRegistry;

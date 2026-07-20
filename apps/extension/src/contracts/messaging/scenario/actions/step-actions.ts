import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createGuardParser } from '@sniptale/runtime-contracts/messaging/parsers/utils';
import {
  createMessageGuard,
  createRuntimeResponseGuard,
  isNullable,
  isNumber,
  isString,
} from '../../validators/index';
import type { PartialRuntimeRegistry } from '../../contracts/runtime-message.registry.ts';
import { createScenarioRuntimeResponseParser } from './helpers';

export const runtimeActionScenarioStepMessageContracts = {
  [MessageType.SCENARIO_DELETE_STEP]: {
    parseRequest: createGuardParser(
      'runtime SCENARIO_DELETE_STEP message',
      createMessageGuard({
        type: MessageType.SCENARIO_DELETE_STEP,
        required: {
          projectId: isString,
          stepId: isString,
        },
        optional: { tabId: isNumber },
      })
    ),
    parseResponse: createScenarioRuntimeResponseParser(MessageType.SCENARIO_DELETE_STEP),
  },
  [MessageType.SCENARIO_RESTORE_STEP]: {
    parseRequest: createGuardParser(
      'runtime SCENARIO_RESTORE_STEP message',
      createMessageGuard({
        type: MessageType.SCENARIO_RESTORE_STEP,
        required: {
          projectId: isString,
          stepId: isString,
        },
        optional: { tabId: isNumber },
      })
    ),
    parseResponse: createScenarioRuntimeResponseParser(MessageType.SCENARIO_RESTORE_STEP),
  },
  [MessageType.SCENARIO_MOVE_STEP]: {
    parseRequest: createGuardParser(
      'runtime SCENARIO_MOVE_STEP message',
      createMessageGuard({
        type: MessageType.SCENARIO_MOVE_STEP,
        required: {
          projectId: isString,
          stepId: isString,
          toIndex: isNumber,
        },
        optional: { tabId: isNumber },
      })
    ),
    parseResponse: createScenarioRuntimeResponseParser(MessageType.SCENARIO_MOVE_STEP),
  },
  [MessageType.SCENARIO_OPEN_EDITOR]: {
    parseRequest: createGuardParser(
      'runtime SCENARIO_OPEN_EDITOR message',
      createMessageGuard({
        type: MessageType.SCENARIO_OPEN_EDITOR,
        optional: {
          projectId: isNullable(isString),
          stepId: isNullable(isString),
        },
      })
    ),
    parseResponse: createGuardParser(
      'runtime SCENARIO_OPEN_EDITOR response',
      createRuntimeResponseGuard({ optional: { result: isString } })
    ),
  },
} satisfies PartialRuntimeRegistry;

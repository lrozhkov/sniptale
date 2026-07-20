import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  createGuardParser,
  type MessageContractRegistry,
} from '@sniptale/runtime-contracts/messaging/parsers/utils';
import type { RuntimeRequestByType, RuntimeResponseByType } from '../runtime-message/index';
import {
  createMessageGuard,
  createRuntimeResponseGuard,
  isBoolean,
  isNullable,
  isNumber,
  isQuickActionOverlay,
  isSize2d,
  isString,
} from '../../validators/index';
import * as ContentActionContract from '@sniptale/runtime-contracts/protocol/content-privileged-action';

type PartialRuntimeRegistry = Partial<
  MessageContractRegistry<RuntimeRequestByType, RuntimeResponseByType>
>;

const asyncRouteAckFields = { result: isString };

export const runtimeModeMessageContracts = {
  [MessageType.ENABLE_SCREENSHOT_MODE]: {
    parseRequest: createGuardParser(
      'runtime ENABLE_SCREENSHOT_MODE message',
      createMessageGuard({
        type: MessageType.ENABLE_SCREENSHOT_MODE,
        optional: {
          tabId: isNumber,
          viewport: isNullable(isSize2d),
          quickActionOverlay: isQuickActionOverlay,
          autoStartSelection: isBoolean,
          autoStartCaptureType: isString,
          contentIntentGrant: ContentActionContract.isContentPrivilegedActionAutoStartGrant,
        },
      })
    ),
    parseResponse: createGuardParser(
      'runtime ENABLE_SCREENSHOT_MODE response',
      createRuntimeResponseGuard({ allowUndefined: true, optional: asyncRouteAckFields })
    ),
  },
  [MessageType.DISABLE_SCREENSHOT_MODE]: {
    parseRequest: createGuardParser(
      'runtime DISABLE_SCREENSHOT_MODE message',
      createMessageGuard({
        type: MessageType.DISABLE_SCREENSHOT_MODE,
        optional: { tabId: isNumber },
      })
    ),
    parseResponse: createGuardParser(
      'runtime DISABLE_SCREENSHOT_MODE response',
      createRuntimeResponseGuard({ allowUndefined: true, optional: asyncRouteAckFields })
    ),
  },
  [MessageType.SCREENSHOT_MODE_STATUS]: {
    parseRequest: createGuardParser(
      'runtime SCREENSHOT_MODE_STATUS message',
      createMessageGuard({
        type: MessageType.SCREENSHOT_MODE_STATUS,
        optional: { tabId: isNumber },
      })
    ),
    parseResponse: createGuardParser(
      'runtime SCREENSHOT_MODE_STATUS response',
      createRuntimeResponseGuard({
        optional: {
          documentId: isString,
          enabled: isBoolean,
          supported: isBoolean,
          tabId: isNumber,
          unsupportedReason: isNullable(isString),
          viewport: isNullable(isSize2d),
        },
      })
    ),
  },
  [MessageType.ENABLE_HIGHLIGHTER_MODE]: {
    parseRequest: createGuardParser(
      'runtime ENABLE_HIGHLIGHTER_MODE message',
      createMessageGuard({
        type: MessageType.ENABLE_HIGHLIGHTER_MODE,
        optional: { tabId: isNumber },
      })
    ),
    parseResponse: createGuardParser(
      'runtime ENABLE_HIGHLIGHTER_MODE response',
      createRuntimeResponseGuard({ allowUndefined: true, optional: { result: isString } })
    ),
  },
  [MessageType.DISABLE_HIGHLIGHTER_MODE]: {
    parseRequest: createGuardParser(
      'runtime DISABLE_HIGHLIGHTER_MODE message',
      createMessageGuard({
        type: MessageType.DISABLE_HIGHLIGHTER_MODE,
        optional: { tabId: isNumber },
      })
    ),
    parseResponse: createGuardParser(
      'runtime DISABLE_HIGHLIGHTER_MODE response',
      createRuntimeResponseGuard({ allowUndefined: true, optional: { result: isString } })
    ),
  },
  [MessageType.HIGHLIGHTER_MODE_STATUS]: {
    parseRequest: createGuardParser(
      'runtime HIGHLIGHTER_MODE_STATUS message',
      createMessageGuard({
        type: MessageType.HIGHLIGHTER_MODE_STATUS,
        optional: { tabId: isNumber },
      })
    ),
    parseResponse: createGuardParser(
      'runtime HIGHLIGHTER_MODE_STATUS response',
      createRuntimeResponseGuard({ optional: { enabled: isBoolean } })
    ),
  },
  [MessageType.ENABLE_QUICK_EDIT_MODE]: {
    parseRequest: createGuardParser(
      'runtime ENABLE_QUICK_EDIT_MODE message',
      createMessageGuard({
        type: MessageType.ENABLE_QUICK_EDIT_MODE,
        optional: { tabId: isNumber },
      })
    ),
    parseResponse: createGuardParser(
      'runtime ENABLE_QUICK_EDIT_MODE response',
      createRuntimeResponseGuard({ allowUndefined: true, optional: { result: isString } })
    ),
  },
  [MessageType.DISABLE_QUICK_EDIT_MODE]: {
    parseRequest: createGuardParser(
      'runtime DISABLE_QUICK_EDIT_MODE message',
      createMessageGuard({
        type: MessageType.DISABLE_QUICK_EDIT_MODE,
        optional: { tabId: isNumber },
      })
    ),
    parseResponse: createGuardParser(
      'runtime DISABLE_QUICK_EDIT_MODE response',
      createRuntimeResponseGuard({ allowUndefined: true, optional: { result: isString } })
    ),
  },
  [MessageType.QUICK_EDIT_MODE_STATUS]: {
    parseRequest: createGuardParser(
      'runtime QUICK_EDIT_MODE_STATUS message',
      createMessageGuard({
        type: MessageType.QUICK_EDIT_MODE_STATUS,
        optional: { tabId: isNumber },
      })
    ),
    parseResponse: createGuardParser(
      'runtime QUICK_EDIT_MODE_STATUS response',
      createRuntimeResponseGuard({ optional: { enabled: isBoolean } })
    ),
  },
  [MessageType.SET_VIEWPORT]: {
    parseRequest: createGuardParser(
      'runtime SET_VIEWPORT message',
      createMessageGuard({
        type: MessageType.SET_VIEWPORT,
        optional: { width: isNumber, height: isNumber, tabId: isNumber },
      })
    ),
    parseResponse: createGuardParser(
      'runtime SET_VIEWPORT response',
      createRuntimeResponseGuard({ optional: { result: isString } })
    ),
  },
  [MessageType.GET_VIEWPORT_STATUS]: {
    parseRequest: createGuardParser(
      'runtime GET_VIEWPORT_STATUS message',
      createMessageGuard({
        type: MessageType.GET_VIEWPORT_STATUS,
        optional: { tabId: isNumber },
      })
    ),
    parseResponse: createGuardParser(
      'runtime GET_VIEWPORT_STATUS response',
      createRuntimeResponseGuard({ optional: { viewport: isNullable(isSize2d) } })
    ),
  },
} satisfies PartialRuntimeRegistry;

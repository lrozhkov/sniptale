import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  createGuardParser,
  type MessageContractRegistry,
} from '@sniptale/runtime-contracts/messaging/parsers/utils';
import { runtimeMessageContracts } from '../../contracts/runtime';
import { tabUiExportMessageContracts } from './ui-export';
import { tabWebSnapshotMessageContracts } from './web-snapshot';
import type { TabRequestByType, TabResponseByType } from '../index';
import {
  createMessageGuard,
  createRuntimeResponseGuard,
  isBoolean,
  isClipboardTextWithinLimit,
  isImageDataUrl,
  isNullable,
  isNumber,
  isShowToastPayload,
  isSize2d,
  isString,
} from '../../validators/index';

type PartialTabRegistry = Partial<MessageContractRegistry<TabRequestByType, TabResponseByType>>;

export const tabUiMessageContracts = {
  [MessageType.ENABLE_SCREENSHOT_MODE]: {
    parseRequest: runtimeMessageContracts[MessageType.ENABLE_SCREENSHOT_MODE].parseRequest,
    parseResponse: createGuardParser(
      'tab ENABLE_SCREENSHOT_MODE response',
      createRuntimeResponseGuard()
    ),
  },
  [MessageType.DISABLE_SCREENSHOT_MODE]: {
    parseRequest: runtimeMessageContracts[MessageType.DISABLE_SCREENSHOT_MODE].parseRequest,
    parseResponse: createGuardParser(
      'tab DISABLE_SCREENSHOT_MODE response',
      createRuntimeResponseGuard()
    ),
  },
  [MessageType.ENABLE_HIGHLIGHTER_MODE]: {
    parseRequest: runtimeMessageContracts[MessageType.ENABLE_HIGHLIGHTER_MODE].parseRequest,
    parseResponse: createGuardParser(
      'tab ENABLE_HIGHLIGHTER_MODE response',
      createRuntimeResponseGuard()
    ),
  },
  [MessageType.DISABLE_HIGHLIGHTER_MODE]: {
    parseRequest: runtimeMessageContracts[MessageType.DISABLE_HIGHLIGHTER_MODE].parseRequest,
    parseResponse: createGuardParser(
      'tab DISABLE_HIGHLIGHTER_MODE response',
      createRuntimeResponseGuard()
    ),
  },
  [MessageType.ENABLE_QUICK_EDIT_MODE]: {
    parseRequest: runtimeMessageContracts[MessageType.ENABLE_QUICK_EDIT_MODE].parseRequest,
    parseResponse: createGuardParser(
      'tab ENABLE_QUICK_EDIT_MODE response',
      createRuntimeResponseGuard()
    ),
  },
  [MessageType.DISABLE_QUICK_EDIT_MODE]: {
    parseRequest: runtimeMessageContracts[MessageType.DISABLE_QUICK_EDIT_MODE].parseRequest,
    parseResponse: createGuardParser(
      'tab DISABLE_QUICK_EDIT_MODE response',
      createRuntimeResponseGuard()
    ),
  },
  [MessageType.SHOW_TOOLBAR]: {
    parseRequest: createGuardParser(
      'tab SHOW_TOOLBAR message',
      createMessageGuard({
        type: MessageType.SHOW_TOOLBAR,
        optional: { tabId: isNumber },
      })
    ),
    parseResponse: createGuardParser('tab SHOW_TOOLBAR response', createRuntimeResponseGuard()),
  },
  [MessageType.HIDE_TOOLBAR]: {
    parseRequest: createGuardParser(
      'tab HIDE_TOOLBAR message',
      createMessageGuard({
        type: MessageType.HIDE_TOOLBAR,
        optional: { tabId: isNumber },
      })
    ),
    parseResponse: createGuardParser('tab HIDE_TOOLBAR response', createRuntimeResponseGuard()),
  },
  [MessageType.TOOLBAR_STATUS]: {
    parseRequest: createGuardParser(
      'tab TOOLBAR_STATUS message',
      createMessageGuard({
        type: MessageType.TOOLBAR_STATUS,
        optional: { tabId: isNumber },
      })
    ),
    parseResponse: createGuardParser(
      'tab TOOLBAR_STATUS response',
      createRuntimeResponseGuard({ optional: { visible: isBoolean } })
    ),
  },
  [MessageType.VIEWPORT_CHANGED]: {
    parseRequest: createGuardParser(
      'tab VIEWPORT_CHANGED message',
      createMessageGuard({
        type: MessageType.VIEWPORT_CHANGED,
        required: { viewport: isNullable(isSize2d) },
      })
    ),
    parseResponse: createGuardParser('tab VIEWPORT_CHANGED response', createRuntimeResponseGuard()),
  },
  [MessageType.SHOW_SAVE_DIALOG]: {
    parseRequest: createGuardParser(
      'tab SHOW_SAVE_DIALOG message',
      createMessageGuard({
        type: MessageType.SHOW_SAVE_DIALOG,
        optional: { dataUrl: isImageDataUrl, filename: isString },
      })
    ),
    parseResponse: createGuardParser('tab SHOW_SAVE_DIALOG response', createRuntimeResponseGuard()),
  },
  [MessageType.SHOW_QUICK_ACTION_COUNTDOWN]: {
    parseRequest: createGuardParser(
      'tab SHOW_QUICK_ACTION_COUNTDOWN message',
      createMessageGuard({
        type: MessageType.SHOW_QUICK_ACTION_COUNTDOWN,
        optional: { seconds: isNumber },
      })
    ),
    parseResponse: createGuardParser(
      'tab SHOW_QUICK_ACTION_COUNTDOWN response',
      createRuntimeResponseGuard()
    ),
  },
  [MessageType.SHOW_TOAST]: {
    parseRequest: createGuardParser(
      'tab SHOW_TOAST message',
      createMessageGuard({
        type: MessageType.SHOW_TOAST,
        optional: { payload: isShowToastPayload },
      })
    ),
    parseResponse: createGuardParser('tab SHOW_TOAST response', createRuntimeResponseGuard()),
  },
  [MessageType.COPY_IMAGE_TO_CLIPBOARD]: {
    parseRequest: createGuardParser(
      'tab COPY_IMAGE_TO_CLIPBOARD message',
      createMessageGuard({
        type: MessageType.COPY_IMAGE_TO_CLIPBOARD,
        required: { dataUrl: isImageDataUrl },
      })
    ),
    parseResponse: createGuardParser(
      'tab COPY_IMAGE_TO_CLIPBOARD response',
      createRuntimeResponseGuard()
    ),
  },
  [MessageType.COPY_TEXT_TO_CLIPBOARD]: {
    parseRequest: createGuardParser(
      'tab COPY_TEXT_TO_CLIPBOARD message',
      createMessageGuard({
        type: MessageType.COPY_TEXT_TO_CLIPBOARD,
        required: { text: isClipboardTextWithinLimit },
        optional: { html: isClipboardTextWithinLimit },
      })
    ),
    parseResponse: createGuardParser(
      'tab COPY_TEXT_TO_CLIPBOARD response',
      createRuntimeResponseGuard()
    ),
  },
  [MessageType.DESTROY_UI_TOOLBAR]: {
    parseRequest: createGuardParser(
      'tab DESTROY_UI_TOOLBAR message',
      createMessageGuard({ type: MessageType.DESTROY_UI_TOOLBAR })
    ),
    parseResponse: createGuardParser(
      'tab DESTROY_UI_TOOLBAR response',
      createRuntimeResponseGuard()
    ),
  },
  ...tabUiExportMessageContracts,
  ...tabWebSnapshotMessageContracts,
} satisfies PartialTabRegistry;

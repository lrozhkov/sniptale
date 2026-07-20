import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createGuardParser } from '@sniptale/runtime-contracts/messaging/parsers/utils';
import * as contentIntent from '@sniptale/runtime-contracts/protocol/content-privileged-action';

import {
  isExportOptions,
  isPopupExportPackageResponse,
  isPopupExportPreviewResponse,
} from '../../validators/export';
import { createMessageGuard, createRuntimeResponseGuard, isString } from '../../validators/index';
import type { TabRequestByType, TabResponseByType } from '../index';

const isContentGrant = contentIntent.isContentPrivilegedActionAutoStartGrant;

export const tabUiExportMessageContracts = {
  [MessageType.EXPORT_POPUP_PREVIEW]: {
    parseRequest: createGuardParser(
      'tab EXPORT_POPUP_PREVIEW message',
      createMessageGuard<
        typeof MessageType.EXPORT_POPUP_PREVIEW,
        TabRequestByType[typeof MessageType.EXPORT_POPUP_PREVIEW]
      >({ type: MessageType.EXPORT_POPUP_PREVIEW })
    ),
    parseResponse: createGuardParser(
      'tab EXPORT_POPUP_PREVIEW response',
      isPopupExportPreviewResponse
    ),
  },
  [MessageType.EXPORT_POPUP_START]: {
    parseRequest: createGuardParser(
      'tab EXPORT_POPUP_START message',
      createMessageGuard<
        typeof MessageType.EXPORT_POPUP_START,
        TabRequestByType[typeof MessageType.EXPORT_POPUP_START]
      >({
        type: MessageType.EXPORT_POPUP_START,
        required: { requestId: isString, options: isExportOptions },
        optional: { contentIntentGrant: isContentGrant },
      })
    ),
    parseResponse: createGuardParser(
      'tab EXPORT_POPUP_START response',
      createRuntimeResponseGuard<TabResponseByType[typeof MessageType.EXPORT_POPUP_START]>()
    ),
  },
  [MessageType.EXPORT_POPUP_BUILD_PACKAGE]: {
    parseRequest: createGuardParser(
      'tab EXPORT_POPUP_BUILD_PACKAGE message',
      createMessageGuard<
        typeof MessageType.EXPORT_POPUP_BUILD_PACKAGE,
        TabRequestByType[typeof MessageType.EXPORT_POPUP_BUILD_PACKAGE]
      >({
        type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
        required: { options: isExportOptions },
        optional: { contentIntentGrant: isContentGrant },
      })
    ),
    parseResponse: createGuardParser(
      'tab EXPORT_POPUP_BUILD_PACKAGE response',
      isPopupExportPackageResponse
    ),
  },
  [MessageType.EXPORT_POPUP_CANCEL]: {
    parseRequest: createGuardParser(
      'tab EXPORT_POPUP_CANCEL message',
      createMessageGuard<
        typeof MessageType.EXPORT_POPUP_CANCEL,
        TabRequestByType[typeof MessageType.EXPORT_POPUP_CANCEL]
      >({ type: MessageType.EXPORT_POPUP_CANCEL })
    ),
    parseResponse: createGuardParser(
      'tab EXPORT_POPUP_CANCEL response',
      createRuntimeResponseGuard<TabResponseByType[typeof MessageType.EXPORT_POPUP_CANCEL]>()
    ),
  },
};

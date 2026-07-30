import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createGuardParser } from '@sniptale/runtime-contracts/messaging/parsers/utils';
import * as contentIntent from '@sniptale/runtime-contracts/protocol/content-privileged-action';

import {
  isExportOptions,
  isPopupExportPackageResponse,
  isPopupExportPreviewResponse,
} from '../../validators/export';
import {
  createMessageGuard,
  createRuntimeResponseGuard,
  isNullable,
  isString,
} from '../../validators/index';
import type { TabRequestByType, TabResponseByType } from '../index';

const isContentGrant = contentIntent.isContentPrivilegedActionAutoStartGrant;
const isFullPageCaptureAction = (value: unknown) =>
  value === MessageType.EXPORT_CAPTURE_FULL_PAGE ||
  value === MessageType.EXPORT_CAPTURE_FULL_PAGE_UNATTENDED;

export const tabUiExportMessageContracts = {
  [MessageType.CONSUME_POPUP_EXPORT_LAUNCH_INTENT]: {
    parseRequest: createGuardParser(
      'tab CONSUME_POPUP_EXPORT_LAUNCH_INTENT message',
      createMessageGuard<
        typeof MessageType.CONSUME_POPUP_EXPORT_LAUNCH_INTENT,
        TabRequestByType[typeof MessageType.CONSUME_POPUP_EXPORT_LAUNCH_INTENT]
      >({ type: MessageType.CONSUME_POPUP_EXPORT_LAUNCH_INTENT })
    ),
    parseResponse: createGuardParser(
      'tab CONSUME_POPUP_EXPORT_LAUNCH_INTENT response',
      createRuntimeResponseGuard<
        TabResponseByType[typeof MessageType.CONSUME_POPUP_EXPORT_LAUNCH_INTENT]
      >({
        required: {
          page: isNullable((value: unknown): value is 'export' => value === 'export'),
        },
      })
    ),
  },
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
        optional: {
          contentIntentGrant: isContentGrant,
          fullPageCaptureAction: isFullPageCaptureAction,
        },
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
        required: { batchRequestId: isString, options: isExportOptions },
        optional: {
          contentIntentGrant: isContentGrant,
          fullPageCaptureAction: isFullPageCaptureAction,
        },
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
      >({ type: MessageType.EXPORT_POPUP_CANCEL, required: { exportRunId: isString } })
    ),
    parseResponse: createGuardParser(
      'tab EXPORT_POPUP_CANCEL response',
      createRuntimeResponseGuard<TabResponseByType[typeof MessageType.EXPORT_POPUP_CANCEL]>()
    ),
  },
};

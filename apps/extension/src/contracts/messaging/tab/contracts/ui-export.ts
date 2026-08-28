import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createGuardParser } from '@sniptale/runtime-contracts/messaging/parsers/utils';
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
import { isContentPrivilegedActionAutoStartGrant } from '@sniptale/runtime-contracts/protocol/content-privileged-action';

const isPopupExportBuildPackageBase = createMessageGuard<
  typeof MessageType.EXPORT_POPUP_BUILD_PACKAGE,
  TabRequestByType[typeof MessageType.EXPORT_POPUP_BUILD_PACKAGE]
>({
  type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
  required: {
    batchRequestId: isString,
    includeWebCopy: (value) => typeof value === 'boolean',
    intent: (value) => value === 'export' || value === 'save',
    ordinal: (value) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0,
    options: isExportOptions,
  },
  optional: {
    allowAnonymousCrossOriginAssets: (value) => typeof value === 'boolean',
    allowAuthenticatedSameOriginAssets: (value) => typeof value === 'boolean',
    contentIntentGrant: isContentPrivilegedActionAutoStartGrant,
    fullPageCaptureAction: (value) => value === MessageType.EXPORT_CAPTURE_FULL_PAGE,
  },
});

function isPopupExportBuildPackageRequest(
  value: unknown
): value is TabRequestByType[typeof MessageType.EXPORT_POPUP_BUILD_PACKAGE] {
  if (!isPopupExportBuildPackageBase(value)) return false;
  const hasAnonymousPolicy = Object.prototype.hasOwnProperty.call(
    value,
    'allowAnonymousCrossOriginAssets'
  );
  const hasAuthenticatedPolicy = Object.prototype.hasOwnProperty.call(
    value,
    'allowAuthenticatedSameOriginAssets'
  );
  return value.includeWebCopy
    ? hasAnonymousPolicy && hasAuthenticatedPolicy
    : !hasAnonymousPolicy && !hasAuthenticatedPolicy;
}

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
  [MessageType.EXPORT_POPUP_BUILD_PACKAGE]: {
    parseRequest: createGuardParser(
      'tab EXPORT_POPUP_BUILD_PACKAGE message',
      isPopupExportBuildPackageRequest
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

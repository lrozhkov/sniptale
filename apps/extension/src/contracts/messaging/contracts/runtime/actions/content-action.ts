import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  createMessageGuard,
  createRuntimeResponseGuard,
  isNumber,
  isString,
} from '../../../validators/index';
import { isBrowserAnnotationsExportText } from '@sniptale/runtime-contracts/export';
import { createGuardParser } from '@sniptale/runtime-contracts/messaging/parsers/utils';
import {
  isContentPrivilegedActionActivationKey,
  isContentPrivilegedActionActivationProof,
  isContentPrivilegedActionActivationPurpose,
  isContentPrivilegedActionCapability,
  isContentPrivilegedActionRequestSource,
  isContentPrivilegedActionRuntimeToken,
  isContentPrivilegedActionTrustedEventProof,
  isContentPrivilegedActionType,
} from '@sniptale/runtime-contracts/protocol/content-privileged-action';
import type { PartialRuntimeRegistry } from '../../runtime-message.registry.ts';
import { isScreenshotCaptureConfigValue } from '@sniptale/runtime-contracts/capture/action';

export const contentActionRuntimeContracts = {
  [MessageType.TRIGGER_SCREENSHOT_CAPTURE]: {
    parseRequest: createGuardParser(
      'runtime TRIGGER_SCREENSHOT_CAPTURE message',
      createMessageGuard({
        type: MessageType.TRIGGER_SCREENSHOT_CAPTURE,
        required: { config: isScreenshotCaptureConfigValue },
        optional: { tabId: isNumber },
      })
    ),
    parseResponse: createGuardParser(
      'runtime TRIGGER_SCREENSHOT_CAPTURE response',
      createRuntimeResponseGuard({ optional: { result: isString } })
    ),
  },
  [MessageType.DOWNLOAD_BROWSER_ANNOTATIONS]: {
    parseRequest: createGuardParser(
      'runtime DOWNLOAD_BROWSER_ANNOTATIONS message',
      createMessageGuard({
        type: MessageType.DOWNLOAD_BROWSER_ANNOTATIONS,
        required: {
          text: isBrowserAnnotationsExportText,
        },
        optional: { contentIntent: isContentPrivilegedActionCapability },
      })
    ),
    parseResponse: createGuardParser(
      'runtime DOWNLOAD_BROWSER_ANNOTATIONS response',
      createRuntimeResponseGuard({ optional: { downloadId: isNumber } })
    ),
  },
  [MessageType.OPEN_EXPORT_MODAL]: {
    parseRequest: createGuardParser(
      'runtime OPEN_EXPORT_MODAL message',
      createMessageGuard({
        type: MessageType.OPEN_EXPORT_MODAL,
        optional: { contentIntent: isContentPrivilegedActionCapability },
      })
    ),
    parseResponse: createGuardParser(
      'runtime OPEN_EXPORT_MODAL response',
      createRuntimeResponseGuard()
    ),
  },
  [MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY]: {
    parseRequest: createGuardParser(
      'runtime REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY message',
      createMessageGuard({
        type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY,
        required: {
          actionType: isContentPrivilegedActionType,
          requestId: isString,
          source: isContentPrivilegedActionRequestSource,
        },
      })
    ),
    parseResponse: createGuardParser(
      'runtime REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY response',
      createRuntimeResponseGuard({
        optional: { contentIntent: isContentPrivilegedActionCapability },
      })
    ),
  },
  [MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_ACTIVATION_KEY]: {
    parseRequest: createGuardParser(
      'runtime REQUEST_CONTENT_PRIVILEGED_ACTION_ACTIVATION_KEY message',
      createMessageGuard({
        type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_ACTIVATION_KEY,
        required: { purpose: isContentPrivilegedActionActivationPurpose },
      })
    ),
    parseResponse: createGuardParser(
      'runtime REQUEST_CONTENT_PRIVILEGED_ACTION_ACTIVATION_KEY response',
      createRuntimeResponseGuard({
        optional: { activationKey: isContentPrivilegedActionActivationKey },
      })
    ),
  },
  [MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_RUNTIME_TOKEN]: {
    parseRequest: createGuardParser(
      'runtime REQUEST_CONTENT_PRIVILEGED_ACTION_RUNTIME_TOKEN message',
      createMessageGuard({
        type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_RUNTIME_TOKEN,
        required: {
          activationProof: isContentPrivilegedActionActivationProof,
          actionType: isContentPrivilegedActionType,
          requestId: isString,
        },
      })
    ),
    parseResponse: createGuardParser(
      'runtime REQUEST_CONTENT_PRIVILEGED_ACTION_RUNTIME_TOKEN response',
      createRuntimeResponseGuard({
        optional: { runtimeToken: isContentPrivilegedActionRuntimeToken },
      })
    ),
  },
  [MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_PROOF]: {
    parseRequest: createGuardParser(
      'runtime REQUEST_CONTENT_PRIVILEGED_ACTION_PROOF message',
      createMessageGuard({
        type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_PROOF,
        required: {
          actionType: isContentPrivilegedActionType,
          requestId: isString,
          runtimeToken: isString,
        },
      })
    ),
    parseResponse: createGuardParser(
      'runtime REQUEST_CONTENT_PRIVILEGED_ACTION_PROOF response',
      createRuntimeResponseGuard({
        optional: { trustedEventProof: isContentPrivilegedActionTrustedEventProof },
      })
    ),
  },
} satisfies PartialRuntimeRegistry;

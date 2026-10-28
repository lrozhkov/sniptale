import { CaptureMessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createGuardParser } from '@sniptale/runtime-contracts/messaging/parsers/utils';
import {
  createMessageGuard,
  createRuntimeResponseGuard,
  isCaptureActionType,
  isNumber,
  isNullable,
  isRecord,
  isString,
} from '../../../validators/index';
import {
  isScenarioCaptureSourceKind,
  isScenarioCaptureSurface,
  isScenarioPageDescriptor,
  isScenarioPoint,
  isScenarioTargetDescriptor,
} from '../../../scenario/validators';
import type { PartialRuntimeRegistry } from '../../runtime-message.registry.ts';
import { isContentPrivilegedActionCapability } from '@sniptale/runtime-contracts/protocol/content-privileged-action';

/** Validates the bounded output settings accepted from one content workflow. */
export function isScreenshotCapturePreferences(value: unknown): boolean {
  if (
    !isRecord(value) ||
    Object.keys(value).some(
      (key) => !['imageFormat', 'imageQuality', 'fullPageCapture'].includes(key)
    )
  )
    return false;
  const format = value['imageFormat'];
  const quality = value['imageQuality'];
  if (
    (format !== 'png' && format !== 'jpeg' && format !== 'webp') ||
    typeof quality !== 'number' ||
    !Number.isFinite(quality) ||
    quality < 1 ||
    quality > 100
  )
    return false;
  const full = value['fullPageCapture'];
  return (
    full === undefined ||
    (isRecord(full) &&
      Object.keys(full).every((key) =>
        ['floatingElements', 'freezeMotion', 'preloadLazyContent'].includes(key)
      ) &&
      ['hide', 'once', 'repeat'].includes(
        typeof full['floatingElements'] === 'string' ? full['floatingElements'] : ''
      ) &&
      typeof full['freezeMotion'] === 'boolean' &&
      typeof full['preloadLazyContent'] === 'boolean')
  );
}

function isScenarioRuntimeCapturePayload(value: unknown): boolean {
  return (
    isRecord(value) &&
    isScenarioCaptureSurface(value['captureSurface']) &&
    isScenarioCaptureSourceKind(value['sourceKind']) &&
    isScenarioPageDescriptor(value['page']) &&
    (value['target'] === undefined || isNullable(isScenarioTargetDescriptor)(value['target'])) &&
    (value['interactionPoint'] === undefined ||
      isNullable(isScenarioPoint)(value['interactionPoint'])) &&
    (value['cursorPoint'] === undefined || isNullable(isScenarioPoint)(value['cursorPoint'])) &&
    (value['title'] === undefined || isString(value['title'])) &&
    (value['body'] === undefined || isString(value['body']))
  );
}

export const runtimeActionCaptureMessageContracts = {
  [CaptureMessageType.CAPTURE_VISIBLE]: {
    parseRequest: createGuardParser(
      'runtime CAPTURE_VISIBLE message',
      createMessageGuard({
        type: CaptureMessageType.CAPTURE_VISIBLE,
        optional: {
          actionType: isCaptureActionType,
          capturePreferences: isScreenshotCapturePreferences,
          quickActionTransactionId: (value) =>
            isString(value) && value.length > 0 && value.length <= 128,
          contentIntent: isContentPrivilegedActionCapability,
          scenarioCapture: isScenarioRuntimeCapturePayload,
        },
      })
    ),
    parseResponse: createGuardParser(
      'runtime CAPTURE_VISIBLE response',
      createRuntimeResponseGuard({
        optional: {
          dataUrl: isString,
          filename: isString,
          action: isCaptureActionType,
          result: isString,
        },
      })
    ),
  },
  [CaptureMessageType.CAPTURE_FULL]: {
    parseRequest: createGuardParser(
      'runtime CAPTURE_FULL message',
      createMessageGuard({
        type: CaptureMessageType.CAPTURE_FULL,
        optional: {
          actionType: isCaptureActionType,
          capturePreferences: isScreenshotCapturePreferences,
          quickActionTransactionId: (value) =>
            isString(value) && value.length > 0 && value.length <= 128,
          contentIntent: isContentPrivilegedActionCapability,
          scenarioCapture: isScenarioRuntimeCapturePayload,
        },
      })
    ),
    parseResponse: createGuardParser(
      'runtime CAPTURE_FULL response',
      createRuntimeResponseGuard({
        optional: {
          dataUrl: isString,
          filename: isString,
          action: isCaptureActionType,
          result: isString,
        },
      })
    ),
  },
  [CaptureMessageType.CAPTURE_VISIBLE_FOR_CROP]: {
    parseRequest: createGuardParser(
      'runtime CAPTURE_VISIBLE_FOR_CROP message',
      createMessageGuard({
        type: CaptureMessageType.CAPTURE_VISIBLE_FOR_CROP,
        optional: { contentIntent: isContentPrivilegedActionCapability },
      })
    ),
    parseResponse: createGuardParser(
      'runtime CAPTURE_VISIBLE_FOR_CROP response',
      createRuntimeResponseGuard({ optional: { dataUrl: isString } })
    ),
  },
  [CaptureMessageType.RENEW_SCREENSHOT_SURFACE_SESSION]: {
    parseRequest: createGuardParser(
      'runtime RENEW_SCREENSHOT_SURFACE_SESSION message',
      createMessageGuard({
        type: CaptureMessageType.RENEW_SCREENSHOT_SURFACE_SESSION,
        required: { contentIntent: isContentPrivilegedActionCapability },
      })
    ),
    parseResponse: createGuardParser(
      'runtime RENEW_SCREENSHOT_SURFACE_SESSION response',
      createRuntimeResponseGuard({
        required: {
          surfaceCapabilityToken: isString,
          surfaceOperationGeneration: (value) =>
            isNumber(value) && Number.isSafeInteger(value) && value >= 0,
        },
        optional: {
          surfaceLeaseGeneration: (value) =>
            isNumber(value) && Number.isSafeInteger(value) && value >= 0,
        },
      })
    ),
  },
} satisfies PartialRuntimeRegistry;

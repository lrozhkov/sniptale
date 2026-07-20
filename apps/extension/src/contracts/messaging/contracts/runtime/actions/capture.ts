import { CaptureMessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createGuardParser } from '@sniptale/runtime-contracts/messaging/parsers/utils';
import {
  createMessageGuard,
  createRuntimeResponseGuard,
  isCaptureActionType,
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
          contentIntent: isContentPrivilegedActionCapability,
          scenarioCapture: isScenarioRuntimeCapturePayload,
        },
      })
    ),
    parseResponse: createGuardParser(
      'runtime CAPTURE_VISIBLE response',
      createRuntimeResponseGuard({
        optional: { dataUrl: isString, action: isCaptureActionType, result: isString },
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
          contentIntent: isContentPrivilegedActionCapability,
          scenarioCapture: isScenarioRuntimeCapturePayload,
        },
      })
    ),
    parseResponse: createGuardParser(
      'runtime CAPTURE_FULL response',
      createRuntimeResponseGuard({
        optional: { dataUrl: isString, action: isCaptureActionType, result: isString },
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
} satisfies PartialRuntimeRegistry;

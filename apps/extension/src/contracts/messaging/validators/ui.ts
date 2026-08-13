import {
  isCaptureActionTypeValue,
  type CaptureActionType,
} from '@sniptale/runtime-contracts/capture/action';
import type { AppliedViewportPresetPayload } from '@sniptale/runtime-contracts/messaging/message-types';
import type { QuickActionOverlay } from '../../settings';
import type { ShowToastPayload } from '../contracts/types';
import { hasOptionalField, isBoolean, isNumber, isRecord, isString } from './primitives';

export function isCaptureActionType(value: unknown): value is CaptureActionType {
  return isCaptureActionTypeValue(value);
}

export function isAppliedViewportPreset(value: unknown): value is AppliedViewportPresetPayload {
  return (
    isRecord(value) &&
    isString(value['presetId']) &&
    value['target'] === 'window' &&
    isNumber(value['width']) &&
    isNumber(value['height'])
  );
}

export function isQuickActionOverlay(
  value: unknown
): value is QuickActionOverlay & { delaySeconds?: number } {
  return (
    isRecord(value) &&
    isCaptureActionType(value['afterCapture']) &&
    isString(value['imageFormat']) &&
    isNumber(value['imageQuality']) &&
    isBoolean(value['exitAfterCapture']) &&
    hasOptionalField(value, 'delaySeconds', isNumber)
  );
}

export function isShowToastPayload(value: unknown): value is ShowToastPayload {
  return (
    isRecord(value) &&
    hasOptionalField(value, 'type', isString) &&
    hasOptionalField(value, 'title', isString) &&
    hasOptionalField(value, 'message', isString)
  );
}

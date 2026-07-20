import {
  WebcamFrameRatePreset,
  WebcamResolutionPreset,
  type WebcamActualSettings,
  type WebcamQualitySettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { hasOptionalField, isNumber, isRecord } from '../validators/primitives';

const webcamFrameRatePresetValues = Object.values(WebcamFrameRatePreset);
const webcamResolutionPresetValues = Object.values(WebcamResolutionPreset);

function isEnumValue(value: unknown, allowedValues: readonly string[]): value is string {
  return typeof value === 'string' && allowedValues.includes(value);
}

export function isWebcamQualitySettings(value: unknown): value is WebcamQualitySettings {
  return (
    isRecord(value) &&
    isEnumValue(value['frameRate'], webcamFrameRatePresetValues) &&
    isEnumValue(value['resolution'], webcamResolutionPresetValues)
  );
}

export function isWebcamActualSettings(value: unknown): value is WebcamActualSettings {
  return (
    isRecord(value) &&
    hasOptionalField(value, 'frameRate', isNumber) &&
    hasOptionalField(value, 'height', isNumber) &&
    hasOptionalField(value, 'width', isNumber)
  );
}

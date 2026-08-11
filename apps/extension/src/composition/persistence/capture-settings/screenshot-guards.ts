import {
  isCaptureActionTypeValue,
  isScreenshotCaptureMode,
  isScreenshotImageFormat,
  type ScreenshotCaptureConfig,
} from '@sniptale/runtime-contracts/capture/action';
import { isBoolean, isNumber, isRecord, isString } from '../infrastructure/guards/primitives';
import type { ScreenshotSetupMode, ScreenshotSetupState } from './screenshot-contracts';

// policyStateIds: [] - screenshot delays are an immutable parser allowlist, not authority state.
const DELAYS = new Set([0, 3, 5, 10]);

function isModeForOwner(
  value: unknown,
  expected: 'tab' | 'desktop'
): value is ScreenshotCaptureConfig['screenshotMode'] {
  if (!isScreenshotCaptureMode(value)) return false;
  return expected === 'desktop'
    ? value === 'desktop'
    : value === 'visible' || value === 'full' || value === 'selection';
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

function isScreenshotDelay(value: unknown): value is ScreenshotCaptureConfig['delay'] {
  return value === null || (isNumber(value) && DELAYS.has(value));
}

function isNullableImageFormat(value: unknown): value is ScreenshotCaptureConfig['imageFormat'] {
  return value === null || isScreenshotImageFormat(value);
}

function isNullableImageQuality(value: unknown): value is number | null {
  return value === null || (isNumber(value) && value >= 1 && value <= 100);
}

function parseConfig(value: unknown, expected: 'tab' | 'desktop'): ScreenshotCaptureConfig | null {
  if (!isRecord(value) || !isModeForOwner(value['screenshotMode'], expected)) return null;
  if (!isNullableString(value['viewportPresetId'])) return null;
  if (!isScreenshotDelay(value['delay'])) return null;
  if (!isCaptureActionTypeValue(value['afterCapture'])) return null;
  if (!isNullableImageFormat(value['imageFormat'])) return null;
  if (!isNullableImageQuality(value['imageQuality'])) return null;
  if (!isBoolean(value['exitAfterCapture'])) return null;

  return {
    screenshotMode: value['screenshotMode'],
    viewportPresetId: value['viewportPresetId'],
    delay: value['delay'],
    afterCapture: value['afterCapture'],
    imageFormat: value['imageFormat'],
    imageQuality: value['imageQuality'],
    exitAfterCapture: value['exitAfterCapture'],
  };
}

function isSetupMode(value: unknown): value is ScreenshotSetupMode {
  return value === 'quick-actions' || value === 'tab' || value === 'desktop';
}

export function parseStoredScreenshotSetupState(value: unknown): Partial<ScreenshotSetupState> {
  if (!isRecord(value)) return {};
  const result: Partial<ScreenshotSetupState> = {};
  if (isSetupMode(value['selectedMode'])) result.selectedMode = value['selectedMode'];
  const tab = parseConfig(value['tab'], 'tab');
  if (tab) result.tab = tab;
  const desktop = parseConfig(value['desktop'], 'desktop');
  if (desktop) result.desktop = desktop;
  return result;
}

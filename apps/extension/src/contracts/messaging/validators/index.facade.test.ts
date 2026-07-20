import { expect, it } from 'vitest';

import * as facade from './index';
import {
  hasOptionalField,
  hasRequiredField,
  isBoolean,
  isClipboardTextWithinLimit,
  isImageDataUrl,
  isMessageWithType,
  isNullable,
  isNumber,
  isRecord,
  isString,
} from './primitives';
import { isCaptureActionType, isQuickActionOverlay, isShowToastPayload } from './ui';
import {
  isVideoExportCapabilities,
  isVideoProject,
  isVideoProjectExportSettings,
  isRecordingStateHealth,
  isSize2d,
  isVideoRecordingRuntimeState,
  isVideoRecordingSettings,
  isVideoViewportPresetSelection,
  isViewportInfo,
  isViewportRegion,
} from '../video/validators';
import { isLiveVideoRecordingSettingsPatch } from '../video/validators.live-settings';

it('keeps the shared messaging validators root as a thin facade over owner-local roles', () => {
  expect(facade.isRecord).toBe(isRecord);
  expect(facade.isString).toBe(isString);
  expect(facade.isNumber).toBe(isNumber);
  expect(facade.isBoolean).toBe(isBoolean);
  expect(facade.isNullable).toBe(isNullable);
  expect(facade.hasOptionalField).toBe(hasOptionalField);
  expect(facade.hasRequiredField).toBe(hasRequiredField);
  expect(facade.isMessageWithType).toBe(isMessageWithType);
  expect(facade.isImageDataUrl).toBe(isImageDataUrl);
  expect(facade.isClipboardTextWithinLimit).toBe(isClipboardTextWithinLimit);
  expect(facade.isCaptureActionType).toBe(isCaptureActionType);
  expect(facade.isQuickActionOverlay).toBe(isQuickActionOverlay);
  expect(facade.isShowToastPayload).toBe(isShowToastPayload);
  expect(facade.isSize2d).toBe(isSize2d);
  expect(facade.isViewportRegion).toBe(isViewportRegion);
  expect(facade.isViewportInfo).toBe(isViewportInfo);
  expect(facade.isVideoRecordingSettings).toBe(isVideoRecordingSettings);
  expect(facade.isLiveVideoRecordingSettingsPatch).toBe(isLiveVideoRecordingSettingsPatch);
  expect(facade.isVideoViewportPresetSelection).toBe(isVideoViewportPresetSelection);
  expect(facade.isVideoRecordingRuntimeState).toBe(isVideoRecordingRuntimeState);
  expect(facade.isRecordingStateHealth).toBe(isRecordingStateHealth);
  expect(facade.isVideoExportCapabilities).toBe(isVideoExportCapabilities);
  expect(facade.isVideoProject).toBe(isVideoProject);
  expect(facade.isVideoProjectExportSettings).toBe(isVideoProjectExportSettings);
});

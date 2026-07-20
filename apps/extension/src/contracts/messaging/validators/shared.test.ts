import { describe, expect, it } from 'vitest';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';

import {
  createMessageGuard,
  createRuntimeResponseGuard,
  hasOptionalField,
  hasRequiredField,
  isBoolean,
  isClipboardTextWithinLimit,
  isCaptureActionType,
  isImageDataUrl,
  isMessageWithType,
  isNullable,
  isNumber,
  isQuickActionOverlay,
  isRecord,
  isShowToastPayload,
  isSize2d,
  isString,
  isVideoExportCapabilities,
  isVideoRecordingRuntimeState,
  isVideoRecordingSettings,
  isVideoViewportPresetSelection,
  isViewportInfo,
  isViewportRegion,
} from './index';

describe('shared messaging validators primitives', () => {
  it('validates primitive and structural helpers', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord(null)).toBe(false);
    expect(isString('value')).toBe(true);
    expect(isString(1)).toBe(false);
    expect(isNumber(3.14)).toBe(true);
    expect(isNumber(Number.NaN)).toBe(false);
    expect(isBoolean(false)).toBe(true);
    expect(isBoolean('false')).toBe(false);
    expect(isImageDataUrl('data:image/png;base64,QUJDRA==')).toBe(true);
    expect(isImageDataUrl('data:text/plain;base64,QUJDRA==')).toBe(false);
    expect(isClipboardTextWithinLimit('copied')).toBe(true);
    expect(isClipboardTextWithinLimit('x'.repeat(50_001))).toBe(false);
  });

  it('builds nullable, required, optional, and message-type guards', () => {
    const isNullableString = isNullable(isString);

    expect(isNullableString(null)).toBe(true);
    expect(isNullableString('value')).toBe(true);
    expect(isNullableString(42)).toBe(false);

    expect(hasOptionalField({}, 'name', isString)).toBe(true);
    expect(hasOptionalField({ name: 'ok' }, 'name', isString)).toBe(true);
    expect(hasOptionalField({ name: 42 }, 'name', isString)).toBe(false);

    expect(hasRequiredField({ name: 'ok' }, 'name', isString)).toBe(true);
    expect(hasRequiredField({}, 'name', isString)).toBe(false);

    expect(isMessageWithType({ type: 'KEEP_ALIVE' }, 'KEEP_ALIVE')).toBe(true);
    expect(isMessageWithType({ type: 'AREA_SELECTED' }, 'KEEP_ALIVE')).toBe(false);
    expect(isMessageWithType(null, 'KEEP_ALIVE')).toBe(false);
  });
});

describe('shared messaging validators geometry and overlay values', () => {
  it('validates size, viewport, capture action, and overlay shapes', () => {
    expect(isSize2d({ height: 200, width: 100 })).toBe(true);
    expect(isSize2d({ height: '200', width: 100 })).toBe(false);

    expect(isViewportRegion({ height: 200, width: 100, x: 10, y: 20 })).toBe(true);
    expect(isViewportRegion({ height: 200, width: 100, x: '10', y: 20 })).toBe(false);

    expect(
      isViewportInfo({
        devicePixelRatio: 2,
        height: 1080,
        scrollX: 10,
        scrollY: 20,
        width: 1920,
      })
    ).toBe(true);
    expect(
      isViewportInfo({
        devicePixelRatio: '2',
        height: 1080,
        scrollX: 10,
        scrollY: 20,
        width: 1920,
      })
    ).toBe(false);

    expect(isCaptureActionType('copy')).toBe(true);
    expect(isCaptureActionType('share')).toBe(false);

    expect(
      isQuickActionOverlay({
        afterCapture: 'edit',
        delaySeconds: 3,
        exitAfterCapture: false,
        imageFormat: 'png',
        imageQuality: 92,
      })
    ).toBe(true);
    expect(
      isQuickActionOverlay({
        afterCapture: 'edit',
        delaySeconds: '3',
        exitAfterCapture: false,
        imageFormat: 'png',
        imageQuality: 92,
      })
    ).toBe(false);
  });
});

describe('shared messaging validators toast payloads', () => {
  it('validates show-toast payload shapes', () => {
    expect(
      isShowToastPayload({
        message: 'Saved',
        title: 'Done',
        type: 'success',
      })
    ).toBe(true);
    expect(isShowToastPayload({ message: 42 })).toBe(false);
  });
});

describe('shared messaging validators recording settings', () => {
  it('validates recording settings and viewport preset selections', () => {
    expect(
      isVideoRecordingSettings({
        autoFadeDelay: 300,
        countdownSeconds: 3,
        diagnosticsEnabled: true,
        microphoneDeviceId: null,
        microphoneEnabled: true,
        openEditorAfterRecording: false,
        quality: '1080p',
        systemAudioEnabled: true,
        webcamDeviceId: null,
        webcamEnabled: false,
      })
    ).toBe(true);
    expect(
      isVideoRecordingSettings({
        autoFadeDelay: 300,
        countdownSeconds: 3,
        diagnosticsEnabled: true,
        microphoneDeviceId: 123,
        microphoneEnabled: true,
        openEditorAfterRecording: false,
        quality: '1080p',
        systemAudioEnabled: true,
        webcamDeviceId: null,
        webcamEnabled: false,
      })
    ).toBe(false);

    expect(
      isVideoViewportPresetSelection({
        height: 720,
        id: 'preset-1',
        label: 'HD',
        width: 1280,
      })
    ).toBe(true);
    expect(
      isVideoViewportPresetSelection({
        height: 720,
        id: 1,
        width: 1280,
      })
    ).toBe(false);
  });
});

describe('shared messaging validators export capabilities', () => {
  it('validates export capability payloads through the shared facade', () => {
    expect(
      isVideoExportCapabilities({
        formats: [{ format: 'MP4', available: true }],
        mp4Codecs: [{ codec: 'AVC', available: true }],
        defaultMp4VideoCodec: 'AVC',
      })
    ).toBe(true);

    expect(
      isVideoExportCapabilities({
        formats: [{ format: 'MP4', available: 'yes' }],
        mp4Codecs: [{ codec: 'AVC', available: true }],
        defaultMp4VideoCodec: null,
      })
    ).toBe(false);
  });
});

describe('shared messaging validators runtime state', () => {
  it('validates video recording runtime state including nested capture sources', () => {
    expect(
      isVideoRecordingRuntimeState({
        captureMode: CaptureMode.TAB,
        captureSource: {
          mode: 'tab',
          streamId: 'stream-1',
        },
        countdownEndsAt: 123,
        duration: 456,
        error: null,
        status: 'recording',
        viewportPreset: {
          height: 720,
          id: 'preset-1',
          label: 'HD',
          width: 1280,
        },
      })
    ).toBe(true);
    expect(
      isVideoRecordingRuntimeState({
        captureMode: 'region',
        captureSource: null,
        countdownEndsAt: null,
        duration: 456,
        error: null,
        status: 'recording',
        viewportPreset: null,
      })
    ).toBe(false);

    expect(
      isVideoRecordingRuntimeState({
        captureMode: null,
        captureSource: {
          mode: 'tab',
          streamId: 42,
        },
        countdownEndsAt: null,
        duration: 456,
        error: 'failed',
        status: 'recording',
        viewportPreset: null,
      })
    ).toBe(false);
  });
});

describe('shared messaging validators factories', () => {
  it('creates message guards with required and optional field validation', () => {
    const isResizeMessage = createMessageGuard<
      'KEEP_ALIVE',
      { type: 'KEEP_ALIVE'; width: number; label?: string }
    >({
      optional: { label: isString },
      required: { width: isNumber },
      type: 'KEEP_ALIVE',
    });

    expect(isResizeMessage({ label: 'wide', type: 'KEEP_ALIVE', width: 800 })).toBe(true);
    expect(isResizeMessage({ type: 'KEEP_ALIVE', width: 800 })).toBe(true);
    expect(isResizeMessage({ label: 42, type: 'KEEP_ALIVE', width: 800 })).toBe(false);
    expect(isResizeMessage({ label: 'wide', type: 'AREA_SELECTED', width: 800 })).toBe(false);
    expect(isResizeMessage({ type: 'KEEP_ALIVE' })).toBe(false);
  });

  it('creates runtime response guards with optional fields and undefined handling', () => {
    const isRuntimeResponse = createRuntimeResponseGuard<{ success?: boolean; tabId?: number }>({
      optional: { tabId: isNumber },
    });
    const isOptionalRuntimeResponse = createRuntimeResponseGuard<{
      success?: boolean;
      tabId?: number;
    }>({
      allowUndefined: true,
      optional: { tabId: isNumber },
    });

    expect(isRuntimeResponse({ error: 'failed', success: false, tabId: 1 })).toBe(true);
    expect(isRuntimeResponse({ success: true })).toBe(true);
    expect(isRuntimeResponse({ success: 'yes' })).toBe(false);
    expect(isRuntimeResponse({ error: 42 })).toBe(false);
    expect(isRuntimeResponse({ tabId: '1' })).toBe(false);
    expect(isRuntimeResponse(undefined)).toBe(false);
    expect(isOptionalRuntimeResponse(undefined)).toBe(true);
    expect(isOptionalRuntimeResponse(null)).toBe(false);
  });
});

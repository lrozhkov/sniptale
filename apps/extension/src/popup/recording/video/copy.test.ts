import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => `t:${key}`,
}));

import {
  describeCaptureSource,
  formatDuration,
  getControlledCursorDescription,
  getCaptureModeLabels,
  getRecordingStatusLabel,
  getViewportPresetLabel,
  supportsControlledCursorCapture,
  supportsCursorTrackTelemetry,
} from './copy';
import {
  CaptureMode,
  createVideoRecordingLiveMediaState,
  VideoQuality,
  VideoRecordingStatus,
} from '@sniptale/runtime-contracts/video/types/types';

function verifiesStatusLabels() {
  expect(getRecordingStatusLabel(VideoRecordingStatus.PREPARING)).toBe(
    't:popup.labels.statusPreparing'
  );
  expect(getRecordingStatusLabel(VideoRecordingStatus.COUNTDOWN)).toBe(
    't:popup.labels.statusCountdown'
  );
  expect(getRecordingStatusLabel(VideoRecordingStatus.RECORDING)).toBe(
    't:popup.labels.statusRecording'
  );
  expect(getRecordingStatusLabel(VideoRecordingStatus.PAUSED)).toBe('t:popup.labels.statusPaused');
  expect(getRecordingStatusLabel(VideoRecordingStatus.STOPPING)).toBe(
    't:popup.labels.statusSaving'
  );
  expect(getRecordingStatusLabel(VideoRecordingStatus.IDLE)).toBe('t:popup.labels.statusReady');
  expect(getCaptureModeLabels()[CaptureMode.VIEWPORT_EMULATION]).toBe(
    't:popup.labels.captureModePreset'
  );
  expect(getCaptureModeLabels()[CaptureMode.CAMERA]).toBe('t:popup.video.modeCameraLabel');
}

function verifiesDurationFormatting() {
  expect(formatDuration(42)).toBe('00:42');
  expect(formatDuration(3661)).toBe('01:01:01');
}

function verifiesCaptureSourceDescriptions() {
  expect(
    describeCaptureSource(
      { mode: CaptureMode.TAB, streamId: 's1', tabTitle: '' },
      CaptureMode.TAB,
      null
    )
  ).toBe('t:popup.labels.sourceActiveTab');
  expect(
    describeCaptureSource(
      { mode: CaptureMode.SCREEN, streamId: 's2', screenName: '' },
      CaptureMode.SCREEN,
      null
    )
  ).toBe('t:popup.labels.sourceScreen');
  expect(
    describeCaptureSource(
      { mode: CaptureMode.VIEWPORT_EMULATION, streamId: 's3', tabTitle: 'Tab title' },
      CaptureMode.VIEWPORT_EMULATION,
      null
    )
  ).toBe('Tab title');
  expect(
    describeCaptureSource(
      {
        mode: CaptureMode.TAB_CROP,
        streamId: 's4',
        tabTitle: 'Cropped tab',
        cropRegion: { x: 0, y: 0, width: 640, height: 360 },
      },
      CaptureMode.TAB_CROP,
      null
    )
  ).toBe('Cropped tab • 640×360');
  expect(
    describeCaptureSource(
      { mode: CaptureMode.VIEWPORT_EMULATION, streamId: 's5', tabTitle: 'Preset tab' },
      CaptureMode.VIEWPORT_EMULATION,
      'Preset 1440×900'
    )
  ).toBe('Preset tab • Preset 1440×900');
  expect(describeCaptureSource(null, CaptureMode.VIEWPORT_EMULATION, 'Preset 1440×900')).toBe(
    't:popup.labels.sourceViewportPrefix Preset 1440×900'
  );
  expect(describeCaptureSource(null, null, null)).toBe('t:popup.labels.sourcePending');
}

function verifiesCameraCaptureSourceDescription() {
  expect(
    describeCaptureSource(
      { mode: CaptureMode.CAMERA, streamId: 'camera' },
      CaptureMode.CAMERA,
      null
    )
  ).toBe('t:popup.video.modeCameraLabel');
}

function verifiesViewportPresetLabels() {
  expect(
    getViewportPresetLabel({
      status: VideoRecordingStatus.IDLE,
      duration: 0,
      countdownEndsAt: null,
      captureMode: null,
      captureSource: null,
      viewportPreset: { id: 'preset-1', label: 'Desktop', width: 1280, height: 720 },
      error: null,
    })
  ).toBe('Desktop 1280×720');

  expect(
    getViewportPresetLabel({
      status: VideoRecordingStatus.IDLE,
      duration: 0,
      countdownEndsAt: null,
      captureMode: null,
      captureSource: null,
      viewportPreset: { id: 'preset-2', label: '', width: 1024, height: 768 },
      error: null,
    })
  ).toBe('1024×768');
}

function verifiesDefaultLiveMediaState() {
  expect(
    createVideoRecordingLiveMediaState({
      autoFadeDelay: 0,
      countdownSeconds: 0,
      diagnosticsEnabled: false,
      microphoneDeviceId: null,
      microphoneEnabled: false,
      openEditorAfterRecording: false,
      quality: VideoQuality.MEDIUM,
      systemAudioEnabled: false,
      webcamDeviceId: null,
      webcamEnabled: false,
    })
  ).toEqual({
    microphoneDeviceId: null,
    microphoneEnabled: false,
    microphoneSelected: false,
    webcamDeviceId: null,
    webcamEnabled: false,
    webcamSettings: null,
    webcamSelected: false,
  });
}

function verifiesControlledCursorSupport() {
  expect(supportsCursorTrackTelemetry(CaptureMode.TAB)).toBe(true);
  expect(supportsCursorTrackTelemetry(CaptureMode.TAB_CROP)).toBe(true);
  expect(supportsCursorTrackTelemetry(CaptureMode.VIEWPORT_EMULATION)).toBe(true);
  expect(supportsCursorTrackTelemetry(CaptureMode.SCREEN)).toBe(false);
  expect(supportsCursorTrackTelemetry(CaptureMode.CAMERA)).toBe(false);
  expect(supportsControlledCursorCapture(CaptureMode.TAB)).toBe(false);
  expect(supportsControlledCursorCapture(CaptureMode.TAB_CROP)).toBe(false);
  expect(supportsControlledCursorCapture(CaptureMode.VIEWPORT_EMULATION)).toBe(false);
  expect(supportsControlledCursorCapture(CaptureMode.SCREEN)).toBe(false);
  expect(supportsControlledCursorCapture(CaptureMode.CAMERA)).toBe(false);
  expect(getControlledCursorDescription(CaptureMode.TAB_CROP)).toBe(
    't:popup.video.controlledCursorDescriptionEmbedded'
  );
  expect(getControlledCursorDescription(CaptureMode.VIEWPORT_EMULATION)).toBe(
    't:popup.video.controlledCursorDescriptionEmbedded'
  );
  expect(getControlledCursorDescription(CaptureMode.SCREEN)).toBe(
    't:popup.video.controlledCursorDescriptionEmbedded'
  );
}

function runPopupRecordingUtilsSuite() {
  it('maps every recording status to a translated label', verifiesStatusLabels);
  it('formats active recording durations with and without hours', verifiesDurationFormatting);
  it('keeps absent setup media absent in the live recording state', verifiesDefaultLiveMediaState);
  it(
    'describes capture sources and fallback states across all modes',
    verifiesCaptureSourceDescriptions
  );
  it('describes camera capture sources', verifiesCameraCaptureSourceDescription);
  it('formats viewport preset labels with and without custom names', verifiesViewportPresetLabels);
  it('exposes controlled cursor capability by capture mode', verifiesControlledCursorSupport);
}

describe('popup recording utils', runPopupRecordingUtilsSuite);

// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MessageType,
  type ResponseSender,
} from '@sniptale/runtime-contracts/messaging/message-types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { VideoQuality } from '@sniptale/runtime-contracts/video/types/types';
import type { ContentRuntimeMessage } from './types';
import { handleViewportMessage } from './viewport';

const {
  loggerLog,
  disableVideoAnnotations,
  enableVideoAnnotations,
  disableVideoTelemetry,
  enableVideoTelemetry,
  pauseVideoTelemetry,
  resumeVideoTelemetry,
  hideVideoCountdown,
  showVideoCountdown,
} = vi.hoisted(() => ({
  loggerLog: vi.fn(),
  disableVideoAnnotations: vi.fn(),
  enableVideoAnnotations: vi.fn(),
  disableVideoTelemetry: vi.fn(),
  enableVideoTelemetry: vi.fn(),
  pauseVideoTelemetry: vi.fn(),
  resumeVideoTelemetry: vi.fn(),
  hideVideoCountdown: vi.fn(),
  showVideoCountdown: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({ log: loggerLog }),
}));

vi.mock('../../overlay/video-annotations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../overlay/video-annotations')>()),
  disableVideoAnnotations,
  enableVideoAnnotations,
}));

vi.mock('../../overlay/video-telemetry', () => ({
  disableVideoTelemetry,
  enableVideoTelemetry,
  pauseVideoTelemetry,
  resumeVideoTelemetry,
}));

vi.mock('../../overlay/video-countdown', () => ({
  hideVideoCountdown,
  showVideoCountdown,
}));

function setViewportDimensions() {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 720 });
  Object.defineProperty(window, 'outerWidth', { configurable: true, value: 1440 });
  Object.defineProperty(window, 'outerHeight', { configurable: true, value: 900 });
}

function createViewportInfo() {
  return {
    devicePixelRatio: 1,
    height: 720,
    outerHeight: 900,
    outerWidth: 1440,
    scrollX: 0,
    scrollY: 0,
    width: 1280,
    x: 0,
    y: 0,
  };
}

function createVideoRecordingSettings() {
  return {
    autoFadeDelay: 0,
    countdownSeconds: 0,
    diagnosticsEnabled: false,
    microphoneDeviceId: null,
    microphoneEnabled: true,
    openEditorAfterRecording: false,
    quality: VideoQuality.HIGH,
    systemAudioEnabled: true,
  };
}

function createRegionSelectorController() {
  return {
    hideRecordingOverlay: vi.fn(),
  };
}

function createMalformedRuntimeMessage(type: string) {
  // Malformed boundary input for runtime guard coverage.
  return { type } as never;
}

function registerViewportCoordsTest() {
  it('returns viewport coordinates for viewport info requests', () => {
    const sendResponse = vi.fn();

    expect(
      handleViewportMessage(
        { type: VideoMessageType.GET_VIEWPORT_COORDS },
        sendResponse,
        createViewportInfo,
        createRegionSelectorController()
      )
    ).toBe(true);

    expect(sendResponse).toHaveBeenCalledWith({
      coords: {
        x: 0,
        y: 0,
        width: 1280,
        height: 720,
        outerWidth: 1440,
        outerHeight: 900,
      },
    });
  });
}

function registerCountdownTests() {
  it('routes countdown visibility messages through the countdown owner', () => {
    const sendResponse = vi.fn();

    expect(
      handleViewportMessage(
        { type: VideoMessageType.SHOW_COUNTDOWN, seconds: 5, sessionId: 'session-1' },
        sendResponse,
        createViewportInfo,
        createRegionSelectorController()
      )
    ).toBe(false);
    expect(showVideoCountdown).toHaveBeenCalledWith(5, 'session-1');
    expect(sendResponse).toHaveBeenCalledWith({ success: true });

    expect(
      handleViewportMessage(
        { type: VideoMessageType.HIDE_COUNTDOWN },
        sendResponse,
        createViewportInfo,
        createRegionSelectorController()
      )
    ).toBe(false);
    expect(hideVideoCountdown).toHaveBeenCalledOnce();
    expect(sendResponse).toHaveBeenCalledWith({ success: true });
  });
}

function registerAnnotationTests() {
  registerAnnotationLifecycleTest();
}

function createTelemetrySnapshot() {
  return {
    actionEvents: [],
    cursorTrack: null,
    signals: [],
    viewport: createViewportInfo(),
  };
}

function expectAnnotationEnableWithTelemetry(
  sendResponse: ResponseSender,
  regionSelectorController: ReturnType<typeof createRegionSelectorController>,
  settings: ReturnType<typeof createVideoRecordingSettings>
) {
  expect(
    handleViewportMessage(
      {
        type: VideoMessageType.ENABLE_ANNOTATIONS,
        recordingId: 'recording-1',
        settings,
      },
      sendResponse,
      createViewportInfo,
      regionSelectorController
    )
  ).toBe(false);
  expect(loggerLog).toHaveBeenCalledWith('Enabling video annotations with settings', {
    ...settings,
  });
  expect(enableVideoAnnotations).toHaveBeenCalledWith(settings);
  expect(enableVideoTelemetry).toHaveBeenCalledWith('recording-1');
  expect(sendResponse).toHaveBeenCalledWith({
    success: true,
    viewport: createViewportInfo(),
  });
}

function registerAnnotationLifecycleTest() {
  it('boots telemetry alongside annotations when a recording id is provided', () => {
    const sendResponse = vi.fn();
    const regionSelectorController = createRegionSelectorController();
    const settings = createVideoRecordingSettings();
    disableVideoTelemetry.mockReturnValue(createTelemetrySnapshot());

    expectAnnotationEnableWithTelemetry(sendResponse, regionSelectorController, settings);
  });

  it('returns telemetry when annotations are disabled after a recording session', () => {
    const sendResponse = vi.fn();
    const regionSelectorController = createRegionSelectorController();
    const settings = createVideoRecordingSettings();
    disableVideoTelemetry.mockReturnValue(createTelemetrySnapshot());

    expectAnnotationEnableWithTelemetry(sendResponse, regionSelectorController, settings);

    expect(
      handleViewportMessage(
        { type: VideoMessageType.DISABLE_ANNOTATIONS },
        sendResponse,
        createViewportInfo,
        regionSelectorController
      )
    ).toBe(false);
    expect(disableVideoAnnotations).toHaveBeenCalledOnce();
    expect(disableVideoTelemetry).toHaveBeenCalledOnce();
    expect(regionSelectorController.hideRecordingOverlay).toHaveBeenCalledOnce();
    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      telemetry: createTelemetrySnapshot(),
    });
  });
}

function registerDefaultMessageTest() {
  it('returns null for unrelated viewport messages', () => {
    expect(
      handleViewportMessage(
        createMalformedRuntimeMessage('UNKNOWN'),
        vi.fn(),
        createViewportInfo,
        createRegionSelectorController()
      )
    ).toBeNull();
  });

  it('returns null for valid non-viewport runtime messages', () => {
    const message: ContentRuntimeMessage = { type: MessageType.SHOW_TOOLBAR };

    expect(
      handleViewportMessage(message, vi.fn(), createViewportInfo, createRegionSelectorController())
    ).toBeNull();
  });
}

describe('handleViewportMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setViewportDimensions();
  });

  registerViewportCoordsTest();
  registerCountdownTests();
  registerAnnotationTests();
  registerDefaultMessageTest();
});

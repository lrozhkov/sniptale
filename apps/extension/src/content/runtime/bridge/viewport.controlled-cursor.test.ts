// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { handleViewportMessage } from './viewport';

const { disableVideoAnnotations, enableVideoAnnotations } = vi.hoisted(() => ({
  disableVideoAnnotations: vi.fn(),
  enableVideoAnnotations: vi.fn(),
}));

const { disableVideoTelemetry, enableVideoTelemetry, pauseVideoTelemetry, resumeVideoTelemetry } =
  vi.hoisted(() => ({
    disableVideoTelemetry: vi.fn(),
    enableVideoTelemetry: vi.fn(),
    pauseVideoTelemetry: vi.fn(),
    resumeVideoTelemetry: vi.fn(),
  }));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({ log: vi.fn() }),
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

vi.mock('../../overlay/video-clicks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../overlay/video-clicks')>()),
  disableVideoClicks: vi.fn(),
  enableVideoClicks: vi.fn(),
}));

vi.mock('../../overlay/video-countdown', () => ({
  hideVideoCountdown: vi.fn(),
  showVideoCountdown: vi.fn(),
}));

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

function createRegionSelectorController() {
  return {
    hideRecordingOverlay: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('routes controlled cursor bootstrap through the telemetry owner without page annotations', () => {
  const sendResponse = vi.fn();
  const regionSelectorController = createRegionSelectorController();

  expect(
    handleViewportMessage(
      {
        type: VideoMessageType.ENABLE_CONTROLLED_CURSOR_CAPTURE,
        recordingId: 'recording-1',
        offsetSeconds: 4.5,
      },
      sendResponse,
      createViewportInfo,
      regionSelectorController
    )
  ).toBe(false);

  expect(enableVideoTelemetry).toHaveBeenCalledWith('recording-1', 4.5);
  expect(enableVideoAnnotations).not.toHaveBeenCalled();
  expect(disableVideoAnnotations).not.toHaveBeenCalled();
  expect(regionSelectorController.hideRecordingOverlay).not.toHaveBeenCalled();
  expect(sendResponse).toHaveBeenCalledWith({
    success: true,
    viewport: createViewportInfo(),
  });
});

it('routes controlled cursor disable through the telemetry owner', () => {
  const sendResponse = vi.fn();
  const regionSelectorController = createRegionSelectorController();
  disableVideoTelemetry.mockReturnValue({
    actionEvents: [],
    cursorTrack: null,
    viewport: createViewportInfo(),
  });

  expect(
    handleViewportMessage(
      { type: VideoMessageType.DISABLE_CONTROLLED_CURSOR_CAPTURE },
      sendResponse,
      createViewportInfo,
      regionSelectorController
    )
  ).toBe(false);

  expect(disableVideoTelemetry).toHaveBeenCalledOnce();
  expect(disableVideoAnnotations).not.toHaveBeenCalled();
  expect(regionSelectorController.hideRecordingOverlay).not.toHaveBeenCalled();
  expect(sendResponse).toHaveBeenCalledWith({
    success: true,
    telemetry: {
      actionEvents: [],
      cursorTrack: null,
      viewport: createViewportInfo(),
    },
  });
});

it('routes controlled cursor capture pause and resume through telemetry owner', () => {
  const sendResponse = vi.fn();
  const regionSelectorController = createRegionSelectorController();

  expect(
    handleViewportMessage(
      { type: VideoMessageType.PAUSE_CONTROLLED_CURSOR_CAPTURE },
      sendResponse,
      createViewportInfo,
      regionSelectorController
    )
  ).toBe(false);
  expect(pauseVideoTelemetry).toHaveBeenCalledOnce();

  expect(
    handleViewportMessage(
      { type: VideoMessageType.RESUME_CONTROLLED_CURSOR_CAPTURE },
      sendResponse,
      createViewportInfo,
      regionSelectorController
    )
  ).toBe(false);
  expect(resumeVideoTelemetry).toHaveBeenCalledOnce();
  expect(enableVideoAnnotations).not.toHaveBeenCalled();
  expect(disableVideoAnnotations).not.toHaveBeenCalled();
  expect(regionSelectorController.hideRecordingOverlay).not.toHaveBeenCalled();
});

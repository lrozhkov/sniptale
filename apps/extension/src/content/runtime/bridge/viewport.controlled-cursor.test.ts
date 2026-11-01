import { tabVideoControlledCursorContracts } from '../../../contracts/messaging/tab/contracts/controlled';
// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { handleViewportMessage } from './viewport';

const {
  disableVideoTelemetry,
  enableVideoTelemetry,
  pauseVideoTelemetry,
  resumeVideoTelemetry,
  flushVideoTelemetryCursor,
  flushVideoTelemetryEvents,
  waitForVideoEventsCalibration,
  updateVideoTelemetryClock,
  localizeClock,
  waitForVideoCursorCalibration,
} = vi.hoisted(() => ({
  disableVideoTelemetry: vi.fn(),
  enableVideoTelemetry: vi.fn(),
  pauseVideoTelemetry: vi.fn(),
  resumeVideoTelemetry: vi.fn(),
  flushVideoTelemetryCursor: vi.fn(),
  flushVideoTelemetryEvents: vi.fn(),
  waitForVideoEventsCalibration: vi.fn(),
  updateVideoTelemetryClock: vi.fn(),
  localizeClock: vi.fn(),
  waitForVideoCursorCalibration: vi.fn(),
}));

vi.mock('../../overlay/video-telemetry', () => ({
  disableVideoTelemetry,
  enableVideoTelemetry,
  pauseVideoTelemetry,
  resumeVideoTelemetry,
  flushVideoTelemetryCursor,
  flushVideoTelemetryEvents,
  waitForVideoEventsCalibration,
  updateVideoTelemetryClock,
  waitForVideoCursorCalibration,
}));

vi.mock('../../overlay/video-telemetry/clock-synchronization', () => ({
  createRecordingClockSynchronizer: () => ({ invalidate: vi.fn(), localize: localizeClock }),
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
  localizeClock.mockResolvedValue({ status: 'unavailable' });
  flushVideoTelemetryCursor.mockResolvedValue(true);
  flushVideoTelemetryEvents.mockResolvedValue(true);
});

it('enables the bounded cursor source and keeps Disable open until its last packet settles', async () => {
  const sendResponse = vi.fn();
  handleViewportMessage(
    {
      type: VideoMessageType.ENABLE_CONTROLLED_CURSOR_CAPTURE,
      recordingId: 'blocks',
      cursorTrajectoryMode: 'blocks',
    },
    sendResponse,
    createViewportInfo,
    createRegionSelectorController()
  );
  expect(enableVideoTelemetry).toHaveBeenCalledWith(
    'blocks',
    undefined,
    undefined,
    'blocks',
    undefined
  );
  let release!: () => void;
  flushVideoTelemetryCursor.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      })
  );
  disableVideoTelemetry.mockReturnValueOnce(null);
  sendResponse.mockClear();
  expect(
    handleViewportMessage(
      {
        type: VideoMessageType.DISABLE_CONTROLLED_CURSOR_CAPTURE,
        cursorTrajectoryMode: 'blocks',
        boundaryReason: 'observation',
      },
      sendResponse,
      createViewportInfo,
      createRegionSelectorController()
    )
  ).toBe(true);
  expect(disableVideoTelemetry).toHaveBeenCalledWith('observation');
  expect(sendResponse).not.toHaveBeenCalled();
  release();
  await Promise.resolve();
  await Promise.resolve();
  expect(sendResponse).toHaveBeenCalledWith({ success: true });
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
  expect(regionSelectorController.hideRecordingOverlay).not.toHaveBeenCalled();
});

it('passes events-only block mode and holds both sources behind the same calibration', async () => {
  const anchor = {
    recordingId: 'events-blocks',
    streamInstanceId: 'stream',
    generation: 1,
    revision: 2,
    phase: 'active' as const,
    captureEpochMs: 1000,
    mediaTimeSeconds: 0,
  };
  const calibrated = Promise.withResolvers<{ status: 'ready'; anchor: typeof anchor }>();
  localizeClock.mockReturnValueOnce(calibrated.promise);
  handleViewportMessage(
    {
      type: VideoMessageType.ENABLE_CONTROLLED_CURSOR_CAPTURE,
      recordingId: 'events-blocks',
      recordingEventsMode: 'blocks',
      frameClock: anchor,
    },
    vi.fn(),
    createViewportInfo,
    createRegionSelectorController()
  );
  expect(enableVideoTelemetry).toHaveBeenCalledWith(
    'events-blocks',
    undefined,
    null,
    undefined,
    'blocks'
  );
  expect(waitForVideoEventsCalibration).toHaveBeenCalledOnce();
  const barrier = waitForVideoEventsCalibration.mock.calls[0]![0];
  expect(waitForVideoCursorCalibration).toHaveBeenCalledExactlyOnceWith(barrier);
  expect(updateVideoTelemetryClock).not.toHaveBeenCalled();
  calibrated.resolve({ status: 'ready', anchor });
  await barrier;
  expect(updateVideoTelemetryClock).toHaveBeenCalledExactlyOnceWith('events-blocks', anchor);
});
it('keeps events-only Disable open until its last event packet settles', async () => {
  const drained = Promise.withResolvers<boolean>();
  flushVideoTelemetryEvents.mockReturnValueOnce(drained.promise);
  disableVideoTelemetry.mockReturnValueOnce(null);
  const sendResponse = vi.fn();
  expect(
    handleViewportMessage(
      {
        type: VideoMessageType.DISABLE_CONTROLLED_CURSOR_CAPTURE,
        recordingEventsMode: 'blocks',
        boundaryReason: 'observation',
      },
      sendResponse,
      createViewportInfo,
      createRegionSelectorController()
    )
  ).toBe(true);
  expect(disableVideoTelemetry).toHaveBeenCalledWith('observation');
  await Promise.resolve();
  expect(sendResponse).not.toHaveBeenCalled();
  drained.resolve(true);
  await Promise.resolve();
  await Promise.resolve();
  expect(sendResponse).toHaveBeenCalledExactlyOnceWith({ success: true });
});

it('validates independent event block mode at the tab boundary', () => {
  const enable =
    tabVideoControlledCursorContracts[VideoMessageType.ENABLE_CONTROLLED_CURSOR_CAPTURE]
      .parseRequest;
  const disable =
    tabVideoControlledCursorContracts[VideoMessageType.DISABLE_CONTROLLED_CURSOR_CAPTURE]
      .parseRequest;
  expect(
    enable({
      type: VideoMessageType.ENABLE_CONTROLLED_CURSOR_CAPTURE,
      recordingId: 'recording',
      recordingEventsMode: 'blocks',
    })
  ).toMatchObject({ recordingEventsMode: 'blocks' });
  expect(
    disable({
      type: VideoMessageType.DISABLE_CONTROLLED_CURSOR_CAPTURE,
      recordingEventsMode: 'blocks',
    })
  ).toMatchObject({ recordingEventsMode: 'blocks' });
  expect(() =>
    enable({
      type: VideoMessageType.ENABLE_CONTROLLED_CURSOR_CAPTURE,
      recordingId: 'recording',
      recordingEventsMode: 'thin-4096',
    })
  ).toThrow();
});

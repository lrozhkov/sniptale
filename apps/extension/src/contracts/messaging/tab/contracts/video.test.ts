import { describe, expect, it } from 'vitest';

import { MessageContractError } from '@sniptale/runtime-contracts/messaging/parsers/utils';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import {
  RegionCaptureControlMessageType,
  VideoMessageType,
} from '@sniptale/runtime-contracts/video/messages';
import { VideoQuality } from '@sniptale/runtime-contracts/video/types/types';
import { tabVideoMessageContracts } from './video';

function createVideoSettings() {
  return {
    ...DEFAULT_VIDEO_SETTINGS,
    autoFadeDelay: 0,
    controlledCursorCaptureEnabled: false,
    countdownSeconds: 3,
    microphoneEnabled: true,
    openEditorAfterRecording: true,
    quality: VideoQuality.MEDIUM,
  };
}

function verifyEnableAnnotationsContract() {
  expect(
    tabVideoMessageContracts[VideoMessageType.ENABLE_ANNOTATIONS]?.parseRequest({
      recordingId: 'recording-1',
      settings: createVideoSettings(),
      type: VideoMessageType.ENABLE_ANNOTATIONS,
    })
  ).toEqual({
    recordingId: 'recording-1',
    settings: createVideoSettings(),
    type: VideoMessageType.ENABLE_ANNOTATIONS,
  });
  expect(
    tabVideoMessageContracts[VideoMessageType.ENABLE_ANNOTATIONS]?.parseResponse({
      success: true,
      viewport: {
        devicePixelRatio: 1,
        height: 720,
        scrollX: 0,
        scrollY: 100,
        width: 1280,
      },
    })
  ).toEqual({
    success: true,
    viewport: {
      devicePixelRatio: 1,
      height: 720,
      scrollX: 0,
      scrollY: 100,
      width: 1280,
    },
  });
}

function verifyDisableAnnotationsContract() {
  expect(
    tabVideoMessageContracts[VideoMessageType.DISABLE_ANNOTATIONS]?.parseResponse({
      success: true,
      telemetry: {
        actionEvents: [],
        cursorTrack: null,
        viewport: null,
      },
    })
  ).toEqual({
    success: true,
    telemetry: {
      actionEvents: [],
      cursorTrack: null,
      viewport: null,
    },
  });

  expect(() =>
    tabVideoMessageContracts[VideoMessageType.DISABLE_ANNOTATIONS]?.parseResponse({
      success: true,
      telemetry: {
        actionEvents: [{ id: 'bad' }],
        cursorTrack: null,
        viewport: null,
      },
    })
  ).toThrow(MessageContractError);
}

function verifyControlledCursorCaptureLifecycleContracts() {
  expect(
    tabVideoMessageContracts[VideoMessageType.PAUSE_CONTROLLED_CURSOR_CAPTURE]?.parseRequest({
      type: VideoMessageType.PAUSE_CONTROLLED_CURSOR_CAPTURE,
    })
  ).toEqual({
    type: VideoMessageType.PAUSE_CONTROLLED_CURSOR_CAPTURE,
  });
  expect(
    tabVideoMessageContracts[VideoMessageType.RESUME_CONTROLLED_CURSOR_CAPTURE]?.parseRequest({
      type: VideoMessageType.RESUME_CONTROLLED_CURSOR_CAPTURE,
    })
  ).toEqual({
    type: VideoMessageType.RESUME_CONTROLLED_CURSOR_CAPTURE,
  });
}

function verifyViewportCursorProjectionContracts() {
  for (const type of [
    VideoMessageType.ENABLE_VIEWPORT_CURSOR_PROJECTION,
    VideoMessageType.DISABLE_VIEWPORT_CURSOR_PROJECTION,
  ]) {
    expect(
      tabVideoMessageContracts[type]?.parseRequest({
        generation: 4,
        recordingId: 'recording-1',
        type,
      })
    ).toEqual({ generation: 4, recordingId: 'recording-1', type });
    expect(() => tabVideoMessageContracts[type]?.parseRequest({ type })).toThrow(
      MessageContractError
    );
    expect(tabVideoMessageContracts[type]?.parseResponse({ success: true })).toEqual({
      success: true,
    });
  }
}

function verifyRegionCaptureStartContract() {
  expect(
    tabVideoMessageContracts[RegionCaptureControlMessageType.START]?.parseRequest({
      type: RegionCaptureControlMessageType.START,
      settings: createVideoSettings(),
    })
  ).toEqual({
    type: RegionCaptureControlMessageType.START,
    settings: createVideoSettings(),
  });

  expect(() =>
    tabVideoMessageContracts[RegionCaptureControlMessageType.START]?.parseRequest({
      type: RegionCaptureControlMessageType.START,
    })
  ).toThrow(MessageContractError);

  expect(
    tabVideoMessageContracts[RegionCaptureControlMessageType.START]?.parseResponse({
      success: true,
    })
  ).toEqual({ success: true });
}

function verifyRegionCaptureStopContract() {
  expect(
    tabVideoMessageContracts[RegionCaptureControlMessageType.STOP]?.parseRequest({
      type: RegionCaptureControlMessageType.STOP,
    })
  ).toEqual({
    type: RegionCaptureControlMessageType.STOP,
  });

  expect(() =>
    tabVideoMessageContracts[RegionCaptureControlMessageType.STOP]?.parseRequest({
      type: RegionCaptureControlMessageType.START,
    })
  ).toThrow(MessageContractError);
}

function verifyRegionCaptureSupportContract() {
  expect(
    tabVideoMessageContracts[RegionCaptureControlMessageType.CHECK_SUPPORT]?.parseRequest({
      type: RegionCaptureControlMessageType.CHECK_SUPPORT,
    })
  ).toEqual({
    type: RegionCaptureControlMessageType.CHECK_SUPPORT,
  });

  expect(
    tabVideoMessageContracts[RegionCaptureControlMessageType.CHECK_SUPPORT]?.parseResponse({
      cropTo: true,
      produceCropTarget: false,
      supported: true,
    })
  ).toEqual({
    cropTo: true,
    produceCropTarget: false,
    supported: true,
  });

  expect(() =>
    tabVideoMessageContracts[RegionCaptureControlMessageType.CHECK_SUPPORT]?.parseResponse({
      supported: true,
    })
  ).toThrow(MessageContractError);

  expect(() =>
    tabVideoMessageContracts[RegionCaptureControlMessageType.CHECK_SUPPORT]?.parseResponse({
      cropTo: 'yes',
      produceCropTarget: false,
      supported: true,
    })
  ).toThrow(MessageContractError);
}

function verifyRegionSelectionContracts() {
  const binding = {
    regionSelectionCapabilityToken: 'token-1',
    regionSelectionRequestGeneration: 'generation-1',
    regionSelectionRequestId: 'request-1',
  };
  const captureViewport = {
    devicePixelRatio: 2,
    height: 720,
    scrollX: 0,
    scrollY: 0,
    visualViewportScale: 1,
    width: 1280,
  };

  expect(
    tabVideoMessageContracts[VideoMessageType.SHOW_REGION_SELECTOR]?.parseRequest({
      type: VideoMessageType.SHOW_REGION_SELECTOR,
      ...binding,
    })
  ).toEqual({ type: VideoMessageType.SHOW_REGION_SELECTOR, ...binding });
  expect(() =>
    tabVideoMessageContracts[VideoMessageType.SHOW_REGION_SELECTOR]?.parseRequest({
      type: VideoMessageType.SHOW_REGION_SELECTOR,
    })
  ).toThrow(MessageContractError);
  expect(
    tabVideoMessageContracts[VideoMessageType.REGION_SELECTED]?.parseRequest({
      type: VideoMessageType.REGION_SELECTED,
      ...binding,
      region: { height: 20, width: 10, x: 1, y: 2 },
      captureViewport,
    })
  ).toEqual({
    type: VideoMessageType.REGION_SELECTED,
    ...binding,
    region: { height: 20, width: 10, x: 1, y: 2 },
    captureViewport,
  });
  expect(
    tabVideoMessageContracts[VideoMessageType.REGION_SELECTION_CANCELLED]?.parseRequest({
      type: VideoMessageType.REGION_SELECTION_CANCELLED,
      ...binding,
    })
  ).toEqual({ type: VideoMessageType.REGION_SELECTION_CANCELLED, ...binding });
  expect(() =>
    tabVideoMessageContracts[VideoMessageType.REGION_SELECTION_CANCELLED]?.parseRequest({
      type: VideoMessageType.REGION_SELECTION_CANCELLED,
    })
  ).toThrow(MessageContractError);
}

describe('tab-contracts/video region capture contracts', () => {
  it('validates the enable-annotations contract', verifyEnableAnnotationsContract);
  it('validates the disable-annotations contract', verifyDisableAnnotationsContract);
  it(
    'validates controlled cursor capture pause and resume contracts',
    verifyControlledCursorCaptureLifecycleContracts
  );
  it(
    'validates viewport cursor projection lifecycle contracts',
    verifyViewportCursorProjectionContracts
  );
  it('validates the start-region-capture contract', verifyRegionCaptureStartContract);
  it('validates the stop-region-capture contract', verifyRegionCaptureStopContract);
  it('validates the support-check contract', verifyRegionCaptureSupportContract);
  it('validates region-selection request binding contracts', verifyRegionSelectionContracts);
});

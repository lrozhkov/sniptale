// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { ContentRuntimeMessage } from './types';
import { handleViewportMessage } from './viewport';

const { hideVideoCountdown, showVideoCountdown } = vi.hoisted(() => ({
  hideVideoCountdown: vi.fn(),
  showVideoCountdown: vi.fn(),
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
      success: true,
      coords: {
        x: 0,
        y: 0,
        width: 1280,
        height: 720,
        outerWidth: 1440,
        outerHeight: 900,
      },
      viewport: createViewportInfo(),
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
  registerDefaultMessageTest();
});

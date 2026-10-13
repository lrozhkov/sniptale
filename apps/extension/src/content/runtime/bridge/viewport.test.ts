import { projectRecordingObservationClock } from '../../../features/video/project/observation-clock';
// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  CONTENT_RUNTIME_PROTOCOL_VERSION,
  VideoMessageType,
} from '@sniptale/runtime-contracts/video/messages';
import type { ContentRuntimeMessage } from './types';
import { handleViewportMessage } from './viewport';
import { disableVideoTelemetry } from '../../overlay/video-telemetry';
import { resetContentRuntimeServicesForTests } from '../../platform/runtime-services/services';
import { afterEach } from 'vitest';

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
      contentRuntimeProtocolVersion: CONTENT_RUNTIME_PROTOCOL_VERSION,
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

afterEach(() => {
  disableVideoTelemetry();
  resetContentRuntimeServicesForTests();
});

it('acknowledges and starts observers before calibration resolves, then ignores a stopped late result', async () => {
  const { resetContentRuntimeServicesForTests: reset, getContentRuntimeServices } =
    await import('../../platform/runtime-services/services');
  reset();
  const services = getContentRuntimeServices();
  let finish!: (value: { success: false }) => void;
  vi.spyOn(services.messaging, 'sendRuntimeMessage').mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const add = vi.spyOn(document, 'addEventListener');
  const sendResponse = vi.fn();
  const anchor = {
    recordingId: 'early-observation',
    generation: 1,
    streamInstanceId: 'source',
    revision: 1,
    phase: 'active' as const,
    captureEpochMs: performance.timeOrigin,
    mediaTimeSeconds: 0,
  };
  expect(
    handleViewportMessage(
      {
        type: VideoMessageType.ENABLE_CONTROLLED_CURSOR_CAPTURE,
        recordingId: anchor.recordingId,
        frameClock: anchor,
      },
      sendResponse,
      createViewportInfo,
      createRegionSelectorController()
    )
  ).toBe(false);
  expect(sendResponse).toHaveBeenCalledOnce();
  expect(add.mock.calls.some(([type]) => type === 'pointerdown')).toBe(true);
  const raw = disableVideoTelemetry();
  expect(raw?.capabilities?.timing).toEqual({ mode: 'approximate', accuracyMs: null });
  finish({ success: false });
  await Promise.resolve();
  expect(disableVideoTelemetry()).toBeNull();
  add.mockRestore();
});

it('preserves earlier facts through real bridge resume when pause delivery was missed', async () => {
  const { getContentRuntimeServices } = await import('../../platform/runtime-services/services');
  let now = 1000;
  const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
  const add = vi.spyOn(document, 'addEventListener');
  const services = getContentRuntimeServices();
  const source = { recordingId: 'missed-bridge', generation: 1, streamInstanceId: 'source' };
  const exchange = vi
    .spyOn(services.messaging, 'sendRuntimeMessage')
    .mockImplementation(async (message) => {
      if (message.type === VideoMessageType.RECORDING_OBSERVATIONS) return { success: true };
      return {
        success: true,
        clockTiming: {
          ...source,
          receivedAtMs: performance.timeOrigin + now,
          repliedAtMs: performance.timeOrigin + now,
          maximumUncertaintyMs: 8,
        },
      };
    });
  const anchor = {
    ...source,
    revision: 1,
    phase: 'active' as const,
    captureEpochMs: performance.timeOrigin + 1000,
    mediaTimeSeconds: 0,
  };
  const handle = (message: ContentRuntimeMessage) =>
    handleViewportMessage(message, vi.fn(), createViewportInfo, createRegionSelectorController());
  const down = (stamp: number, x: number) => {
    for (const type of ['pointerdown', 'pointerup']) {
      const event = new MouseEvent(type, { clientX: x, clientY: 60 });
      Object.defineProperty(event, 'timeStamp', { value: stamp });
      const listener = add.mock.calls.toReversed().find(([eventType]) => eventType === type)?.[1];
      if (typeof listener !== 'function') throw new Error('observer missing');
      listener.call(
        document,
        new Proxy(event, {
          get(target, key) {
            if (key === 'isTrusted') return true;
            const value = Reflect.get(target, key);
            return typeof value === 'function' ? value.bind(target) : value;
          },
        })
      );
    }
  };
  try {
    handle({
      type: VideoMessageType.ENABLE_CONTROLLED_CURSOR_CAPTURE,
      recordingId: source.recordingId,
      frameClock: anchor,
    });
    await vi.waitFor(() => expect(exchange).toHaveBeenCalledTimes(3));
    await Promise.resolve();
    now = 1250;
    down(now, 40);
    now = 2500;
    down(now, 70);
    now = 3000;
    const resumed = {
      ...anchor,
      revision: 3,
      captureEpochMs: performance.timeOrigin + 3000,
      mediaTimeSeconds: 0.4,
      previousMediaTimeSeconds: 0.4,
    };
    handle({ type: VideoMessageType.RESUME_CONTROLLED_CURSOR_CAPTURE, frameClock: resumed });
    now = 3250;
    down(now, 90);
    await vi.waitFor(() => expect(exchange).toHaveBeenCalledTimes(6));
    await Promise.resolve();
    const raw = disableVideoTelemetry()!;
    expect(raw.observationClock?.segments).toHaveLength(2);
    expect(raw.actionEvents).toHaveLength(3);
    const projected = projectRecordingObservationClock(raw);
    expect(projected.actionEvents.map((event) => event.point?.x)).toEqual([40, 90]);
    expect(projected.actionEvents.map((event) => event.time)).toEqual([
      0.25,
      expect.closeTo(0.65, 6),
    ]);
  } finally {
    clock.mockRestore();
    add.mockRestore();
    exchange.mockRestore();
  }
});

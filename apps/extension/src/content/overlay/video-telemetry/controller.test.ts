// @vitest-environment jsdom
import { tabVideoControlledCursorContracts } from '../../../contracts/messaging/tab/contracts/controlled';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  type RecordingActionEvent,
  VideoProjectActionEventKind,
} from '../../../features/video/project/types';
import { projectRecordingObservationClock } from '../../../features/video/project/observation-clock';
import { createVideoTelemetryController } from './controller';
import * as telemetryEvents from './events';
import { isRecordingTelemetrySnapshot } from '../../../features/video/project/validation/recording-telemetry';
import { parseRecordingTelemetryEntry } from '../../../composition/persistence/recordings/telemetry.guards';
import { iterateRecordingKeyboardRhythm } from '../../../features/video/project/keyboard-rhythm';

function disableProjected(controller: ReturnType<typeof createVideoTelemetryController>) {
  const raw = controller.disable();
  return raw ? projectRecordingObservationClock(raw) : null;
}

function createPointerLikeEvent(clientX: number, clientY: number): MouseEvent {
  const eventName = 'onpointerrawupdate' in window ? 'pointerrawupdate' : 'pointermove';
  return new MouseEvent(eventName, { bubbles: true, clientX, clientY });
}

function sendTrusted(event: Event): void {
  // jsdom defaults to epoch milliseconds; browser DOM events use document-relative time.
  if (!Object.hasOwn(event, 'timeStamp'))
    Object.defineProperty(event, 'timeStamp', { value: performance.now() });
  const match = vi
    .mocked(document.addEventListener)
    .mock.calls.toReversed()
    .find(([type]) => type === event.type);
  const listener = match?.[1];
  if (
    typeof listener !== 'function' ||
    vi.mocked(document.removeEventListener).mock.calls.some(([, removed]) => removed === listener)
  )
    return;
  const delivered = new Proxy(event, {
    get(target, key) {
      if (key === 'isTrusted') return true;
      const value = Reflect.get(target, key);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  listener.call(document, delivered);
}

beforeEach(() => {
  vi.spyOn(document, 'addEventListener');
  vi.spyOn(document, 'removeEventListener');
  vi.useFakeTimers();
  let counter = 0;
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => `id-${++counter}`) });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.getElementById('sniptale-controlled-cursor-overlay')?.remove();
  document.getElementById('sniptale-controlled-cursor-style')?.remove();
  document.getElementById('sniptale-controlled-cursor-hide-style')?.remove();
});

it('records cursor samples and click actions across enable pause resume and disable', () => {
  const controller = createVideoTelemetryController();

  controller.enable('recording-1');
  sendTrusted(createPointerLikeEvent(40, 60));
  sendTrusted(
    new MouseEvent('pointerdown', { bubbles: true, detail: 1, clientX: 40, clientY: 60 })
  );
  sendTrusted(new MouseEvent('pointerup', { clientX: 40, clientY: 60 }));
  controller.pause();
  vi.advanceTimersByTime(24);
  sendTrusted(createPointerLikeEvent(90, 120));
  controller.resume();
  vi.advanceTimersByTime(24);
  sendTrusted(createPointerLikeEvent(120, 160));

  const snapshot = disableProjected(controller);

  expect(snapshot?.cursorTrack?.samples.length).toBeGreaterThanOrEqual(2);
  expect(snapshot?.actionEvents).toEqual(
    expect.arrayContaining([expect.objectContaining({ kind: VideoProjectActionEventKind.CLICK })])
  );
  expect(
    snapshot?.actionEvents.some((event) => event.kind === VideoProjectActionEventKind.SCROLL)
  ).toBe(false);
  const click: RecordingActionEvent | undefined = snapshot?.actionEvents.find(
    (event) => event.kind === VideoProjectActionEventKind.CLICK
  );
  expect(click).toMatchObject({
    time: expect.any(Number),
    duration: expect.any(Number),
    preset: 'CLICK_RIPPLE',
    point: { x: 40, y: 60 },
  });
  expect(click).not.toHaveProperty('anchor');
  expect(document.getElementById('sniptale-controlled-cursor-overlay')).toBeNull();
});

it('clears stale controlled cursor overlay artifacts without mounting a replacement cursor preview', () => {
  document.body.innerHTML = `
    <div id="sniptale-controlled-cursor-overlay"></div>
    <style id="sniptale-controlled-cursor-style"></style>
    <style id="sniptale-controlled-cursor-hide-style"></style>
  `;
  const controller = createVideoTelemetryController();

  controller.enable('recording-4');

  expect(document.getElementById('sniptale-controlled-cursor-overlay')).toBeNull();
  expect(document.getElementById('sniptale-controlled-cursor-style')).toBeNull();
  expect(document.getElementById('sniptale-controlled-cursor-hide-style')).toBeNull();

  document.body.innerHTML = `
    <div id="sniptale-controlled-cursor-overlay"></div>
    <style id="sniptale-controlled-cursor-style"></style>
    <style id="sniptale-controlled-cursor-hide-style"></style>
  `;

  controller.pause();

  expect(document.getElementById('sniptale-controlled-cursor-overlay')).toBeNull();
  expect(document.getElementById('sniptale-controlled-cursor-style')).toBeNull();
  expect(document.getElementById('sniptale-controlled-cursor-hide-style')).toBeNull();
});

it('throttles high-frequency pointer samples while preserving click capture', () => {
  const controller = createVideoTelemetryController();

  controller.enable('recording-3');
  sendTrusted(createPointerLikeEvent(10, 10));
  vi.advanceTimersByTime(10);
  sendTrusted(createPointerLikeEvent(11, 11));
  vi.advanceTimersByTime(10);
  sendTrusted(createPointerLikeEvent(12, 12));
  sendTrusted(new MouseEvent('click', { bubbles: true, detail: 1, clientX: 12, clientY: 12 }));

  const snapshot = disableProjected(controller);

  expect(snapshot?.cursorTrack?.samples.length).toBeGreaterThanOrEqual(3);
  expect(snapshot?.cursorTrack?.samples.at(-1)).toEqual(expect.objectContaining({ x: 12, y: 12 }));
});

it('returns stable initial viewport proof for an unchanged recording', () => {
  const controller = createVideoTelemetryController();
  controller.enable('static-recording');
  sendTrusted(
    new MouseEvent('pointerdown', { bubbles: true, detail: 1, clientX: 40, clientY: 60 })
  );
  expect(disableProjected(controller)).toMatchObject({
    viewportObservation: {
      initial: {
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
      },
      stable: true,
    },
  });
});

it.each([false, true])('invalidates resize-back even while paused=%s', (paused) => {
  const initialWidth = window.innerWidth;
  const controller = createVideoTelemetryController();
  controller.enable('changed-recording');
  if (paused) controller.pause();
  vi.stubGlobal('innerWidth', initialWidth + 100);
  window.dispatchEvent(new Event('resize'));
  vi.stubGlobal('innerWidth', initialWidth);
  window.dispatchEvent(new Event('resize'));
  if (paused) controller.resume();
  expect(disableProjected(controller)).toMatchObject({
    viewportObservation: { initial: { width: initialWidth }, stable: false },
  });
});

it('captures keyboard commands once and excludes paused time across resume and stop', () => {
  let now = 1000;
  const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
  const controller = createVideoTelemetryController();
  const key = (value: string, time: number) => {
    const event = new KeyboardEvent('keydown', { key: value, bubbles: true });
    Object.defineProperty(event, 'timeStamp', { value: time });
    sendTrusted(event);
  };
  try {
    key('F1', 1100);
    controller.enable('keys', 2);
    key('F2', 1500);
    now = 2000;
    controller.pause();
    key('F3', 4000);
    now = 5000;
    controller.resume();
    controller.resume();
    key('F4', 5500);
    now = 6000;
    const snapshot = disableProjected(controller);
    key('F5', 6500);
    expect(
      snapshot?.actionEvents.map((event) => ({ label: event.label, time: event.time }))
    ).toEqual([
      { label: 'F2', time: 2.5 },
      { label: 'F4', time: 3.5 },
    ]);
    expect(disableProjected(controller)).toBeNull();
  } finally {
    disableProjected(controller);
    clock.mockRestore();
  }
});

it('does not turn a recording pause into cursor idle activity after resume', () => {
  let now = 1000;
  const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
  const controller = createVideoTelemetryController();
  try {
    controller.enable('idle-pause');
    const event = createPointerLikeEvent(40, 60);
    Object.defineProperty(event, 'timeStamp', { value: 1100 });
    sendTrusted(event);
    now = 1200;
    controller.pause();
    now = 10000;
    controller.resume();
    now = 10010;
    vi.advanceTimersByTime(250);
    const snapshot = disableProjected(controller);
    expect(snapshot?.signals.filter((signal) => signal.kind === 'cursor-idle')).toEqual([]);
  } finally {
    disableProjected(controller);
    clock.mockRestore();
  }
});

it('uses original native frame epoch rather than delayed enable or resume receipt', () => {
  const now = vi.spyOn(performance, 'now').mockReturnValue(1100);
  const controller = createVideoTelemetryController();
  const source = {
    recordingId: 'clock-recording',
    generation: 1,
    streamInstanceId: 'native-source',
  };
  const initial = {
    ...source,
    revision: 1,
    phase: 'active' as const,
    captureEpochMs: performance.timeOrigin + 1000,
    mediaTimeSeconds: 0,
  };
  controller.enable(source.recordingId, 0, initial);
  const down = new MouseEvent('pointerdown', { clientX: 40, clientY: 60 });
  Object.defineProperty(down, 'timeStamp', { value: 1250 });
  sendTrusted(down);
  const up = new MouseEvent('pointerup', { clientX: 40, clientY: 60 });
  Object.defineProperty(up, 'timeStamp', { value: 1260 });
  sendTrusted(up);
  now.mockReturnValue(1400);
  controller.pause({
    ...initial,
    revision: 2,
    phase: 'paused',
    captureEpochMs: performance.timeOrigin + 1300,
    mediaTimeSeconds: 0.3,
  });
  now.mockReturnValue(6100);
  controller.resume({
    ...initial,
    revision: 3,
    captureEpochMs: performance.timeOrigin + 6000,
    mediaTimeSeconds: 2 / 30,
  });
  const resumedDown = new MouseEvent('pointerdown', { clientX: 100, clientY: 120 });
  Object.defineProperty(resumedDown, 'timeStamp', { value: 6250 });
  sendTrusted(resumedDown);
  const actions = disableProjected(controller)?.actionEvents ?? [];
  expect(actions[0]?.time).toBeCloseTo(0.25, 6);
  expect(actions[1]?.time).toBeCloseTo(2 / 30 + 0.25, 6);
});

it('retains a pre-pause down as incomplete and excludes late release/movement and later onsets', () => {
  const controller = createVideoTelemetryController();
  const anchor = {
    recordingId: 'clock-prefix',
    generation: 1,
    streamInstanceId: 'source',
    revision: 1,
    phase: 'active' as const,
    captureEpochMs: performance.timeOrigin + 1000,
    mediaTimeSeconds: 0,
  };
  controller.enable(anchor.recordingId, 0, anchor);
  const deliver = (type: string, stamp: number, x: number) => {
    const event = new MouseEvent(type, { clientX: x, clientY: 60 });
    Object.defineProperty(event, 'timeStamp', { value: stamp });
    sendTrusted(event);
  };
  deliver('pointerdown', 1250, 40);
  deliver('pointermove', 1500, 300);
  deliver('pointerup', 1510, 300);
  deliver('pointerdown', 1540, 400);
  deliver('pointerup', 1550, 400);
  controller.pause({
    ...anchor,
    revision: 2,
    phase: 'paused',
    captureEpochMs: performance.timeOrigin + 1300,
    mediaTimeSeconds: 0.3,
  });
  const snapshot = disableProjected(controller);
  expect(snapshot?.actionEvents).toHaveLength(1);
  expect(snapshot?.actionEvents[0]).toMatchObject({
    time: 0.25,
    point: { x: 40, y: 60 },
    preset: 'CLICK_PRESS',
    data: { completion: 'lost', lastObservedTime: 0.25 },
  });
  expect(snapshot?.actionEvents[0]?.data).not.toHaveProperty('upTime');
  expect(snapshot?.actionEvents[0]?.data['maxExcursionCssPx']).toBe(0);
  expect(snapshot?.cursorTrack?.samples.every((sample) => sample.time <= 0.3)).toBe(true);
});

it('maps a replaced document origin to the same source epoch and ignores stale phase anchors', () => {
  const origin = performance.timeOrigin;
  const anchor = {
    recordingId: 'clock-navigation',
    generation: 1,
    streamInstanceId: 'source',
    revision: 3,
    phase: 'active' as const,
    captureEpochMs: origin + 1000,
    mediaTimeSeconds: 2 / 30,
  };
  const controller = createVideoTelemetryController();
  vi.stubGlobal('performance', { timeOrigin: origin + 500, now: () => 500 });
  controller.enable(anchor.recordingId, 999, anchor);
  controller.pause({
    ...anchor,
    revision: 2,
    phase: 'paused',
    captureEpochMs: origin + 1300,
    mediaTimeSeconds: 0.3,
  });
  const event = new MouseEvent('pointerdown', { clientX: 40, clientY: 60 });
  Object.defineProperty(event, 'timeStamp', { value: 750 });
  sendTrusted(event);
  expect(disableProjected(controller)?.actionEvents[0]?.time).toBeCloseTo(2 / 30 + 0.25, 6);
});

it('records usable observations with explicit approximate timing when calibration is unavailable', () => {
  const controller = createVideoTelemetryController();
  controller.enable('clock-unavailable', 0, null);
  expect(controller.isEnabled()).toBe(true);
  sendTrusted(createPointerLikeEvent(40, 60));
  const down = new MouseEvent('pointerdown', { clientX: 40, clientY: 60 });
  const up = new MouseEvent('pointerup', { clientX: 50, clientY: 60 });
  Object.defineProperty(down, 'timeStamp', { value: 100 });
  Object.defineProperty(up, 'timeStamp', { value: 700 });
  sendTrusted(down);
  sendTrusted(up);
  const snapshot = disableProjected(controller);
  expect(snapshot?.actionEvents).toHaveLength(1);
  expect(snapshot?.cursorTrack?.samples.length).toBeGreaterThan(0);
  expect(snapshot?.actionEvents[0]?.data).toMatchObject({
    pressDuration: 0.6,
    completion: 'released',
  });
  expect(snapshot?.capabilities).toMatchObject({
    timing: { mode: 'approximate', accuracyMs: null },
  });
  expect(vi.getTimerCount()).toBe(0);
});

it('preserves the accumulated facts and resumes observation when a real pause has no calibrated anchor', () => {
  const controller = createVideoTelemetryController();
  const anchor = {
    recordingId: 'retained-clock-loss',
    generation: 1,
    streamInstanceId: 'source',
    revision: 1,
    phase: 'active' as const,
    captureEpochMs: performance.timeOrigin,
    mediaTimeSeconds: 0,
  };
  controller.enable(anchor.recordingId, 0, anchor);
  const click = (stamp: number, x: number) => {
    for (const type of ['pointerdown', 'pointerup']) {
      const event = new MouseEvent(type, { clientX: x, clientY: 60 });
      Object.defineProperty(event, 'timeStamp', { value: stamp });
      sendTrusted(event);
    }
  };
  click(100, 40);
  controller.pause(null);
  click(200, 70);
  controller.resume(null);
  expect(controller.isEnabled()).toBe(true);
  click(300, 90);
  const snapshot = disableProjected(controller);
  expect(snapshot?.actionEvents.map((event) => event.point?.x)).toEqual([40, 90]);
  expect(vi.getTimerCount()).toBe(0);
});

it('updates a late calibration without resetting facts, IDs or physical duration', () => {
  const controller = createVideoTelemetryController();
  controller.enable('late', 0, null);
  const deliver = (type: string, stamp: number) => {
    const event = new MouseEvent(type, { clientX: 40, clientY: 60 });
    Object.defineProperty(event, 'timeStamp', { value: stamp });
    sendTrusted(event);
  };
  deliver('pointerdown', 1250);
  deliver('pointerup', 1850);
  controller.updateClock('late', {
    recordingId: 'late',
    generation: 1,
    streamInstanceId: 'source',
    revision: 1,
    phase: 'active',
    captureEpochMs: performance.timeOrigin + 1000,
    mediaTimeSeconds: 0,
    uncertaintyMs: 25,
    maximumUncertaintyMs: 8,
  });
  controller.enable('late', 0, null);
  const raw = controller.disable();
  expect(raw?.actionEvents).toHaveLength(1);
  expect(raw?.actionEvents[0]?.time).toBe(1.25);
  expect(raw?.actionEvents[0]?.data['pressDuration']).toBeCloseTo(0.6);
  const view = raw ? projectRecordingObservationClock(raw) : null;
  expect(view?.actionEvents[0]?.id).toBe(raw?.actionEvents[0]?.id);
  expect(view?.actionEvents[0]?.time).toBe(0.25);
  expect(view?.capabilities?.timing).toEqual({ mode: 'approximate', accuracyMs: 25 });
  expect(raw?.observationClock?.domain).toBe('observation');
  expect(vi.getTimerCount()).toBe(0);
});

it('preserves the full raw tail and excludes only a proven pause tail from media presentation', () => {
  const controller = createVideoTelemetryController();
  const anchor = {
    recordingId: 'missed',
    generation: 1,
    streamInstanceId: 'source',
    revision: 1,
    phase: 'active' as const,
    captureEpochMs: performance.timeOrigin + 1000,
    mediaTimeSeconds: 0,
  };
  controller.enable(anchor.recordingId, 0, anchor);
  const deliver = (stamp: number, key: string) => {
    const event = new KeyboardEvent('keydown', {
      key,
      code: `Key${key.toUpperCase()}`,
      ctrlKey: true,
    });
    Object.defineProperty(event, 'timeStamp', { value: stamp });
    sendTrusted(event);
  };
  deliver(1250, 'k');
  deliver(2500, 'j');
  controller.resume({
    ...anchor,
    revision: 3,
    captureEpochMs: performance.timeOrigin + 3000,
    mediaTimeSeconds: 0.4,
    previousMediaTimeSeconds: 0.4,
  });
  deliver(3250, 'l');
  const raw = controller.disable();
  expect(raw?.actionEvents.map((event) => event.time)).toEqual([1.25, 2.5, 3.25]);
  expect(
    raw && projectRecordingObservationClock(raw).actionEvents.map((event) => event.time)
  ).toEqual([0.25, expect.closeTo(0.65, 6)]);
  expect(controller.isEnabled()).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});

it('keeps observing after an unavailable resume and ignores foreign or stale late bindings', () => {
  const controller = createVideoTelemetryController();
  const anchor = {
    recordingId: 'stable',
    generation: 1,
    streamInstanceId: 'source',
    revision: 2,
    phase: 'active' as const,
    captureEpochMs: performance.timeOrigin + 1000,
    mediaTimeSeconds: 0,
  };
  controller.enable(anchor.recordingId, 0, anchor);
  controller.resume(null);
  controller.updateClock('foreign', { ...anchor, revision: 4 });
  controller.updateClock('stable', {
    ...anchor,
    revision: 1,
    captureEpochMs: performance.timeOrigin + 5000,
  });
  expect(controller.isEnabled()).toBe(true);
  const event = new MouseEvent('pointerdown', { clientX: 40, clientY: 60 });
  Object.defineProperty(event, 'timeStamp', { value: 1250 });
  sendTrusted(event);
  expect(disableProjected(controller)?.actionEvents[0]?.time).toBe(0.25);
  expect(vi.getTimerCount()).toBe(0);
});

it.each([false, true])(
  'keeps old-document facts bounded through admission with calibration=%s',
  (calibrated) => {
    let now = 3 * 86400000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const controller = createVideoTelemetryController();
    const deliver = (event: Event, timestamp: number) => {
      Object.defineProperty(event, 'timeStamp', { value: timestamp });
      sendTrusted(event);
    };
    const anchor = {
      recordingId: 'old-document',
      generation: 1,
      streamInstanceId: 'source',
      revision: 1,
      phase: 'active' as const,
      captureEpochMs: performance.timeOrigin + now,
      mediaTimeSeconds: 0,
    };
    controller.enable(anchor.recordingId, 0, calibrated ? anchor : null);
    deliver(new MouseEvent('pointerdown', { clientX: 40, clientY: 60 }), now + 100);
    deliver(new MouseEvent('pointerup', { clientX: 40, clientY: 60 }), now + 700);
    const target = document.createElement('textarea');
    document.body.append(target);
    for (const timestamp of [now + 200, now + 450]) {
      const key = new KeyboardEvent('keydown', { key: 'a', code: 'KeyA' });
      Object.defineProperty(key, 'target', { value: target });
      deliver(key, timestamp);
    }
    now += 1000;
    controller.pause(null);
    expect(vi.getTimerCount()).toBe(0);
    const pausedEvent = new MouseEvent('pointerdown', { clientX: 200, clientY: 60 });
    deliver(pausedEvent, now + 100);
    now += 3 * 86400000;
    controller.resume(null);
    deliver(new MouseEvent('pointerdown', { clientX: 90, clientY: 60 }), now + 100);
    deliver(new MouseEvent('pointerup', { clientX: 90, clientY: 60 }), now + 150);
    now += 200;
    const raw = controller.disable();
    expect(controller.isEnabled()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    expect(isRecordingTelemetrySnapshot(raw)).toBe(true);
    expect(
      tabVideoControlledCursorContracts[
        VideoMessageType.DISABLE_CONTROLLED_CURSOR_CAPTURE
      ].parseResponse({ success: true, telemetry: raw })
    ).toMatchObject({ success: true, telemetry: raw });
    const stored = parseRecordingTelemetryEntry({
      ...raw,
      recordingId: anchor.recordingId,
      createdAt: 1,
      updatedAt: 2,
      captureMode: 'TAB',
    });
    expect(stored).not.toBeNull();
    expect(stored?.actionEvents.map((event) => event.time)).toEqual([0.1, 1.1]);
    expect(stored?.actionEvents[0]?.data['pressDuration']).toBe(0.6);
    expect(
      stored?.signals.flatMap(
        (signal) =>
          signal.keyboardRhythm?.flatMap((block) =>
            [...iterateRecordingKeyboardRhythm(block)].map((attack) => attack.time)
          ) ?? []
      )
    ).toEqual([0.2, 0.45]);
    const view = stored && projectRecordingObservationClock(stored);
    expect(view?.actionEvents.map((event) => event.point?.x)).toEqual([40, 90]);
    expect(view?.actionEvents.map((event) => event.time)).toEqual([0.1, 1.1]);
    expect(raw?.observationClock?.segments[0]?.startedAtTimestampMs).toBe(3 * 86400000);
  }
);

it.each(['pause', 'disable'] as const)(
  'releases observation even if %s finalization throws',
  (operation) => {
    const controller = createVideoTelemetryController();
    controller.enable('teardown');
    vi.spyOn(telemetryEvents, 'recordTelemetryPauseBoundary').mockImplementation(() => {
      throw new Error('finalization');
    });
    expect(() => controller[operation]()).toThrow('finalization');
    expect(vi.getTimerCount()).toBe(0);
    sendTrusted(new MouseEvent('pointerdown', { clientX: 200, clientY: 60 }));
    if (operation === 'disable') expect(controller.isEnabled()).toBe(false);
    else expect(controller.disable()?.actionEvents).toEqual([]);
  }
);

it.each([false, true])(
  'publishes outgoing facts once when background disable precedes pagehide=%s',
  (disabledFirst) => {
    const publish = vi.fn();
    const controller = createVideoTelemetryController({ publish });
    controller.enable('outgoing', 0, null);
    sendTrusted(new MouseEvent('pointerdown', { clientX: 40, clientY: 60 }));
    sendTrusted(new MouseEvent('pointerup', { clientX: 40, clientY: 60 }));
    if (disabledFirst) controller.disable();
    window.dispatchEvent(new Event('pagehide'));
    expect(publish).toHaveBeenCalledOnce();
    expect(publish).toHaveBeenCalledWith(
      'outgoing',
      expect.objectContaining({
        actionEvents: [expect.objectContaining({ point: { x: 40, y: 60 } })],
      })
    );
    expect(controller.isEnabled()).toBe(false);
    expect(controller.disable()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  }
);

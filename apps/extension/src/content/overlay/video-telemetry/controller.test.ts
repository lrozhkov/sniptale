// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  type RecordingActionEvent,
  VideoProjectActionEventKind,
} from '../../../features/video/project/types';
import { createVideoTelemetryController } from './controller';

function createPointerLikeEvent(clientX: number, clientY: number): MouseEvent {
  const eventName = 'onpointerrawupdate' in window ? 'pointerrawupdate' : 'pointermove';
  return new MouseEvent(eventName, { bubbles: true, clientX, clientY });
}

function sendTrusted(event: Event): void {
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

  const snapshot = controller.disable();

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

  const snapshot = controller.disable();

  expect(snapshot?.cursorTrack?.samples.length).toBeGreaterThanOrEqual(3);
  expect(snapshot?.cursorTrack?.samples.at(-1)).toEqual(expect.objectContaining({ x: 12, y: 12 }));
});

it('returns stable initial viewport proof for an unchanged recording', () => {
  const controller = createVideoTelemetryController();
  controller.enable('static-recording');
  sendTrusted(
    new MouseEvent('pointerdown', { bubbles: true, detail: 1, clientX: 40, clientY: 60 })
  );
  expect(controller.disable()).toMatchObject({
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
  expect(controller.disable()).toMatchObject({
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
    const snapshot = controller.disable();
    key('F5', 6500);
    expect(
      snapshot?.actionEvents.map((event) => ({ label: event.label, time: event.time }))
    ).toEqual([
      { label: 'F2', time: 2.5 },
      { label: 'F4', time: 3.5 },
    ]);
    expect(controller.disable()).toBeNull();
  } finally {
    controller.disable();
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
    const snapshot = controller.disable();
    expect(snapshot?.signals.filter((signal) => signal.kind === 'cursor-idle')).toEqual([]);
  } finally {
    controller.disable();
    clock.mockRestore();
  }
});

it('uses original native frame epoch rather than delayed enable or resume receipt', () => {
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
  controller.pause({
    ...initial,
    revision: 2,
    phase: 'paused',
    captureEpochMs: performance.timeOrigin + 1300,
    mediaTimeSeconds: 0.3,
  });
  vi.advanceTimersByTime(8000);
  controller.resume({
    ...initial,
    revision: 3,
    captureEpochMs: performance.timeOrigin + 6000,
    mediaTimeSeconds: 2 / 30,
  });
  const resumedDown = new MouseEvent('pointerdown', { clientX: 100, clientY: 120 });
  Object.defineProperty(resumedDown, 'timeStamp', { value: 6250 });
  sendTrusted(resumedDown);
  const actions = controller.disable()?.actionEvents ?? [];
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
  const snapshot = controller.disable();
  expect(snapshot?.actionEvents).toHaveLength(1);
  expect(snapshot?.actionEvents[0]).toMatchObject({
    time: 0.25,
    point: { x: 40, y: 60 },
    preset: 'CLICK_PRESS',
    data: { gestureType: 'click', completion: 'lost', lastObservedTime: 0.25 },
  });
  expect(snapshot?.actionEvents[0]?.data).not.toHaveProperty('upTime');
  expect(snapshot?.actionEvents[0]?.data).not.toHaveProperty('maxExcursionCssPx');
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
  vi.stubGlobal('performance', { timeOrigin: origin + 500, now: () => 9000 });
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
  expect(controller.disable()?.actionEvents[0]?.time).toBeCloseTo(2 / 30 + 0.25, 6);
});

it('refuses synchronized history when an exact clock is unavailable instead of using a numeric offset', () => {
  const controller = createVideoTelemetryController();
  controller.enable('clock-unavailable', 999, null);
  expect(controller.isEnabled()).toBe(false);
  sendTrusted(new MouseEvent('pointerdown', { clientX: 40, clientY: 60 }));
  expect(controller.disable()).toBeNull();
});

it('recovers an initially unavailable observation only from a valid resumed recording anchor', () => {
  const controller = createVideoTelemetryController();
  const anchor = {
    recordingId: 'initial-clock-gap',
    generation: 1,
    streamInstanceId: 'source',
    revision: 3,
    phase: 'active' as const,
    captureEpochMs: performance.timeOrigin + 3000,
    mediaTimeSeconds: 0.4,
  };
  controller.enable(anchor.recordingId, 999, null);
  expect(controller.isEnabled()).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
  controller.resume({ ...anchor, recordingId: 'foreign' });
  expect(controller.isEnabled()).toBe(false);
  controller.resume({ ...anchor, phase: 'paused' });
  expect(controller.isEnabled()).toBe(false);
  controller.resume(anchor);
  expect(controller.isEnabled()).toBe(true);
  for (const [type, stamp] of [
    ['pointerdown', 3250],
    ['pointerup', 3260],
  ] as const) {
    const event = new MouseEvent(type, { clientX: 40, clientY: 60 });
    Object.defineProperty(event, 'timeStamp', { value: stamp });
    sendTrusted(event);
  }
  const snapshot = controller.disable();
  expect(snapshot?.actionEvents).toHaveLength(1);
  expect(snapshot?.actionEvents[0]?.time).toBeCloseTo(0.65, 6);
  expect(snapshot?.actionEvents[0]?.data['pressDuration']).toBeCloseTo(0.01, 6);
  expect(vi.getTimerCount()).toBe(0);
});

it('fails closed after a missed native pause instead of retaining excluded facts or duplicated observers', () => {
  const controller = createVideoTelemetryController();
  const anchor = {
    recordingId: 'missed-pause',
    generation: 1,
    streamInstanceId: 'source',
    revision: 1,
    phase: 'active' as const,
    captureEpochMs: performance.timeOrigin + 1000,
    mediaTimeSeconds: 0,
  };
  controller.enable(anchor.recordingId, 0, anchor);
  const deliver = (stamp: number) => {
    const event = new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', ctrlKey: true });
    Object.defineProperty(event, 'timeStamp', { value: stamp });
    sendTrusted(event);
  };
  deliver(1250);
  // Native pause revision2 was not delivered to this content document.
  deliver(2500);
  controller.resume({
    ...anchor,
    revision: 3,
    captureEpochMs: performance.timeOrigin + 3000,
    mediaTimeSeconds: 0.4,
  });
  expect(controller.isEnabled()).toBe(false);
  deliver(3250);
  expect(controller.disable()).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
  for (const [type, listener, options] of vi.mocked(document.addEventListener).mock.calls)
    expect(vi.mocked(document.removeEventListener).mock.calls).toContainEqual([
      type,
      listener,
      options,
    ]);
});

it.each(['pause', 'resume'] as const)(
  'releases every listener and interval when %s loses its exact clock',
  (phase) => {
    const controller = createVideoTelemetryController();
    const anchor = {
      recordingId: 'clock-lost',
      generation: 1,
      streamInstanceId: 'source',
      revision: 1,
      phase: 'active' as const,
      captureEpochMs: performance.timeOrigin + 1000,
      mediaTimeSeconds: 0,
    };
    controller.enable(anchor.recordingId, 0, anchor);
    controller[phase](null);
    expect(controller.isEnabled()).toBe(false);
    expect(controller.disable()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  }
);

it('retains the confirmed prefix when a later clock measurement becomes unavailable', () => {
  const controller = createVideoTelemetryController();
  const anchor = {
    recordingId: 'prefix-retention',
    generation: 1,
    streamInstanceId: 'source',
    revision: 1,
    phase: 'active' as const,
    captureEpochMs: performance.timeOrigin + 1000,
    mediaTimeSeconds: 0,
  };
  const deliver = (stamp: number, key: string) => {
    const event = new KeyboardEvent('keydown', {
      key,
      code: `Key${key.toUpperCase()}`,
      ctrlKey: true,
    });
    Object.defineProperty(event, 'timeStamp', { value: stamp });
    sendTrusted(event);
  };
  controller.enable(anchor.recordingId, 0, anchor);
  deliver(1250, 'k');
  controller.pause({
    ...anchor,
    phase: 'paused',
    revision: 2,
    captureEpochMs: performance.timeOrigin + 1400,
    mediaTimeSeconds: 0.4,
  });
  controller.resume({
    ...anchor,
    revision: 3,
    captureEpochMs: performance.timeOrigin + 3000,
    mediaTimeSeconds: 0.4,
  });
  deliver(3250, 'j');
  controller.resume(null);
  const snapshot = controller.disable();
  expect(snapshot?.actionEvents.map((event) => event.time)).toEqual([0.25]);
  expect(vi.getTimerCount()).toBe(0);
});
it('uses a delivered native previous boundary to recover a missed pause without erasing an earlier event', () => {
  const controller = createVideoTelemetryController();
  const anchor = {
    recordingId: 'missing-phase-recovery',
    generation: 1,
    streamInstanceId: 'source',
    revision: 1,
    phase: 'active' as const,
    captureEpochMs: performance.timeOrigin + 1000,
    mediaTimeSeconds: 0,
  };
  const deliver = (stamp: number, key: string) => {
    const event = new KeyboardEvent('keydown', {
      key,
      code: `Key${key.toUpperCase()}`,
      ctrlKey: true,
    });
    Object.defineProperty(event, 'timeStamp', { value: stamp });
    sendTrusted(event);
  };
  controller.enable(anchor.recordingId, 0, anchor);
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
  expect(controller.disable()?.actionEvents.map((event) => event.time)).toEqual([0.25, 0.65]);
  expect(vi.getTimerCount()).toBe(0);
});

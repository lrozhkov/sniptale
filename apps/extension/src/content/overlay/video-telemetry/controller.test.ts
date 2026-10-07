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

beforeEach(() => {
  vi.useFakeTimers();
  let counter = 0;
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => `id-${++counter}`) });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.getElementById('sniptale-controlled-cursor-overlay')?.remove();
  document.getElementById('sniptale-controlled-cursor-style')?.remove();
  document.getElementById('sniptale-controlled-cursor-hide-style')?.remove();
});

it('records cursor samples and click actions across enable pause resume and disable', () => {
  const controller = createVideoTelemetryController();

  controller.enable('recording-1');
  document.dispatchEvent(createPointerLikeEvent(40, 60));
  document.dispatchEvent(
    new MouseEvent('click', { bubbles: true, detail: 1, clientX: 40, clientY: 60 })
  );
  controller.pause();
  vi.advanceTimersByTime(24);
  document.dispatchEvent(createPointerLikeEvent(90, 120));
  controller.resume();
  vi.advanceTimersByTime(24);
  document.dispatchEvent(createPointerLikeEvent(120, 160));

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
  document.dispatchEvent(createPointerLikeEvent(10, 10));
  vi.advanceTimersByTime(10);
  document.dispatchEvent(createPointerLikeEvent(11, 11));
  vi.advanceTimersByTime(10);
  document.dispatchEvent(createPointerLikeEvent(12, 12));
  document.dispatchEvent(
    new MouseEvent('click', { bubbles: true, detail: 1, clientX: 12, clientY: 12 })
  );

  const snapshot = controller.disable();

  expect(snapshot?.cursorTrack?.samples.length).toBeGreaterThanOrEqual(3);
  expect(snapshot?.cursorTrack?.samples.at(-1)).toEqual(expect.objectContaining({ x: 12, y: 12 }));
});

it('returns stable initial viewport proof for an unchanged recording', () => {
  const controller = createVideoTelemetryController();
  controller.enable('static-recording');
  document.dispatchEvent(
    new MouseEvent('click', { bubbles: true, detail: 1, clientX: 40, clientY: 60 })
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
    document.dispatchEvent(event);
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
    document.dispatchEvent(event);
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

// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { VideoProjectActionEventKind } from '../../../features/video/project/types';
import { createVideoTelemetryController } from './controller';

function createPointerLikeEvent(clientX: number, clientY: number): MouseEvent {
  return new MouseEvent('pointermove', { bubbles: true, clientX, clientY });
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
  document.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 40, clientY: 60 }));
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
  document.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 12, clientY: 12 }));

  const snapshot = controller.disable();

  expect(snapshot?.cursorTrack?.samples.length).toBeGreaterThanOrEqual(3);
  expect(snapshot?.cursorTrack?.samples.at(-1)).toEqual(expect.objectContaining({ x: 12, y: 12 }));
});

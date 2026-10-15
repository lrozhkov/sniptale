// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';

import {
  disableVideoTelemetry,
  enableVideoTelemetry,
  pauseVideoTelemetry,
  resumeVideoTelemetry,
} from '.';

function createPointerLikeEvent(clientX: number, clientY: number): MouseEvent {
  const eventName = 'onpointerrawupdate' in window ? 'pointerrawupdate' : 'pointermove';
  return new MouseEvent(eventName, { bubbles: true, clientX, clientY });
}

afterEach(() => {
  disableVideoTelemetry();
  document.getElementById('sniptale-controlled-cursor-overlay')?.remove();
  document.getElementById('sniptale-controlled-cursor-style')?.remove();
  document.getElementById('sniptale-controlled-cursor-hide-style')?.remove();
});

it('clears stale controlled cursor overlay artifacts when enabling the lazy telemetry owner', () => {
  document.body.innerHTML = `
    <div id="sniptale-controlled-cursor-overlay"></div>
    <style id="sniptale-controlled-cursor-style"></style>
    <style id="sniptale-controlled-cursor-hide-style"></style>
  `;

  enableVideoTelemetry('recording-3');

  expect(document.getElementById('sniptale-controlled-cursor-overlay')).toBeNull();
  expect(document.getElementById('sniptale-controlled-cursor-style')).toBeNull();
  expect(document.getElementById('sniptale-controlled-cursor-hide-style')).toBeNull();
});

it('proxies enable pause resume and disable through the lazy telemetry owner', () => {
  const listeners = vi.spyOn(document, 'addEventListener');
  enableVideoTelemetry('recording-2');
  pauseVideoTelemetry();
  resumeVideoTelemetry();

  const event = createPointerLikeEvent(12, 14);
  const listener = listeners.mock.calls.toReversed().find(([type]) => type === event.type)?.[1];
  const delivered = new Proxy(event, {
    get(target, key) {
      if (key === 'isTrusted') return true;
      const value = Reflect.get(target, key);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  if (typeof listener === 'function') listener.call(document, delivered);
  listeners.mockRestore();

  const snapshot = disableVideoTelemetry();
  expect(snapshot?.cursorTrack?.samples[0]).toEqual(
    expect.objectContaining({
      x: 12,
      y: 14,
    })
  );
});

// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';

import {
  disableVideoTelemetry,
  enableVideoTelemetry,
  pauseVideoTelemetry,
  resumeVideoTelemetry,
} from '.';

function createPointerLikeEvent(clientX: number, clientY: number): MouseEvent {
  return new MouseEvent('pointermove', { bubbles: true, clientX, clientY });
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
  enableVideoTelemetry('recording-2');
  pauseVideoTelemetry();
  resumeVideoTelemetry();

  document.dispatchEvent(createPointerLikeEvent(12, 14));

  const snapshot = disableVideoTelemetry();
  expect(snapshot?.cursorTrack?.samples[0]).toEqual(
    expect.objectContaining({
      x: 12,
      y: 14,
    })
  );
});

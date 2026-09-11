// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { createInitialState } from './state';
import { createTelemetryListeners } from './events';

afterEach(() => document.body.replaceChildren());

it('captures the clicked control name when its nested icon receives the click', () => {
  const state = createInitialState();
  const button = document.createElement('button');
  button.setAttribute('aria-label', 'Export recording');
  const icon = document.createElement('span');
  button.append(icon);
  document.body.append(button);
  button.addEventListener('click', createTelemetryListeners(state).click);
  icon.dispatchEvent(
    new MouseEvent('click', { bubbles: true, detail: 1, clientX: 20, clientY: 30 })
  );
  expect(state.actionEvents[0]).toMatchObject({
    kind: 'CLICK',
    point: { x: 20, y: 30 },
    data: { button: 0, targetTag: 'button', targetName: 'Export recording' },
  });
  expect(state.actionEvents[0]?.label).not.toContain('ripple');
});

it('keeps Enter as a key action without a synthetic click or cursor jump', () => {
  const state = createInitialState();
  state.lastKnownPointerPosition = { x: 120, y: 80 };
  const listeners = createTelemetryListeners(state);
  listeners.keyDown(new KeyboardEvent('keydown', { key: 'Enter' }));
  listeners.click(new MouseEvent('click', { detail: 0, clientX: 0, clientY: 0 }));
  expect(state.actionEvents.map((event) => event.kind)).toEqual(['KEY']);
  expect(state.lastKnownPointerPosition).toEqual({ x: 120, y: 80 });
  expect(state.cursorTrack).toBeNull();
});

it.each([1, 2])('retains actual pointer clicks at the origin with click count %s', (detail) => {
  const state = createInitialState();
  createTelemetryListeners(state).click(
    new MouseEvent('click', { detail, clientX: 0, clientY: 0 })
  );
  expect(state.actionEvents[0]).toMatchObject({ kind: 'CLICK', point: { x: 0, y: 0 } });
});

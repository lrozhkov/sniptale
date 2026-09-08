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
  icon.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 20, clientY: 30 }));
  expect(state.actionEvents[0]).toMatchObject({
    kind: 'CLICK',
    point: { x: 20, y: 30 },
    data: { button: 0, targetTag: 'button', targetName: 'Export recording' },
  });
  expect(state.actionEvents[0]?.label).not.toContain('ripple');
});

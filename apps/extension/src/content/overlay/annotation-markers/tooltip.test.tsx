// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { handleTooltipScroll } from './tooltip';

it('contains keyboard scrolling inside the annotation tooltip', () => {
  const tooltip = document.createElement('span');
  Object.defineProperties(tooltip, {
    clientHeight: { value: 100 },
    scrollHeight: { value: 300 },
  });
  const event = new KeyboardEvent('keydown', { cancelable: true, key: 'End' });

  handleTooltipScroll(event, tooltip);

  expect(event.defaultPrevented).toBe(true);
  expect(tooltip.scrollTop).toBe(200);
});

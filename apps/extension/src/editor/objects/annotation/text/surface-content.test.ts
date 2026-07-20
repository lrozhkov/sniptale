import { expect, it } from 'vitest';

import { getTextCalloutContentRect, getTextCalloutContentSize } from './surface-content';
import { setTextCalloutMeasuredContentHeight } from './surface-measurement';

function createTextbox(overrides: Record<string, unknown> = {}) {
  return {
    fontSize: 16,
    height: 40,
    sniptaleTextLayoutMode: 'fixed-width',
    sniptaleTextVerticalAlign: 'top',
    padding: 10,
    ...overrides,
  };
}

it('derives content size from body geometry and textbox padding', () => {
  const textbox = createTextbox();

  expect(
    getTextCalloutContentSize({ height: 120, width: 240 }, textbox as never, 'pointer')
  ).toEqual({
    height: 84,
    width: 168,
  });
});

it('uses measured content height for fixed-width vertical placement', () => {
  const textbox = createTextbox({
    height: 120,
    sniptaleTextVerticalAlign: 'bottom',
    padding: 0,
  });

  setTextCalloutMeasuredContentHeight(textbox as never, 48);

  expect(getTextCalloutContentRect({ height: 120, width: 240 }, textbox as never, 'plain')).toEqual(
    {
      height: 120,
      left: 0,
      top: 72,
      width: 240,
    }
  );
});

it('falls back to top alignment outside fixed-width layout', () => {
  const textbox = createTextbox({
    height: 40,
    sniptaleTextLayoutMode: 'auto',
    sniptaleTextVerticalAlign: 'bottom',
    padding: 0,
  });

  expect(getTextCalloutContentRect({ height: 120, width: 240 }, textbox as never, 'plain')).toEqual(
    {
      height: 120,
      left: 0,
      top: 0,
      width: 240,
    }
  );
});

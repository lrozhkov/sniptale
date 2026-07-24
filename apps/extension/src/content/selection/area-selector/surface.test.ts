// @vitest-environment jsdom

import { afterEach, expect, it } from 'vitest';
import { AREA_SELECTION_TOOLTIP_ID } from '@sniptale/ui/branding';
import { areaSelectionSurface } from './surface';

afterEach(() => {
  document.body.replaceChildren();
});

it('replaces the existing tooltip before mounting a new one', () => {
  areaSelectionSurface.showSelectionTooltip();
  areaSelectionSurface.showSelectionTooltip();

  expect(document.querySelectorAll(`#${AREA_SELECTION_TOOLTIP_ID}`)).toHaveLength(1);
});

it('owns selection element geometry and visibility', () => {
  const element = areaSelectionSurface.createSelectionElement();
  areaSelectionSurface.showSelectionElement(element, { startX: 40, startY: 50 });
  expect(element.style.left).toBe('40px');
  expect(element.style.top).toBe('50px');
  expect(element.style.width).toBe('0px');
  expect(element.style.height).toBe('0px');
  expect(element.style.display).toBe('block');

  areaSelectionSurface.updateSelectionBox(element, { startX: 40, startY: 50 }, { x: 10, y: 90 });
  expect(element.style.left).toBe('10px');
  expect(element.style.top).toBe('50px');
  expect(element.style.width).toBe('30px');
  expect(element.style.height).toBe('40px');

  areaSelectionSurface.hideSelectionElement(element);
  expect(element.style.display).toBe('none');

  areaSelectionSurface.removeSelectionElement(element);
  expect(element.isConnected).toBe(false);
});

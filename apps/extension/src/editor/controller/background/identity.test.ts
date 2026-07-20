import { Rect } from 'fabric';
import { expect, it } from 'vitest';

import { findBackgroundLayer, isManagedBackgroundObject } from './identity';

it('detects managed background objects by role or type', () => {
  const byRole = new Rect({});
  byRole.sniptaleRole = 'background';
  const byType = new Rect({});
  byType.sniptaleType = 'background';
  const annotation = new Rect({});
  annotation.sniptaleRole = 'annotation';
  annotation.sniptaleType = 'rectangle';

  expect(isManagedBackgroundObject(byRole)).toBe(true);
  expect(isManagedBackgroundObject(byType)).toBe(true);
  expect(isManagedBackgroundObject(annotation)).toBe(false);
});

it('finds the managed background layer on a canvas', () => {
  const annotation = new Rect({});
  const background = new Rect({});
  background.sniptaleRole = 'background';
  const canvas = {
    getObjects: () => [annotation, background],
  };

  expect(findBackgroundLayer(canvas as never)).toBe(background);
});

import { Rect } from 'fabric';
import { expect, it } from 'vitest';

import {
  applyRectangleShapeGeometry,
  normalizeScaledRectangleTarget,
} from './shape-style-rectangle';

it('normalizes scaled annotation rectangle geometry while preserving visual radius intent', () => {
  const rect = new Rect({ height: 20, left: 10, scaleX: -2, scaleY: 0, top: 20, width: 40 });
  rect.sniptaleRole = 'annotation';
  rect.sniptaleType = 'rectangle';
  rect.sniptaleShapeRadius = Number.NaN;
  rect.ry = 5;

  expect(normalizeScaledRectangleTarget(rect)).toBe(true);

  expect(rect.scaleX).toBe(1);
  expect(rect.scaleY).toBe(1);
  expect(rect.rx).toBe(0);
  expect(rect.ry).toBe(0);
});

it('ignores non-target and already-normalized rectangles', () => {
  const rect = new Rect({ height: 20, scaleX: 1, scaleY: 1, width: 40 });

  expect(normalizeScaledRectangleTarget(rect)).toBe(false);

  rect.sniptaleRole = 'annotation';
  rect.sniptaleType = 'rectangle';
  expect(normalizeScaledRectangleTarget(rect)).toBe(false);
});

it('restores rectangle center through left/top fallback when origin positioning is unavailable', () => {
  const rect = {
    height: 20,
    left: 10,
    scaleX: 2,
    scaleY: 1,
    set(values: Record<string, unknown>) {
      Object.assign(this, values);
    },
    strokeWidth: 2,
    top: 20,
    width: 40,
  };

  applyRectangleShapeGeometry(rect as never, {
    borderPresetId: null,
    customCss: '',
    fillColor: '#ffffff',
    fillOpacity: 1,
    inheritCustomCss: false,
    opacity: 1,
    radius: 100,
    shadow: 0,
    strokeColor: '#000000',
    strokeOpacity: 1,
    strokeStyle: 'solid',
    strokeWidth: 4,
  });

  expect(rect.width).toBe(39);
  expect(rect.left).toBe(11);
  expect((rect as Record<string, unknown>)['rx']).toBe(9);
});

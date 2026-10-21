// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';
import {
  bindFloatingInteractionPositionListeners,
  mergeFloatingInteractionLayerStyle,
  resolveToolbarSurfacePlacement,
} from './placement';

afterEach(() => {
  document.body.replaceChildren();
});

it.each(['up', 'down', 'side'] as const)(
  'uses one visible gap for %s single and paired surfaces',
  (placement) => {
    for (const surfaceInset of [0, 8]) {
      const result = resolveToolbarSurfacePlacement({
        anchor: { x: 109, y: 309, width: 32, height: 32 },
        toolbar: { x: 100, y: 300, width: 50, height: 50 },
        viewport: { width: 1000, height: 600 },
        width: 200 + surfaceInset * 2,
        height: 100 + surfaceInset * 2,
        placement,
        surfaceInset,
      });
      expect(result.left + surfaceInset).toBe(placement === 'side' ? 151 : 109);
      expect(result.top + surfaceInset).toBe(
        placement === 'up' ? 199 : placement === 'down' ? 351 : 309
      );
    }
  }
);

it('limits an oversized surface without moving its near edge across the toolbar', () => {
  const result = resolveToolbarSurfacePlacement({
    anchor: { x: 900, y: 200, width: 32, height: 32 },
    toolbar: { x: 800, y: 190, width: 192, height: 50 },
    viewport: { width: 1000, height: 360 },
    width: 600,
    height: 500,
    placement: 'down',
  });
  expect(result).toEqual({ left: 392, top: 241, maxWidth: 984, maxHeight: 111 });
});

it('adds pointer ownership and a maximum layer z-index without replacing caller geometry', () => {
  expect(mergeFloatingInteractionLayerStyle({ left: 24, width: 180 })).toEqual({
    left: 24,
    pointerEvents: 'auto',
    width: 180,
    zIndex: 2147483647,
  });
  expect(mergeFloatingInteractionLayerStyle({ pointerEvents: 'none', zIndex: 20 }).zIndex).toBe(20);
});

it('updates immediately without listeners when no anchor is available', () => {
  const update = vi.fn();

  const cleanup = bindFloatingInteractionPositionListeners(null, update);

  expect(update).toHaveBeenCalledTimes(1);
  expect(cleanup).toBeUndefined();
});

it('listens to owning light-dom and shadow-dom scroll parents', () => {
  const update = vi.fn();
  const lightParent = document.createElement('div');
  const lightAnchor = document.createElement('button');
  lightParent.append(lightAnchor);
  document.body.append(lightParent);
  const host = document.createElement('div');
  const shadow = host.attachShadow({ mode: 'open' });
  const shadowAnchor = document.createElement('button');
  shadow.append(shadowAnchor);
  document.body.append(host);

  const cleanupLight = bindFloatingInteractionPositionListeners(lightAnchor, update);
  const cleanupShadow = bindFloatingInteractionPositionListeners(shadowAnchor, update);

  lightParent.dispatchEvent(new Event('scroll'));
  shadow.dispatchEvent(new Event('scroll'));
  expect(update).toHaveBeenCalledTimes(4);

  cleanupLight?.();
  cleanupShadow?.();
  lightParent.dispatchEvent(new Event('scroll'));
  shadow.dispatchEvent(new Event('scroll'));
  expect(update).toHaveBeenCalledTimes(4);
});

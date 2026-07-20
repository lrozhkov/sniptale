// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';
import {
  bindFloatingInteractionPositionListeners,
  mergeFloatingInteractionLayerStyle,
} from './placement';

afterEach(() => {
  document.body.replaceChildren();
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

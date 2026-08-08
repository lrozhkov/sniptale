// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';

vi.mock('../../platform/dom-host', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/dom-host')>()),
  appendToContentOverlayRoot: (element: HTMLElement) => document.body.append(element),
}));

import {
  ensureQuickEditHoverOverlay,
  hideQuickEditHoverOverlay,
  removeQuickEditHoverOverlay,
  showQuickEditHoverOverlay,
} from './overlay.hover';
import { createQuickEditOverlayState } from './overlay.state';

afterEach(() => document.body.replaceChildren());

it('projects the hover stroke outside the padded content box', () => {
  const target = document.createElement('div');
  Object.defineProperty(target, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ x: 12, y: 8, left: 12, top: 8, width: 64, height: 64 }),
  });
  const state = createQuickEditOverlayState();

  showQuickEditHoverOverlay(state, target);

  expect(state.hoverOverlay?.style.boxSizing).toBe('content-box');
  expect(state.hoverOverlay?.style.left).toBe('6px');
  expect(state.hoverOverlay?.style.top).toBe('2px');
  expect(state.hoverOverlay?.style.width).toBe('70px');
  expect(state.hoverOverlay?.style.height).toBe('70px');

  const originalOverlay = state.hoverOverlay;
  expect(ensureQuickEditHoverOverlay(state)).toBe(originalOverlay);
  hideQuickEditHoverOverlay(state);
  expect(state.hoverOverlay?.style.display).toBe('none');
  removeQuickEditHoverOverlay(state);
  expect(state.hoverOverlay).toBeNull();
});

it('allows hide and removal before the hover overlay is created', () => {
  const state = createQuickEditOverlayState();
  hideQuickEditHoverOverlay(state);
  removeQuickEditHoverOverlay(state);
  expect(state.hoverOverlay).toBeNull();
});

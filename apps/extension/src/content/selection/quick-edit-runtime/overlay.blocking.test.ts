// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';

vi.mock('../../platform/dom-host', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/dom-host')>()),
  appendToContentOverlayRoot: (element: HTMLElement) => document.body.append(element),
}));

import {
  ensureQuickEditBlockingOverlay,
  hideQuickEditBlockingOverlay,
  removeQuickEditBlockingOverlay,
  showQuickEditBlockingOverlay,
  updateQuickEditBlockingOverlayShape,
} from './overlay.blocking';
import { createQuickEditOverlayState } from './overlay.state';

afterEach(() => document.body.replaceChildren());

it('projects the active stroke outside the padded content box', () => {
  const target = document.createElement('div');
  Object.defineProperty(target, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ x: 12, y: 8, left: 12, top: 8, width: 64, height: 64 }),
  });
  const state = createQuickEditOverlayState();

  ensureQuickEditBlockingOverlay(state);
  updateQuickEditBlockingOverlayShape(state, target);

  expect(state.activeFrameOverlay?.style.boxSizing).toBe('content-box');
  expect(state.activeFrameOverlay?.style.left).toBe('6px');
  expect(state.activeFrameOverlay?.style.top).toBe('2px');
  expect(state.activeFrameOverlay?.style.width).toBe('70px');
  expect(state.activeFrameOverlay?.style.height).toBe('70px');

  const originalOverlay = state.blockingOverlay;
  ensureQuickEditBlockingOverlay(state);
  expect(state.blockingOverlay).toBe(originalOverlay);
  showQuickEditBlockingOverlay(state);
  expect(state.blockingOverlay?.style.display).toBe('block');
  hideQuickEditBlockingOverlay(state);
  expect(state.blockingOverlay?.style.display).toBe('none');
  expect(state.activeFrameOverlay?.style.display).toBe('none');
  removeQuickEditBlockingOverlay(state);
  expect(state.blockingOverlay).toBeNull();
  expect(state.activeFrameOverlay).toBeNull();
});

it('ignores shape updates before the blocking overlay is created', () => {
  const state = createQuickEditOverlayState();
  updateQuickEditBlockingOverlayShape(state, document.createElement('div'));
  expect(state.activeFrameOverlay).toBeNull();
});
